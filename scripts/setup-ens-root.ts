import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";

const RESOLVER_ABI = [
  "function setAddr(bytes32 node, address a)",
  "function addr(bytes32 node) view returns (address)",
];

async function main() {
  const { PRIVATE_KEY, RPC_URL, ENS_RESOLVER } = process.env;
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");
  if (!RPC_URL) throw new Error("RPC_URL not set");
  if (!ENS_RESOLVER) throw new Error("ENS_RESOLVER not set");

  const deploymentsPath = path.resolve("deployments.json");
  if (!fs.existsSync(deploymentsPath)) throw new Error("deployments.json not found — deploy iNFT first");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const iNFTAddress: string = deployments.iNFT?.address;
  if (!iNFTAddress) throw new Error("iNFT address not found in deployments.json");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const resolver = new ethers.Contract(ENS_RESOLVER, RESOLVER_ABI, wallet);

  const ensName = process.env.ENS_NAME ?? "nerosbot.eth";
  const node = ethers.namehash(ensName);

  console.log(`Setting addr record: ${ensName} → ${iNFTAddress}`);
  const tx = await resolver.setAddr(node, iNFTAddress);
  console.log(`tx: ${tx.hash}`);
  await tx.wait();
  console.log(`✓ ${ensName} → ${iNFTAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
