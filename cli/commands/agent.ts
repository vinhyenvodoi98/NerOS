import "dotenv/config";
import { program } from "commander";
import { runAgent } from "../../intelligence/agent/strategy.js";
import type { PoolConfig } from "../../intelligence/agent/tools.js";
import { resolveNftId } from "../session.js";

// Parse "SYMBOL:ADDRESS:DECIMALS" → [symbol, {address, decimals}]
function parseTokenFlag(raw: string): [string, { address: string; decimals: number }] {
  const parts = raw.split(":");
  if (parts.length !== 3) throw new Error(`Invalid --token format "${raw}". Expected SYMBOL:ADDRESS:DECIMALS (e.g. WETH:0x...:18)`);
  const [symbol, address, dec] = parts;
  const decimals = parseInt(dec, 10);
  if (isNaN(decimals)) throw new Error(`Invalid decimals in "${raw}"`);
  return [symbol.toUpperCase(), { address, decimals }];
}

program
  .option("--nft-id <n>", "NFT token ID", parseInt)
  .option("--pool-fee <n>", "Uniswap V3 pool fee tier (500 | 3000 | 10000)", parseInt)
  .option("--token-a <SYMBOL:ADDRESS:DECIMALS>", "Override/add token A (e.g. WETH:0xabc:18)")
  .option("--token-b <SYMBOL:ADDRESS:DECIMALS>", "Override/add token B (e.g. USDC:0xdef:6)")
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

console.log(`\n[Agent] Starting portfolio cycle for iNFT #${nftId}...`);
if (poolConfig.fee) console.log(`[Agent] Pool fee override: ${poolConfig.fee}`);
if (poolConfig.tokens) console.log(`[Agent] Token overrides: ${Object.keys(poolConfig.tokens).join(", ")}`);
const start = Date.now();

const result = await runAgent(nftId, Object.keys(poolConfig).length ? poolConfig : undefined);

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const toolsCalled = result.trace.map((r) => r.tool);

console.log("\n─── Tool Call Trace ──────────────────────────────────────");
for (const record of result.trace) {
  const summary =
    record.tool === "get_market_data"
      ? ` · ${(record.args as { token?: string })?.token ?? ""} $${(record.result as { price?: number })?.price ?? ""}`
      : record.tool === "write_memory"
        ? ` · ${(record.args as { action?: string })?.action?.toUpperCase() ?? ""}`
        : "";
  console.log(`  ✓ ${record.tool}${summary}`);
}
console.log("──────────────────────────────────────────────────────────");

// T-051 surface
const missing = ["read_memory", "get_market_data"].filter((t) => !toolsCalled.includes(t));
if (missing.length > 0) {
  console.warn(`\n⚠  T-051 FAIL: missing tool calls: ${missing.join(", ")}`);
} else {
  console.log("\n✓  T-051 PASS: read_memory + get_market_data called");
}

// T-052 surface
const lastTool = toolsCalled[toolsCalled.length - 1];
if (lastTool === "write_memory") {
  console.log("✓  T-052 PASS: write_memory was final tool call");
} else {
  console.warn(`⚠  T-052 FAIL: last tool was '${lastTool ?? "none"}', expected 'write_memory'`);
}

const badge = result.decision.toUpperCase();
console.log(`\nDecision: ${badge} · Cycle · Runtime ${elapsed}s`);
console.log(`Reason: ${result.reason}`);
if (result.txHash && result.txHash !== "0xstub") {
  console.log(`Tx: https://sepolia.etherscan.io/tx/${result.txHash}`);
}
