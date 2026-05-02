import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { uploadJSON, downloadJSON } from "../../0g/client.js";
import type { TradeMemory, TradeRecord } from "../../0g/schema.js";

const MEMORY = chalk.hex('#d7af5f').bold('[Memory]');

const INFT_ABI = [
  "function getIntelligence(uint256 tokenId) external view returns (tuple(string personalityHash, string memoryHash, address portfolioManager, uint8 riskLevel, bool isActive))",
  "function updateMemory(uint256 tokenId, string calldata newCID) external",
];

function getContract(): ethers.Contract {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  if (!rpcUrl) throw new Error("RPC_URL not set");
  if (!privateKey) throw new Error("PRIVATE_KEY not set");

  const deploymentsPath = path.resolve("deployments.json");
  if (!fs.existsSync(deploymentsPath)) throw new Error("deployments.json not found");
  const { iNFT } = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  if (!iNFT?.address) throw new Error("iNFT address not found in deployments.json");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  return new ethers.Contract(iNFT.address, INFT_ABI, wallet);
}

export async function loadMemory(nftId: number): Promise<TradeMemory> {
  const inft = getContract();
  const intel = await inft.getIntelligence(nftId);
  const cid: string = intel.memoryHash;

  if (!cid) {
    console.log(`${MEMORY} iNFT #${nftId} — no memory on-chain yet, starting fresh`);
    return { nftId, trades: [], totalPnL: 0, lastUpdated: Date.now() };
  }

  try {
    const memory = await downloadJSON<TradeMemory>(cid);
    console.log(`${MEMORY} loaded ${chalk.bold(memory.trades.length)} trade${memory.trades.length !== 1 ? "s" : ""} · P&L ${memory.totalPnL >= 0 ? "+" : ""}$${memory.totalPnL.toFixed(2)} · CID ${chalk.dim(cid.slice(0, 8) + "…")}`);
    return memory;
  } catch {
    console.error(`${MEMORY} 0G download failed for CID ${chalk.dim(cid.slice(0, 8) + "…")} — starting with empty memory`);
    return { nftId, trades: [], totalPnL: 0, lastUpdated: Date.now() };
  }
}

export async function appendTrade(nftId: number, record: TradeRecord): Promise<string> {
  let memory: TradeMemory;
  try {
    memory = await loadMemory(nftId);
  } catch {
    memory = { nftId, trades: [], totalPnL: 0, lastUpdated: Date.now() };
  }

  // append-only — never overwrite
  memory.trades.push(record);
  memory.lastUpdated = Date.now();

  console.log(`${MEMORY} uploading trade #${memory.trades.length} to 0G…`);
  const inft = getContract();
  const newCid = await uploadJSON(memory);
  const tx = await inft.updateMemory(nftId, newCid);
  await tx.wait();

  console.log(`${MEMORY} saved · new CID ${chalk.dim(newCid.slice(0, 8) + "…")} · tx ${chalk.dim(tx.hash.slice(0, 10) + "…")}`);
  return newCid;
}
