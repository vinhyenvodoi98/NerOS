import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

const { viem } = await network.create("sepolia");

console.log("Deploying iNFT to Sepolia...");

const inft = await viem.deployContract("iNFT");
const address = inft.address;

console.log(`iNFT deployed to: ${address}`);

// Persist address to deployments.json
const deploymentsPath = path.resolve("deployments.json");
const deployments = fs.existsSync(deploymentsPath)
  ? JSON.parse(fs.readFileSync(deploymentsPath, "utf8"))
  : {};

deployments.iNFT = {
  address,
  network: "sepolia",
  deployedAt: new Date().toISOString(),
};

fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
console.log(`deployments.json updated → ${deploymentsPath}`);
