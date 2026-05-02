import "dotenv/config";
import React from "react";
import { render } from "ink";
import { program } from "commander";
import { ethers } from "ethers";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { runAgent } from "../../intelligence/agent/strategy.js";
import type { PoolConfig } from "../../intelligence/agent/tools.js";
import { loadPersonality } from "../../intelligence/agent/personality.js";
import { loadMemory } from "../../intelligence/agent/memory.js";
import { resolveNftId } from "../session.js";
import { AgentStream } from "../stream.js";
import { App } from "../renderer.js";
import { C, SEP } from "../theme.js";
import { etherscanTx } from "../link.js";

function parseTokenFlag(raw: string): [string, { address: string; decimals: number }] {
  const parts = raw.split(":");
  if (parts.length !== 3)
    throw new Error(`Invalid --token format "${raw}". Expected SYMBOL:ADDRESS:DECIMALS`);
  const [symbol, address, dec] = parts;
  const decimals = parseInt(dec, 10);
  if (isNaN(decimals)) throw new Error(`Invalid decimals in "${raw}"`);
  return [symbol.toUpperCase(), { address, decimals }];
}

program
  .option("--nft-id <n>", "NFT token ID", parseInt)
  .option("--pool-fee <n>", "Uniswap V3 pool fee tier (500 | 3000 | 10000)", parseInt)
  .option("--token-a <SYMBOL:ADDRESS:DECIMALS>", "Override token A (e.g. WETH:0x...:18)")
  .option("--token-b <SYMBOL:ADDRESS:DECIMALS>", "Override token B (e.g. USDC:0x...:6)")
  .parse(process.argv);

const opts = program.opts<{ nftId?: number; poolFee?: number; tokenA?: string; tokenB?: string }>();
const nftId = resolveNftId(opts.nftId);

const poolConfig: PoolConfig = {};
if (opts.poolFee) poolConfig.fee = opts.poolFee;
if (opts.tokenA || opts.tokenB) {
  poolConfig.tokens = {};
  if (opts.tokenA) { const [sym, cfg] = parseTokenFlag(opts.tokenA); poolConfig.tokens[sym] = cfg; }
  if (opts.tokenB) { const [sym, cfg] = parseTokenFlag(opts.tokenB); poolConfig.tokens[sym] = cfg; }
}
const hasPoolConfig = Object.keys(poolConfig).length > 0;

const KEEPER_ABI = [
  "event UpkeepTriggered(uint256 timestamp)",
  "function lastRunTimestamp() external view returns (uint256)",
  "function INTERVAL() external view returns (uint256)",
];

if (!process.env.RPC_URL) throw new Error("RPC_URL not set");

function getKeeperAddress(): string {
  const deps = JSON.parse(
    fs.readFileSync(path.resolve("deployments.json"), "utf8"),
  ) as Record<string, { address: string }>;
  if (!deps.KeeperAdapter?.address)
    throw new Error("KeeperAdapter address not found in deployments.json — run deploy-keeper first");
  return deps.KeeperAdapter.address;
}

