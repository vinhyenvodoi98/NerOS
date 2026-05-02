import "dotenv/config";
import React from "react";
import { render } from "ink";
import { program } from "commander";
import { runAgent } from "../../intelligence/agent/strategy.js";
import type { PoolConfig } from "../../intelligence/agent/tools.js";
import { loadPersonality } from "../../intelligence/agent/personality.js";
import { loadMemory } from "../../intelligence/agent/memory.js";
import { resolveNftId } from "../session.js";
import { AgentStream } from "../stream.js";
import { App } from "../renderer.js";

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
const hasPoolConfig = Object.keys(poolConfig).length > 0;

const [personality, memory] = await Promise.all([
  loadPersonality(nftId),
  loadMemory(nftId),
]);
const cycleCount = memory.trades.length + 1;
const stream = new AgentStream();

const { waitUntilExit } = render(
  React.createElement(App, { personality, memoryCID: undefined, cycleCount, stream })
);

const start = Date.now();
runAgent(nftId, hasPoolConfig ? poolConfig : undefined, {
  toolStart: (t) => stream.toolStart(t),
  toolDone: (t, s) => stream.toolDone(t, s),
  toolError: (t, e) => stream.toolError(t, e),
}).then((result) => {
  const elapsed = (Date.now() - start) / 1000;
  stream.decision(result.decision, result.reason, result.txHash, cycleCount, elapsed);
}).catch((err) => {
  stream.toolError("agent", err instanceof Error ? err.message : String(err));
  setTimeout(() => process.exit(1), 200);
});

await waitUntilExit();
