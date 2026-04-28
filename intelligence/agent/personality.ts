import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { downloadJSON } from "../../0g/client.js";
import type { NFTPersonality } from "../../0g/schema.js";

const INFT_ABI = [
  "function getIntelligence(uint256 tokenId) external view returns (tuple(string personalityHash, string memoryHash, address portfolioManager, uint8 riskLevel, bool isActive))",
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

export async function loadPersonality(nftId: number): Promise<NFTPersonality> {
  const inft = getContract();
  const intel = await inft.getIntelligence(nftId);
  const cid: string = intel.personalityHash;
  if (!cid) throw new Error(`iNFT #${nftId} has no personalityHash on-chain`);

  try {
    return await downloadJSON<NFTPersonality>(cid);
  } catch {
    // 0G testnet node may not have the file — reconstruct from on-chain riskLevel
    const riskLevel = Number(intel.riskLevel);
    const style: NFTPersonality["style"] =
      riskLevel >= 7 ? "aggressive" : riskLevel >= 4 ? "balanced" : "conservative";
    console.error(`[personality] 0G download failed for CID ${cid} — using on-chain fallback`);
    return {
      nftId,
      name: `AlphaBot`,
      ensName: `alpha-nft.eth`,
      riskTolerance: riskLevel,
      style,
      preferredAssets: ["ETH", "USDC"],
      maxPositionPct: 20,
      createdAt: Date.now(),
    };
  }
}
