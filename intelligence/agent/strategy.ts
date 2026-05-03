import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import chalk from "chalk";
import { etherscanTx } from "../../cli/link.js";
import { loadPersonality } from "./personality.js";
import { handleToolCall } from "./tools.js";
import { clearInstruction } from "./ens.js";
import type { NFTPersonality } from "../../0g/schema.js";
import type { PoolConfig } from "./tools.js";

const AGENT = chalk.hex('#87afd7').bold('[Agent]');

// Force CJS build — the ESM chunks in 0g-serving-broker v0.7.5 are broken
// (lib.esm/*.js are CJS files but index.mjs imports named exports from them)
const _require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = _require("@0glabs/0g-serving-broker") as typeof import("@0glabs/0g-serving-broker");

export interface AgentResult {
  decision: "buy" | "sell" | "hold";
  reason: string;
  txHash: string | null;
  trace: ToolCallRecord[];
}

export interface StreamCallbacks {
  toolStart?: (tool: string) => void;
  toolDone?: (tool: string, summary?: string) => void;
  toolError?: (tool: string, error: string) => void;
}

function toolSummary(tool: string, args: Record<string, unknown>, result: unknown): string | undefined {
  try {
    if (tool === "read_memory") {
      const r = result as { memory?: { trades?: unknown[]; totalPnL?: number } };
      const count = r.memory?.trades?.length ?? 0;
      const pnl = r.memory?.totalPnL ?? 0;
      return `${count} trade${count !== 1 ? "s" : ""} · ${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(0)}`;
    }
    if (tool === "get_market_data") {
      const sym = (args["token"] as string | undefined) ?? "";
      const r = result as { price?: number; change24h?: number };
      const price = (r.price ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
      const chg = r.change24h ?? 0;
      return `${sym} $${price} ${chg >= 0 ? "↑" : "↓"}${Math.abs(chg).toFixed(1)}%`;
    }
    if (tool === "get_portfolio_balance") {
      const r = result as Record<string, string>;
      return Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(" · ");
    }
    if (tool === "read_ens_instructions") {
      return result ? `"${String(result).slice(0, 40)}"` : "(none)";
    }
    if (tool === "execute_trade") {
      const r = result as { txHash?: string };
      const h = r.txHash;
      if (h && h !== "0xstub") return etherscanTx(`${h.slice(0, 6)}…${h.slice(-4)} ↗`, h);
    }
    if (tool === "write_memory") {
      const r = result as { newCid?: string };
      if (r.newCid) return `CID: ${r.newCid.slice(0, 6)}...${r.newCid.slice(-3)} ↗`;
    }
  } catch { /* ignore summary errors */ }
  return undefined;
}

export interface ToolCallRecord {
  tool: string;
  args: unknown;
  result: unknown;
}

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatResponse {
  choices: {
    message: Message;
    finish_reason: string;
  }[];
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_memory",
      description: "Load the NFT's trade history and personality from 0G Storage.",
      parameters: {
        type: "object",
        properties: {
          nft_id: { type: "number", description: "The NFT token ID" },
        },
        required: ["nft_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_data",
      description: "Get current price, 24h change, and volume for a token.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "Token symbol, e.g. ETH, USDC, WBTC" },
        },
        required: ["token"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_portfolio_balance",
      description: "Get current portfolio token balances.",
      parameters: {
        type: "object",
        properties: {
          nft_id: { type: "number", description: "The NFT token ID" },
        },
        required: ["nft_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_ens_instructions",
      description: "Read any pending human instructions stored in the NFT's ENS text record.",
      parameters: {
        type: "object",
        properties: {
          nft_id: { type: "number", description: "The NFT token ID" },
        },
        required: ["nft_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_trade",
      description: "Execute a token swap on Uniswap V3.",
      parameters: {
        type: "object",
        properties: {
          nft_id: { type: "number" },
          action: { type: "string", enum: ["buy", "sell"] },
          token_in: { type: "string", description: "Token to sell, e.g. USDC" },
          token_out: { type: "string", description: "Token to buy, e.g. ETH" },
          amount_in: { type: "string", description: "Human-readable token amount to sell, e.g. '10' for 10 tokens (NOT wei). Must not exceed the balance returned by get_portfolio_balance." },
        },
        required: ["nft_id", "action", "token_in", "token_out", "amount_in"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_memory",
      description: "Persist the trade decision to 0G Storage and update on-chain memoryHash. Must be called as the final action every cycle.",
      parameters: {
        type: "object",
        properties: {
          nft_id: { type: "number" },
          action: { type: "string", enum: ["buy", "sell", "hold"] },
          token_in: { type: "string" },
          token_out: { type: "string" },
          amount_in: { type: "string" },
          amount_out: { type: "string" },
          tx_hash: { type: "string" },
          reason: { type: "string" },
          price_at_execution: { type: "number" },
        },
        required: ["nft_id", "action", "token_in", "token_out", "amount_in", "amount_out", "reason", "price_at_execution"],
      },
    },
  },
];

function buildSystemPrompt(personality: NFTPersonality, poolConfig?: PoolConfig): string {
  const tokenNote = poolConfig?.tokens
    ? `\nAvailable token symbols for this pool: ${Object.keys(poolConfig.tokens).join(", ")} (use these exact symbols in execute_trade).`
    : "";
  const feeNote = poolConfig?.fee ? `\nPool fee tier: ${poolConfig.fee} (${poolConfig.fee / 10000}%).` : "";

  return `You are ${personality.name}, an autonomous DeFi portfolio manager NFT (token #${personality.nftId}).

ENS: ${personality.ensName}
Risk tolerance: ${personality.riskTolerance}/10 (${personality.style})
Preferred assets: ${personality.preferredAssets.join(", ")}
Max position: ${personality.maxPositionPct}% of portfolio${tokenNote}${feeNote}

Your job each cycle:
1. Call read_memory to review your trade history and personality.
2. Call get_market_data for relevant tokens.
3. Call get_portfolio_balance to know your exact token balances before making any trade decision.
4. Optionally call read_ens_instructions for human overrides.
5. Decide: buy, sell, or hold. When trading, amount_in MUST be ≤ the balance shown by get_portfolio_balance AND must not exceed ${personality.riskTolerance * 10}% of that balance (on-chain contract limit: riskLevel ${personality.riskTolerance} × 10%). If execute_trade returns an error, reduce amount_in and retry.
6. If trading, call execute_trade.
7. ALWAYS call write_memory last (after execute_trade) to record the final decision with the real txHash.

Think like a ${personality.style} trader. Be concise in reasoning.`;
}


export async function runAgent(nftId: number, poolConfig?: PoolConfig, stream?: StreamCallbacks): Promise<AgentResult> {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const providerAddress = process.env.ZERO_G_PROVIDER_ADDRESS;
  // 0G EVM testnet — separate from Sepolia. Override via ZERO_G_EVM_RPC if needed.
  const zgEvmRpc = process.env.ZERO_G_EVM_RPC ?? "https://evmrpc-testnet.0g.ai";
  if (!rpcUrl) throw new Error("RPC_URL not set");
  if (!privateKey) throw new Error("PRIVATE_KEY not set");
  if (!providerAddress) throw new Error("ZERO_G_PROVIDER_ADDRESS not set");

  // 0G EVM wallet — for the broker (contracts live on 0G network, not Sepolia)
  const zgProvider = new ethers.JsonRpcProvider(zgEvmRpc);
  const zgWallet = new ethers.Wallet(privateKey, zgProvider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broker = await createZGComputeNetworkBroker(zgWallet as any);
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  const personality = await loadPersonality(nftId);

  const messages: Message[] = [
    { role: "system", content: buildSystemPrompt(personality, poolConfig) },
    { role: "user", content: `Run your portfolio management cycle for iNFT #${nftId}. Make a decision and record it.` },
  ];

  const trace: ToolCallRecord[] = [];
  const lastTxHash: { value: string | null } = { value: null };
  const pendingEnsInstruction: { value: string | null } = { value: null };
  const ensName = process.env.ENS_NAME ?? personality.ensName;
  let decision: "buy" | "sell" | "hold" = "hold";
  let finalReason = "No decision recorded";

  // tool-use loop
  while (true) {
    const headers = await broker.inference.getRequestHeaders(providerAddress);

    const res = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: "auto" }),
    });

    if (!res.ok) {
      const errText = await res.text();
      // Retry once on rate limit (429) after a 10-second backoff
      if (res.status === 429) {
        console.error(`${AGENT} Rate limited — waiting 10s before retry`);
        await new Promise((r) => setTimeout(r, 10_000));
        continue;
      }
      throw new Error(`0G Compute request failed (${res.status}): ${errText}`);
    }

    const data = await res.json() as ChatResponse;
    const choice = data.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    if (choice.finish_reason === "stop" || !assistantMessage.tool_calls?.length) {
      if (assistantMessage.content) finalReason = assistantMessage.content;
      break;
    }

    for (const tc of assistantMessage.tool_calls) {
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      stream?.toolStart?.(tc.function.name);
      let result: unknown;
      try {
        result = await handleToolCall(tc.function.name, args, { nftId, ensName, lastTxHash, pendingEnsInstruction, poolConfig });
        stream?.toolDone?.(tc.function.name, toolSummary(tc.function.name, args, result));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        result = { error: errMsg };
        stream?.toolError?.(tc.function.name, errMsg);
      }

      trace.push({ tool: tc.function.name, args, result });

      // extract decision from write_memory call
      if (tc.function.name === "write_memory") {
        decision = args["action"] as "buy" | "sell" | "hold";
        finalReason = args["reason"] as string;
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  // T-073: clear ENS instruction after agent processes it — runs on mainnet via ens.ts
  if (pendingEnsInstruction.value) {
    await clearInstruction(ensName, privateKey);
  }

  // T-051: verify read_memory and get_market_data were called
  const toolsUsed = new Set(trace.map((r) => r.tool));
  const requiredTools = ["read_memory", "get_market_data"];
  const missingTools = requiredTools.filter((t) => !toolsUsed.has(t));
  if (missingTools.length > 0) {
    console.warn(`${AGENT} WARNING T-051: required tool(s) not called: ${missingTools.join(", ")}`);
  }

  // T-052: verify write_memory was the final tool call
  const lastTraceTool = trace[trace.length - 1]?.tool;
  if (lastTraceTool !== "write_memory") {
    console.warn(`${AGENT} WARNING T-052: last tool was '${lastTraceTool ?? "none"}', expected 'write_memory'`);
  }

  // T-054: persist trace log
  const logsDir = path.resolve("intelligence/logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `run-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ nftId, decision, reason: finalReason, trace, timestamp: new Date().toISOString() }, null, 2));

  return { decision, reason: finalReason, txHash: lastTxHash.value, trace };
}
