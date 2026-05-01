import "dotenv/config";
import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

const { viem } = await network.create("sepolia");

const deploymentsPath = path.resolve("deployments.json");
if (!fs.existsSync(deploymentsPath)) {
  throw new Error("deployments.json not found — deploy iNFT and PortfolioManager first");
}
const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8")) as Record<
  string,
  { address: string; network?: string; deployedAt?: string }
>;

console.log("Deploying KeeperAdapter to Sepolia...");
const ka = await viem.deployContract("KeeperAdapter", []);
const keeperAddress = ka.address;
console.log(`KeeperAdapter deployed to: ${keeperAddress}`);

// Link KeeperAdapter to PortfolioManager so it is authorized to call executeTrade
if (deployments.PortfolioManager?.address) {
  const pm = await viem.getContractAt(
    "PortfolioManager",
    deployments.PortfolioManager.address as `0x${string}`,
  );
  const tx = await pm.write.setKeeperAdapter([keeperAddress]);
  console.log(`PortfolioManager.setKeeperAdapter → ${keeperAddress} · tx: ${tx}`);
} else {
  console.warn("PortfolioManager not found in deployments.json — skipping setKeeperAdapter");
}

deployments.KeeperAdapter = {
  address: keeperAddress,
  network: "sepolia",
  deployedAt: new Date().toISOString(),
};
fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
console.log(`deployments.json updated → ${deploymentsPath}`);

console.log("\n── Verify on Etherscan ────────────────────────────────────────");
console.log(`npx hardhat verify --network sepolia ${keeperAddress}`);

console.log("\n── Register on KeeperHub (T-092) ─────────────────────────────");
console.log("1. Open https://app.keeperhub.xyz and connect your wallet");
console.log(`2. Click 'Register Upkeep' → paste contract: ${keeperAddress}`);
console.log("3. ABI: checkUpkeep / performUpkeep (standard Chainlink Automation interface)");
console.log("4. Fund the upkeep with LINK or ETH to cover gas");
console.log("5. Set trigger interval ≥ 300 s (matches INTERVAL constant)");
