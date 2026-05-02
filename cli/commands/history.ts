import "dotenv/config";
import React from "react";
import { render } from "ink";
import { program } from "commander";
import { loadMemory } from "../../intelligence/agent/memory.js";
import { loadPersonality } from "../../intelligence/agent/personality.js";
import { resolveNftId } from "../session.js";
import { HistoryApp } from "../components/HistoryApp.js";
import type { TradeMemory, NFTPersonality } from "../../0g/schema.js";

program
  .option("--nft-id <n>", "NFT token ID", parseInt)
  .parse(process.argv);

const opts = program.opts<{ nftId?: number }>();
const nftId = resolveNftId(opts.nftId);

async function fetchWithRetry(id: number, maxAttempts = 5): Promise<[TradeMemory, NFTPersonality]> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await Promise.all([loadMemory(id), loadPersonality(id)]);
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const notFinalized = err instanceof Error && err.message.includes("not finalized");
      const delay = notFinalized ? 10000 : 3000;
      const label = notFinalized ? "file not finalized on 0G, waiting 10s…" : "retrying in 3s…";
      process.stderr.write(`[0G] Download failed (attempt ${attempt}/${maxAttempts}), ${label}\n`);
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

let memory: TradeMemory;
let personality: NFTPersonality;
try {
  [memory, personality] = await fetchWithRetry(nftId);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\n[0G] Failed to load iNFT #${nftId} after all retries: ${msg}\n`);
  process.stderr.write(`     The 0G network may still be finalizing the upload. Try again in ~30s.\n\n`);
  process.exit(1);
}

const { unmount, waitUntilExit } = render(
  React.createElement(HistoryApp, { memory, personality })
);
setTimeout(unmount, 150);
await waitUntilExit();
