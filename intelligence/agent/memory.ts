import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { uploadJSON, downloadJSON } from "../../0g/client.js";
import type { TradeMemory, TradeRecord } from "../../0g/schema.js";

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
    return { nftId, trades: [], totalPnL: 0, lastUpdated: Date.now() };
  }

  return downloadJSON<TradeMemory>(cid);
}

export async function appendTrade(nftId: number, record: TradeRecord): Promise<string> {
  const memory = await loadMemory(nftId);

  // append-only — never overwrite
  memory.trades.push(record);
  memory.lastUpdated = Date.now();

  const inft = getContract();
  const newCid = await uploadJSON(memory);
  const tx = await inft.updateMemory(nftId, newCid);
  await tx.wait();

  return newCid;
}
