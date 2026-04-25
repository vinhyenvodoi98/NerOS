import { config } from "dotenv";
config({ override: true });
import { uploadJSON, downloadJSON } from "./client.js";

const payload = { hello: "world" };

console.log("T-013: checking 0G testnet reachability...");
console.log(`Indexer: ${process.env.ZERO_G_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai"}`);

console.log("\nT-012: uploading { hello: 'world' }...");
const rootHash = await uploadJSON(payload);
console.log(`rootHash: ${rootHash}`);

console.log("\nDownloading back...");
const result = await downloadJSON<typeof payload>(rootHash);
console.log("Downloaded:", result);

const ok = result.hello === payload.hello;
if (!ok) throw new Error(`Mismatch: expected ${JSON.stringify(payload)}, got ${JSON.stringify(result)}`);

console.log("\n✓ Smoke test passed — upload/download round-trip OK");
console.log(`  rootHash: ${rootHash}`);
