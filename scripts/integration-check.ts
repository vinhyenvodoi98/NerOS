import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { uploadJSON, downloadJSON } from "../0g/client.js";
import type { NFTPersonality } from "../0g/schema.js";

const INFT_ABI = [
  "function mint(string calldata personalityCID, uint8 riskLevel) external returns (uint256 tokenId)",
  "function getIntelligence(uint256 tokenId) external view returns (tuple(string personalityHash, string memoryHash, address portfolioManager, uint8 riskLevel, bool isActive))",
  "event Minted(uint256 indexed tokenId, address indexed owner, string personalityCID)",
];

function getDeployedAddress(): string {
  const deploymentsPath = path.resolve("deployments.json");
  if (!fs.existsSync(deploymentsPath)) throw new Error("deployments.json not found — run deploy-inft.ts first");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  if (!deployments.iNFT?.address) throw new Error("iNFT address not found in deployments.json");
  return deployments.iNFT.address;
}

async function main() {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  if (!rpcUrl) throw new Error("RPC_URL not set in .env");
  if (!privateKey) throw new Error("PRIVATE_KEY not set in .env");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const inftAddress = getDeployedAddress();
  const inft = new ethers.Contract(inftAddress, INFT_ABI, wallet);

  // ── T-030: Upload personality to 0G, mint iNFT ───────────────────────────

  const personality: NFTPersonality = {
    nftId: 0, // placeholder — will be set after mint
    name: "NerOSBot",
    ensName: "nerosbot.eth",
    riskTolerance: 7,
    style: "aggressive",
    preferredAssets: ["ETH", "USDC"],
    maxPositionPct: 40,
    createdAt: Date.now(),
  };

  console.log("[ T-030 ] Uploading personality to 0G Storage...");
  const cid = await uploadJSON(personality);
  console.log(`[ T-030 ] Personality uploaded → rootHash: ${cid}`);

  console.log("[ T-030 ] Calling iNFT.mint(cid, 7)...");
  const tx = await inft.mint(cid, 7);
  console.log(`[ T-030 ] Tx sent: ${tx.hash}`);
  const receipt = await tx.wait();

  const mintLog = receipt.logs
    .map((log: ethers.Log) => { try { return inft.interface.parseLog(log); } catch { return null; } })
    .find((e: ethers.LogDescription | null) => e?.name === "Minted");

  if (!mintLog) throw new Error("Minted event not found in receipt");
  const tokenId: bigint = mintLog.args.tokenId;
  console.log(`[ T-030 ] ✓ iNFT #${tokenId} minted — tx: ${tx.hash}`);

  // Update personality.nftId now that we know the tokenId
  personality.nftId = Number(tokenId);

  // ── T-031: Verify personalityHash on-chain matches uploaded CID ───────────

  console.log(`\n[ T-031 ] Reading getIntelligence(${tokenId}) from chain...`);
  const intel = await inft.getIntelligence(tokenId);
  const onChainCid: string = intel.personalityHash;
  console.log(`[ T-031 ] On-chain personalityHash: ${onChainCid}`);

  if (onChainCid !== cid) {
    throw new Error(`[ T-031 ] FAIL — on-chain CID (${onChainCid}) does not match uploaded CID (${cid})`);
  }
  console.log("[ T-031 ] ✓ On-chain CID matches uploaded CID");

  // ── T-032: Download personality from 0G using on-chain CID ───────────────

  console.log(`\n[ T-032 ] Downloading personality from 0G using on-chain CID...`);
  const downloaded = await downloadJSON<NFTPersonality>(onChainCid);
  console.log(`[ T-032 ] Downloaded: ${JSON.stringify(downloaded, null, 2)}`);

  if (downloaded.name !== personality.name || downloaded.riskTolerance !== personality.riskTolerance) {
    throw new Error("[ T-032 ] FAIL — downloaded JSON does not match original personality");
  }
  console.log("[ T-032 ] ✓ Personality readable and correct");

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n──────────────────────────────────────────────");
  console.log("Day 1 Integration Check: ALL PASSED");
  console.log(`  iNFT #${tokenId}  |  iNFT contract: ${inftAddress}`);
  console.log(`  Personality CID: ${cid}`);
  console.log(`  Mint tx: ${tx.hash}`);
  console.log("──────────────────────────────────────────────");

  // Persist results to deployments.json
  const deploymentsPath = path.resolve("deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  deployments["integrationCheck"] = {
    tokenId: tokenId.toString(),
    personalityCID: cid,
    mintTx: tx.hash,
    ranAt: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("deployments.json updated with integration check results.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
