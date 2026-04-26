import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { loadPersonality } from "./personality.js";
import { loadMemory, appendTrade } from "./memory.js";
import { getPrice } from "./market.js";
import type { NFTPersonality, TradeMemory, TradeRecord } from "../../0g/schema.js";

export interface AgentResult {
  decision: "buy" | "sell" | "hold";
  reason: string;
  txHash: string | null;
  trace: ToolCallRecord[];
}

interface ToolCallRecord {
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
          amount_in: { type: "string", description: "Amount in smallest units" },
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

function buildSystemPrompt(personality: NFTPersonality): string {
  return `You are ${personality.name}, an autonomous DeFi portfolio manager NFT (token #${personality.nftId}).

ENS: ${personality.ensName}
Risk tolerance: ${personality.riskTolerance}/10 (${personality.style})
Preferred assets: ${personality.preferredAssets.join(", ")}
Max position: ${personality.maxPositionPct}% of portfolio

Your job each cycle:
1. Call read_memory to review your trade history and personality.
2. Call get_market_data for relevant tokens.
3. Optionally call get_portfolio_balance and read_ens_instructions.
4. Decide: buy, sell, or hold.
5. If trading, call execute_trade.
6. ALWAYS call write_memory last to record the decision.

Think like a ${personality.style} trader. Be concise in reasoning.`;
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  nftId: number,
  lastTxHash: { value: string | null },
): Promise<unknown> {
  switch (name) {
    case "read_memory": {
      const [memory, personality] = await Promise.all([
        loadMemory(nftId),
        loadPersonality(nftId),
      ]);
      return { memory, personality };
    }

    case "get_market_data": {
      const token = args["token"] as string;
      return getPrice(token);
    }

    case "get_portfolio_balance": {
      // stub — Day 3 will wire real PortfolioManager
      return { USDC: "100", ETH: "0.01" };
    }

    case "read_ens_instructions": {
      // stub — Day 3 will wire real ENS resolver
      return null;
    }

    case "execute_trade": {
      // stub — Day 3 will wire real PortfolioManager
      lastTxHash.value = "0xstub";
      return { txHash: "0xstub" };
    }

    case "write_memory": {
      const record: TradeRecord = {
        timestamp: Date.now(),
        action: args["action"] as "buy" | "sell" | "hold",
        tokenIn: args["token_in"] as string,
        tokenOut: args["token_out"] as string,
        amountIn: args["amount_in"] as string,
        amountOut: args["amount_out"] as string,
        txHash: (args["tx_hash"] as string | undefined) ?? lastTxHash.value,
        reason: args["reason"] as string,
        priceAtExecution: args["price_at_execution"] as number,
      };
      const newCid = await appendTrade(nftId, record);
      return { newCid };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function runAgent(nftId: number): Promise<AgentResult> {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const providerAddress = process.env.ZERO_G_PROVIDER_ADDRESS;
  if (!rpcUrl) throw new Error("RPC_URL not set");
  if (!privateKey) throw new Error("PRIVATE_KEY not set");
  if (!providerAddress) throw new Error("ZERO_G_PROVIDER_ADDRESS not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broker = await createZGComputeNetworkBroker(wallet as any);
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  const personality = await loadPersonality(nftId);

  const messages: Message[] = [
    { role: "system", content: buildSystemPrompt(personality) },
    { role: "user", content: `Run your portfolio management cycle for iNFT #${nftId}. Make a decision and record it.` },
  ];

  const trace: ToolCallRecord[] = [];
  const lastTxHash: { value: string | null } = { value: null };
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
      const result = await handleToolCall(tc.function.name, args, nftId, lastTxHash);

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

  // T-054: persist trace log
  const logsDir = path.resolve("intelligence/logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `run-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ nftId, decision, reason: finalReason, trace, timestamp: new Date().toISOString() }, null, 2));

  return { decision, reason: finalReason, txHash: lastTxHash.value, trace };
}
