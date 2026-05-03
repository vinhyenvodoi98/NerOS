import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import React from "react";
import { render } from "ink";
import { program } from "commander";
import { runAgent, type ToolCallRecord } from "../../intelligence/agent/strategy.js";
import { loadPersonality } from "../../intelligence/agent/personality.js";
import { loadMemory } from "../../intelligence/agent/memory.js";
import { resolveNftId } from "../session.js";
import { AgentStream } from "../stream.js";
import { App } from "../renderer.js";
import { C, SEP } from "../theme.js";
import chalk from "chalk";

program
  .option("--nft-id <n>", "Default NFT token ID", parseInt)
  .parse(process.argv);

const opts = program.opts<{ nftId?: number }>();
const defaultNftId = resolveNftId(opts.nftId);

const PORT   = parseInt(process.env.WEBHOOK_PORT ?? "3000", 10);
const SECRET = process.env.WEBHOOK_SECRET ?? "";

let agentRunning = false;

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

interface SwapAction {
  contractAddress: string;
  functionName: string;
  abi: string[];
  args: unknown[];
  poolAddress: string;
  poolFee: number;
}

// T-172: Build KeeperHub web3/write-contract call data for PortfolioManager.executeTrade()
// using the custom pool from deployments.json. This lets KeeperHub execute the swap
// via its Turnkey wallet without PRIVATE_KEY on the local server.
function buildSwapAction(trace: ToolCallRecord[], nftId: number): SwapAction | null {
  let deployments: Record<string, { address?: string; fee?: number }>;
  try {
    deployments = JSON.parse(fs.readFileSync(path.resolve("deployments.json"), "utf8"));
  } catch {
    return null;
  }

  const pmAddress = deployments.PortfolioManager?.address;
  const poolAddress = (deployments.UniswapPool as { address?: string } | undefined)?.address ?? "";
  const poolFee = (deployments.UniswapPool as { fee?: number } | undefined)?.fee ?? 3000;

  if (!pmAddress) return null;

  const tokenMap: Record<string, { address: string; decimals: number }> = {};
  if (deployments.MockUSD?.address) tokenMap["USDC"] = { address: deployments.MockUSD.address, decimals: 18 };
  if (deployments.MockETH?.address) {
    tokenMap["WETH"] = { address: deployments.MockETH.address, decimals: 18 };
    tokenMap["ETH"]  = { address: deployments.MockETH.address, decimals: 18 };
  }

  const tradeCall = trace.find((t) => t.tool === "execute_trade");
  if (!tradeCall) return null;

  const tradeArgs = tradeCall.args as { token_in?: string; token_out?: string; amount_in?: string };
  const tokenInKey  = (tradeArgs.token_in  ?? "").toUpperCase();
  const tokenOutKey = (tradeArgs.token_out ?? "").toUpperCase();
  const tokenIn  = tokenMap[tokenInKey];
  const tokenOut = tokenMap[tokenOutKey];
  if (!tokenIn || !tokenOut) return null;

  const amountIn = ethers.parseUnits(
    parseFloat(tradeArgs.amount_in ?? "0").toFixed(tokenIn.decimals),
    tokenIn.decimals,
  );

  return {
    contractAddress: pmAddress,
    functionName: "executeTrade",
    abi: [
      "function executeTrade(uint256 nftId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint24 poolFee) external returns (uint256 amountOut)",
    ],
    args: [nftId, tokenIn.address, tokenOut.address, amountIn.toString(), "1", poolFee],
    poolAddress,
    poolFee,
  };
}

interface AgentRunResult {
  decision: string;
  reason: string;
  txHash: string | null;
  swapAction: SwapAction | null;
}

async function handleAgentRun(nftId: number): Promise<AgentRunResult> {
  const personality = await loadPersonality(nftId);
  let cycleCount = 1;
  try {
    const memory = await loadMemory(nftId);
    cycleCount = memory.trades.length + 1;
  } catch { /* 0G unavailable */ }

  const stream = new AgentStream();
  const { waitUntilExit } = render(
    React.createElement(App, { personality, memoryCID: undefined, cycleCount, stream })
  );

  const start = Date.now();
  let result: AgentRunResult = { decision: "hold", reason: "", txHash: null, swapAction: null };

  await new Promise<void>((resolve) => {
    runAgent(nftId, undefined, {
      toolStart: (t) => stream.toolStart(t),
      toolDone:  (t, s) => stream.toolDone(t, s),
      toolError: (t, e) => stream.toolError(t, e),
    }).then((r) => {
      const swapAction = ["buy", "sell"].includes(r.decision)
        ? buildSwapAction(r.trace, nftId)
        : null;
      result = { decision: r.decision, reason: r.reason, txHash: r.txHash, swapAction };
      const elapsed = (Date.now() - start) / 1000;
      stream.decision(r.decision, r.reason, r.txHash, cycleCount, elapsed);
      resolve();
    }).catch((err) => {
      stream.toolError("agent", err instanceof Error ? err.message : String(err));
      resolve();
    });
  });

  await waitUntilExit();
  return result;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/trigger") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (agentRunning) {
    res.writeHead(409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent already running" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  await new Promise<void>((resolve) => req.on("end", resolve));

  let nftId = defaultNftId;
  let bodySecret: string | undefined;
  try {
    const parsed = JSON.parse(body) as { nftId?: number; secret?: string };
    if (typeof parsed.nftId === "number") nftId = parsed.nftId;
    if (typeof parsed.secret === "string") bodySecret = parsed.secret;
  } catch { /* use default */ }

  const headerAuth = req.headers["authorization"] ?? "";
  const validHeader = SECRET && headerAuth === `Bearer ${SECRET}`;
  const validBody   = SECRET && bodySecret === SECRET;
  if (!validHeader && !validBody) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  agentRunning = true;
  console.log(`\n  ${chalk.dim(nowTime())}   ${chalk.hex(C.warning)("TRIGGER")}   nft #${nftId}`);

  try {
    const result = await handleAgentRun(nftId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    console.log(`  ${chalk.dim(nowTime())}   ${chalk.hex(C.success)("DONE")}      decision: ${result.decision}${result.swapAction ? " · swapAction included" : ""}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
    console.log(`  ${chalk.dim(nowTime())}   ${chalk.hex(C.error)("ERROR")}     ${msg}`);
  } finally {
    agentRunning = false;
  }
});

server.listen(PORT, () => {
  console.log();
  console.log(`  ${chalk.hex(C.brand).bold("◈ NerOS")}  ${chalk.dim("Webhook Server")}  ${chalk.dim("·")}  ${chalk.dim("listening")} ${chalk.hex(C.accent)(`:${PORT}`)}`);
  console.log(`  ${chalk.dim(SEP)}`);
  console.log(`  ${chalk.dim("POST /trigger")}   ${chalk.dim("Authorization: Bearer $WEBHOOK_SECRET")}`);
  console.log(`  ${chalk.dim(`Default NFT: #${defaultNftId}`)}`);
  console.log();
});
