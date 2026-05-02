import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { uploadJSON } from "../../0g/client.js";
import type { NFTPersonality } from "../../0g/schema.js";
import { setActiveNftId } from "../session.js";
import { etherscanTx } from "../link.js";

const INFT_ABI = [
  "event Minted(uint256 indexed tokenId, address indexed owner, string personalityCID)",
  "function mint(string calldata personalityCID, uint8 riskLevel) external returns (uint256 tokenId)",
];

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
if (!rpcUrl) throw new Error("RPC_URL not set");
if (!privateKey) throw new Error("PRIVATE_KEY not set");

const deploymentsPath = path.resolve("deployments.json");
if (!fs.existsSync(deploymentsPath)) throw new Error("deployments.json not found — deploy iNFT first");
const { iNFT } = JSON.parse(fs.readFileSync(deploymentsPath, "utf8")) as { iNFT?: { address: string } };
if (!iNFT?.address) throw new Error("iNFT address not found in deployments.json");

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const inft = new ethers.Contract(iNFT.address, INFT_ABI, wallet);

const rl = readline.createInterface({ input, output });

console.log(chalk.bold("\n  Mint a new iNFT Portfolio Manager\n"));

const name = (await rl.question("  Name your iNFT (e.g. AlphaBot): ")).trim() || "AlphaBot";

let riskLevel = 7;
const riskRaw = (await rl.question("  Risk level 1-10 [7]: ")).trim();
if (riskRaw) {
  const n = parseInt(riskRaw, 10);
  riskLevel = !isNaN(n) && n >= 1 && n <= 10 ? n : 7;
}

const styleRaw = (await rl.question("  Style (aggressive/balanced/conservative) [auto]: ")).trim();
const style: NFTPersonality["style"] =
  styleRaw === "aggressive" || styleRaw === "balanced" || styleRaw === "conservative"
    ? styleRaw
    : riskLevel >= 7 ? "aggressive" : riskLevel >= 4 ? "balanced" : "conservative";

const assetsRaw = (await rl.question("  Preferred assets comma-separated [ETH,USDC]: ")).trim();
const preferredAssets = assetsRaw
  ? assetsRaw.split(",").map((a) => a.trim().toUpperCase()).filter(Boolean)
  : ["ETH", "USDC"];

const ensRaw = (await rl.question("  ENS name (without .eth) [nerosbot]: ")).trim();
const ensName = `${ensRaw || "nerosbot"}.eth`;

rl.close();
console.log();

// Predict tokenId via staticCall so personality stores the correct nftId
const predictedId = Number(
  await (inft.mint as unknown as { staticCall(cid: string, risk: number): Promise<bigint> })
    .staticCall("placeholder", riskLevel)
);

const personality: NFTPersonality = {
  nftId: predictedId,
  name,
  ensName,
  riskTolerance: riskLevel,
  style,
  preferredAssets,
  maxPositionPct: riskLevel * 10,
  createdAt: Date.now(),
};

process.stdout.write("  Uploading personality to 0G... ");
const cid = await uploadJSON(personality);
console.log(chalk.green("✓") + chalk.dim(` CID: ${cid.slice(0, 10)}...`));

process.stdout.write("  Minting iNFT on Sepolia... ");
const tx = await (inft.mint as unknown as (cid: string, risk: number) => Promise<ethers.ContractTransactionResponse>)(cid, riskLevel);
const receipt = await tx.wait();
if (!receipt) throw new Error("Transaction failed — no receipt");

const iface = inft.interface;
const mintedEvent = (receipt.logs as unknown as { topics: readonly string[]; data: string }[])
  .map((log) => { try { return iface.parseLog(log); } catch { return null; } })
  .find((e) => e?.name === "Minted");
const tokenId = mintedEvent ? Number(mintedEvent.args.tokenId) : predictedId;

console.log(chalk.green("✓"));
console.log();
console.log(chalk.green(`  ✓ Personality uploaded → 0G`));
const shortMintTx = `${receipt.hash.slice(0, 6)}…${receipt.hash.slice(-4)}`;
console.log(chalk.green(`  ✓ iNFT #${tokenId} minted`) + `  ` + etherscanTx(chalk.hex('#87afd7')(`${shortMintTx} ↗`), receipt.hash));
console.log(chalk.green(`  ✓ ENS: ${ensName}`));
console.log();

setActiveNftId(tokenId);
console.log(chalk.dim(`  Active iNFT set to #${tokenId} — no need to pass --nft-id next time.\n`));
