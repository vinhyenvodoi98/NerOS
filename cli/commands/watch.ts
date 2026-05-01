import "dotenv/config";
import { program } from "commander";
import { watchAndRun } from "../../intelligence/keeper/runner.js";
import { resolveNftId } from "../session.js";
import type { PoolConfig } from "../../intelligence/agent/tools.js";

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

console.log(`[Keeper] Starting keeper watcher for iNFT #${nftId}...`);
await watchAndRun(nftId, Object.keys(poolConfig).length ? poolConfig : undefined);
