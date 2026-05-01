import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { runAgent } from "../agent/strategy.js";
import type { PoolConfig } from "../agent/tools.js";

const KEEPER_ABI = [
  "event UpkeepTriggered(uint256 timestamp)",
  "function checkUpkeep(bytes calldata) external view returns (bool upkeepNeeded, bytes memory performData)",
  "function lastRunTimestamp() external view returns (uint256)",
  "function INTERVAL() external view returns (uint256)",
];

function getKeeperAddress(): string {
  const deps = JSON.parse(
    fs.readFileSync(path.resolve("deployments.json"), "utf8"),
  ) as Record<string, { address: string }>;
  if (!deps.KeeperAdapter?.address)
    throw new Error("KeeperAdapter address not found in deployments.json — run deploy-keeper first");
  return deps.KeeperAdapter.address;
}

export async function watchAndRun(nftId: number, poolConfig?: PoolConfig): Promise<void> {
  if (!process.env.RPC_URL) throw new Error("RPC_URL not set");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const keeperAddress = getKeeperAddress();
  const keeper = new ethers.Contract(keeperAddress, KEEPER_ABI, provider);

  console.log(`[Keeper] KeeperAdapter: ${keeperAddress}`);
  console.log(`[Keeper] Watching for UpkeepTriggered events for iNFT #${nftId}...`);

  // Show time until next trigger
  const lastRun = await (keeper.lastRunTimestamp() as Promise<bigint>);
  const interval = await (keeper.INTERVAL() as Promise<bigint>);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const remaining = interval - (nowSec - lastRun);

  if (remaining > 0n) {
    console.log(`[Keeper] Next trigger in ~${remaining}s`);
  } else {
    console.log(`[Keeper] Ready to trigger (overdue by ${-remaining}s)`);
  }

  keeper.on("UpkeepTriggered", async (timestamp: bigint) => {
    const time = new Date(Number(timestamp) * 1000).toLocaleTimeString();
    console.log(`\n[Keeper] Triggered at ${time} → running agent...`);
    try {
      const result = await runAgent(nftId, poolConfig);
      const badge = result.decision.toUpperCase();
      console.log(`[Keeper] Agent completed: ${badge} · ${result.reason}`);
      if (result.txHash) {
        console.log(`[Keeper] Tx: https://sepolia.etherscan.io/tx/${result.txHash}`);
      }
    } catch (err) {
      console.error("[Keeper] Agent error:", err instanceof Error ? err.message : err);
    }
  });

  // Keep process alive — never resolves
  await new Promise<never>(() => {});
}
