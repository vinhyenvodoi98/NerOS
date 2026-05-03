import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { uploadJSON } from "../../0g/client.js";
import type { NFTPersonality } from "../../0g/schema.js";
import { createSubdomain, setSubdomainAddr, setSubdomainAvatar } from "../../intelligence/agent/ens.js";
import { setActiveNftId } from "../session.js";
import { etherscanTx } from "../link.js";
import { C, SEP } from "../theme.js";

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
const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8")) as {
  iNFT?: { address: string };
  PortfolioManager?: { address: string };
};
const { iNFT, PortfolioManager: portfolioManagerDeployment } = deployments;
if (!iNFT?.address) throw new Error("iNFT address not found in deployments.json");

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const inft = new ethers.Contract(iNFT.address, INFT_ABI, wallet);

const rl = readline.createInterface({ input, output });

console.log();
console.log(`  ${chalk.hex(C.brand).bold('◈ NerOS')}  ${chalk.dim('Mint new iNFT')}`);
console.log(`  ${chalk.dim(SEP)}`);
console.log();

const name = (await rl.question(`  Name your iNFT\n  > `)).trim() || "NerOSBot";

let riskLevel = 7;
const riskRaw = (await rl.question(`\n  Risk level  1 – 10\n  > `)).trim();
if (riskRaw) {
  const n = parseInt(riskRaw, 10);
  riskLevel = !isNaN(n) && n >= 1 && n <= 10 ? n : 7;
}

const styleRaw = (await rl.question(`\n  Style   aggressive / balanced / conservative\n  > `)).trim();
const style: NFTPersonality["style"] =
  styleRaw === "aggressive" || styleRaw === "balanced" || styleRaw === "conservative"
    ? styleRaw
    : riskLevel >= 7 ? "aggressive" : riskLevel >= 4 ? "balanced" : "conservative";

const assetsRaw = (await rl.question(`\n  Preferred assets\n  > `)).trim();
const preferredAssets = assetsRaw
  ? assetsRaw.split(",").map((a) => a.trim().toUpperCase()).filter(Boolean)
  : ["ETH", "USDC"];

const ensRaw = (await rl.question(`\n  ENS name\n  > `)).trim();
const ensName = `${ensRaw || "nerosbot"}.eth`;

rl.close();
console.log();
console.log(`  ${chalk.dim(SEP)}`);
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

const LABEL = 24;
const padLabel = (s: string) => s.padEnd(LABEL);

process.stdout.write(`  ${chalk.dim('·')}  ${padLabel('Uploading personality')}  `);
const cid = await uploadJSON(personality);
const shortCid = `${cid.slice(0, 8)}…${cid.slice(-6)}`;
process.stdout.write(chalk.hex(C.success)('✓') + '\n');

process.stdout.write(`  ${chalk.dim('·')}  ${padLabel('Minting iNFT on Sepolia')}  `);
const tx = await (inft.mint as unknown as (cid: string, risk: number) => Promise<ethers.ContractTransactionResponse>)(cid, riskLevel);
const receipt = await tx.wait();
if (!receipt) throw new Error("Transaction failed — no receipt");

const iface = inft.interface;
const mintedEvent = (receipt.logs as unknown as { topics: readonly string[]; data: string }[])
  .map((log) => { try { return iface.parseLog(log); } catch { return null; } })
  .find((e) => e?.name === "Minted");
const tokenId = mintedEvent ? Number(mintedEvent.args.tokenId) : predictedId;
process.stdout.write(chalk.hex(C.success)('✓') + '\n');
console.log();

const shortTx = `${receipt.hash.slice(0, 8)}…${receipt.hash.slice(-6)}`;
const rootName = process.env.ENS_NAME ?? ensName;
const subdomain = `${tokenId}.${rootName}`;
const pmAddress = portfolioManagerDeployment?.address ?? "";

// ENS subdomain setup
process.stdout.write(`  ${chalk.dim('·')}  ${padLabel('Creating subdomain')}  `);
const subdomainCreated = await createSubdomain(tokenId, wallet.address, privateKey);
if (!subdomainCreated) {
  process.stdout.write(chalk.yellow('already registered') + '\n');
} else {
  process.stdout.write(chalk.hex(C.success)('✓') + '\n');
}

if (pmAddress && subdomainCreated) {
  process.stdout.write(`  ${chalk.dim('·')}  ${padLabel('Setting addr record')}  `);
  await setSubdomainAddr(tokenId, pmAddress, privateKey);
  process.stdout.write(chalk.hex(C.success)('✓') + '\n');
}

if (subdomainCreated) {
  process.stdout.write(`  ${chalk.dim('·')}  ${padLabel('Setting avatar record')}  `);
  await setSubdomainAvatar(tokenId, iNFT.address, privateKey);
  process.stdout.write(chalk.hex(C.success)('✓') + '\n');
}
console.log();

console.log(`  ${chalk.hex(C.success)('✓')}  ${padLabel('Personality uploaded')}  ${chalk.dim('CID:')} ${chalk.hex(C.accent)(shortCid)}`);
console.log(`  ${chalk.hex(C.success)('✓')}  ${padLabel(`iNFT #${tokenId} minted`)}  ${chalk.hex(C.accent)(etherscanTx(`${shortTx} ↗`, receipt.hash))}`);
if (subdomainCreated) {
  console.log(`  ${chalk.hex(C.success)('✓')}  ${padLabel('Subdomain created')}  ${chalk.dim(subdomain)}`);
  if (pmAddress) {
    console.log(`  ${chalk.hex(C.success)('✓')}  ${padLabel('Addr record set')}  ${chalk.dim(`${subdomain} → ${pmAddress}`)}`);
  }
  const avatarUri = `eip155:11155111/erc721:${iNFT.address}/${tokenId}`;
  console.log(`  ${chalk.hex(C.success)('✓')}  ${padLabel('Avatar record set')}  ${chalk.dim(avatarUri)}`);
} else {
  console.log(`  ${chalk.yellow('⚠')}  ${padLabel('Subdomain skipped')}  ${chalk.dim(`${subdomain} already registered`)}`);
}
console.log();

setActiveNftId(tokenId);
console.log(`     ${chalk.dim(`Active NFT set to #${tokenId} — no need to pass --nft-id next time.`)}`);
console.log();