function fmtCountdown(secs: number): string {
  if (secs <= 0) return "now";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

// ── Activity log ───────────────────────────────────────────────────────────────

let activityHeaderShown = false;

type ActivityAction = "triggered" | "buy" | "sell" | "hold" | "error";

const ACTION_COLOR: Record<ActivityAction, string | undefined> = {
  triggered: C.warning,
  buy:       C.success,
  sell:      C.error,
  hold:      undefined,
  error:     C.error,
};

function printActivity(action: ActivityAction, detail?: string, txHash?: string | null): void {
  if (!activityHeaderShown) {
    console.log();
    console.log(`  ${chalk.bold('Activity')}`);
    console.log(`  ${chalk.dim(SEP)}`);
    activityHeaderShown = true;
  }
  const time    = nowTime();
  const color   = ACTION_COLOR[action];
  const isBold  = action === "buy" || action === "sell";
  const label   = action.toUpperCase().padEnd(9);
  const colored = color
    ? (isBold ? chalk.hex(color).bold(label) : chalk.hex(color)(label))
    : (isBold ? chalk.bold(label) : chalk.dim(label));

  const parts: string[] = [`  ${chalk.dim(time)}   ${colored}`];
  if (detail) parts.push(chalk.dim(detail));
  if (txHash) {
    const short = `${txHash.slice(0, 6)}…${txHash.slice(-4)} ↗`;
    parts.push(chalk.hex(C.accent)(etherscanTx(short, txHash)));
  }
  console.log(parts.join("   "));
}

// ── Countdown management ───────────────────────────────────────────────────────

let countdownInterval: ReturnType<typeof setInterval> | null = null;

function stopCountdown(): void {
  if (countdownInterval !== null) {
    clearInterval(countdownInterval);
    countdownInterval = null;
    process.stdout.write("\n");
  }
}

function startCountdown(remainingSec: number): void {
  let secs = Math.max(0, remainingSec);
  const tick = () => {
    const label = secs > 0
      ? `Next trigger in ${chalk.hex(C.warning)(fmtCountdown(secs))}`
      : chalk.hex(C.warning)("Waiting for trigger…");
    process.stdout.write(`\r  ${chalk.dim("·")}  ${label}   `);
    if (secs > 0) secs--;
  };
  tick();
  countdownInterval = setInterval(tick, 1000);
}

// ── Setup ──────────────────────────────────────────────────────────────────────

const provider      = new ethers.JsonRpcProvider(process.env.RPC_URL);
const keeperAddress = getKeeperAddress();
const keeper        = new ethers.Contract(keeperAddress, KEEPER_ABI, provider);

// Load personality for the header (best-effort — fall back to raw IDs if unavailable)
let nftName = `iNFT #${nftId}`;
let ensName = "";
try {
  const personality = await loadPersonality(nftId);
  nftName = personality.name;
  ensName = personality.ensName;
} catch { /* 0G unavailable — header shows raw ID */ }

console.log();
console.log(`  ${chalk.hex(C.brand).bold("◈ NerOS")}  ${chalk.dim("Keeper Watcher")}${ensName ? `  ${chalk.dim(" ".repeat(Math.max(0, 42 - "Keeper Watcher".length - nftName.length)))}${chalk.dim(ensName)}` : ""}`);
console.log(`  ${chalk.dim(SEP)}`);
console.log(`  ${chalk.bold(nftName)}   ${chalk.dim("Listening for triggers…")}   ${chalk.dim(keeperAddress)}`);
console.log();

const lastRun  = await (keeper.lastRunTimestamp() as Promise<bigint>);
const interval = await (keeper.INTERVAL()          as Promise<bigint>);
const nowSec   = BigInt(Math.floor(Date.now() / 1000));
const remaining = interval - (nowSec - lastRun);
startCountdown(remaining > 0n ? Number(remaining) : 0);

// ── Log polling (eth_newFilter not supported by most RPCs — use getLogs) ───────

const triggeredTopic = keeper.interface.getEvent("UpkeepTriggered")!.topicHash;
let fromBlock = await provider.getBlockNumber();
let agentRunning = false;

async function handleTrigger(): Promise<void> {
  if (agentRunning) return;
  agentRunning = true;
  stopCountdown();

  printActivity("triggered", "running agent…");

  let agentDecision: { decision: string; txHash?: string | null } | null = null;

  try {
    const personality = await loadPersonality(nftId);
    let cycleCount = 1;
    try {
      const memory = await loadMemory(nftId);
      cycleCount = memory.trades.length + 1;
    } catch { /* 0G unavailable — start at cycle 1 */ }
    const stream = new AgentStream();

    const { waitUntilExit } = render(
      <App personality={personality} memoryCID={undefined} cycleCount={cycleCount} stream={stream} />
    );

    const start = Date.now();
    runAgent(nftId, hasPoolConfig ? poolConfig : undefined, {
      toolStart: (t) => stream.toolStart(t),
      toolDone:  (t, s) => stream.toolDone(t, s),
      toolError: (t, e) => stream.toolError(t, e),
    }).then((result) => {
      agentDecision = result;
      const elapsed = (Date.now() - start) / 1000;
      stream.decision(result.decision, result.reason, result.txHash, cycleCount, elapsed);
    }).catch((err) => {
      stream.toolError("agent", err instanceof Error ? err.message : String(err));
    });

    await waitUntilExit();
  } catch (err) {
    printActivity("error", err instanceof Error ? err.message : String(err));
  }

  if (agentDecision) {
    const d = agentDecision as { decision: string; txHash?: string | null };
    printActivity(d.decision as ActivityAction, undefined, d.txHash ?? null);
  }

  agentRunning = false;

  const nowAfter     = BigInt(Math.floor(Date.now() / 1000));
  const lastRunAfter = await (keeper.lastRunTimestamp() as Promise<bigint>);
  const remainingAfter = interval - (nowAfter - lastRunAfter);
  console.log();
  startCountdown(remainingAfter > 0n ? Number(remainingAfter) : 0);
}

// Poll every 12 s (≈ 1 Sepolia block). eth_getLogs is universally supported.
setInterval(async () => {
  try {
    const toBlock = await provider.getBlockNumber();
    if (toBlock < fromBlock) return;

    const logs = await provider.getLogs({
      address: keeperAddress,
      topics:  [triggeredTopic],
      fromBlock,
      toBlock,
    });

    fromBlock = toBlock + 1;

    for (const _log of logs) {
      await handleTrigger();
      break; // one trigger per poll cycle — ignore rapid-fire duplicates
    }
  } catch { /* transient RPC error — retry next poll */ }
}, 12_000);

// Keep process alive — never resolves
await new Promise<never>(() => {});
