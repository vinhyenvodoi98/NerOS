import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { createSubdomain, setSubdomainAddr, setSubdomainAvatar } from "../intelligence/agent/ens.js";

const tokenId = parseInt(process.argv[2] ?? "2", 10);

const { PRIVATE_KEY, RPC_URL } = process.env;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");
if (!RPC_URL) throw new Error("RPC_URL not set");

const deploymentsPath = path.resolve("deployments.json");
const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
const iNFTAddress: string = deployments.iNFT?.address;
const pmAddress: string = deployments.PortfolioManager?.address;
if (!iNFTAddress) throw new Error("iNFT address not found in deployments.json");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const rootName = process.env.ENS_NAME ?? "nerosbot.eth";

console.log(`\nSetting up ENS subdomain for tokenId ${tokenId} (${tokenId}.${rootName})\n`);

const created = await createSubdomain(tokenId, wallet.address, PRIVATE_KEY);
if (!created) {
  console.log(`Subdomain ${tokenId}.${rootName} already exists — nothing to do.`);
  process.exit(0);
}
console.log(`✓ Subdomain created      ${tokenId}.${rootName}`);

if (pmAddress) {
  await setSubdomainAddr(tokenId, pmAddress, PRIVATE_KEY);
  console.log(`✓ Addr record set        ${tokenId}.${rootName} → ${pmAddress}`);
}

await setSubdomainAvatar(tokenId, iNFTAddress, PRIVATE_KEY);
const avatarUri = `eip155:11155111/erc721:${iNFTAddress}/${tokenId}`;
console.log(`✓ Avatar record set      ${avatarUri}`);
console.log();
