import "dotenv/config";
import { program } from "commander";
import { runAgent } from "../../intelligence/agent/strategy.js";
import { resolveNftId } from "../session.js";

program
  .option("--nft-id <n>", "NFT token ID", parseInt)
  .parse(process.argv);

const opts = program.opts<{ nftId?: number }>();
const nftId = resolveNftId(opts.nftId);

console.log(`\n[Agent] Starting portfolio cycle for iNFT #${nftId}...`);
const start = Date.now();

const result = await runAgent(nftId);

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
