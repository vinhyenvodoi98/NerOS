import "dotenv/config";
import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

// Uniswap V3 SwapRouter02 on Sepolia — pairs with factory 0x0227628f3F023bb0B980b67D528571c95c6DaC1c
const SWAP_ROUTER_DEFAULT = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";

const { viem } = await network.create("sepolia");

// Load iNFT address
const deploymentsPath = path.resolve("deployments.json");
if (!fs.existsSync(deploymentsPath)) {
  throw new Error("deployments.json not found — deploy iNFT first");
}
const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
if (!deployments.iNFT?.address) {
  throw new Error("iNFT address not found in deployments.json — deploy iNFT first");
}

const swapRouter = process.env.UNISWAP_ROUTER || SWAP_ROUTER_DEFAULT;
const inftAddress = deployments.iNFT.address as `0x${string}`;

console.log(`Deploying PortfolioManager to Sepolia...`);
console.log(`  SwapRouter : ${swapRouter}`);
console.log(`  iNFT       : ${inftAddress}`);

const pm = await viem.deployContract("PortfolioManager", [swapRouter, inftAddress]);
const address = pm.address;

console.log(`PortfolioManager deployed to: ${address}`);

// Link iNFT#1 to the PortfolioManager (sets portfolioManager field in Intelligence struct)
const inft = await viem.getContractAt("iNFT", inftAddress);
const tx = await inft.write.setPortfolioManager([1n, address]);
console.log(`iNFT#1 linked to PortfolioManager · tx: ${tx}`);

// Persist
deployments.PortfolioManager = {
  address,
  network: "sepolia",
  deployedAt: new Date().toISOString(),
};
fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
console.log(`deployments.json updated → ${deploymentsPath}`);
