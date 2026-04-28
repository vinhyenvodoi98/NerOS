/**
 * Fund the PortfolioManager contract on Sepolia for nftId 1:
 *   - 0.1 WETH (wrap ETH → WETH, then deposit)
 *   - 100 USDC  (requires deployer wallet to already hold Sepolia USDC)
 *
 * Get Sepolia USDC from: https://faucet.circle.com
 * Get Sepolia WETH: this script wraps ETH automatically.
 */
import "dotenv/config";
import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { parseEther, parseUnits, erc20Abi } from "viem";
import { getContract } from "viem";

const NFT_ID = 1n;
// Sepolia token addresses
const WETH_SEPOLIA = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9" as const;
const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

const WETH_DEPOSIT_AMOUNT = parseEther("0.1");
const USDC_DEPOSIT_AMOUNT = parseUnits("100", 6);

const WETH_ABI = [
  ...erc20Abi,
  { name: "deposit", type: "function", inputs: [], outputs: [], stateMutability: "payable" },
] as const;

const { viem } = await network.create("sepolia");
const [deployer] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

const deploymentsPath = path.resolve("deployments.json");
const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
if (!deployments.PortfolioManager?.address) {
  throw new Error("PortfolioManager not deployed — run deploy-portfolio.ts first");
}
const pmAddress = deployments.PortfolioManager.address as `0x${string}`;
const pm = await viem.getContractAt("PortfolioManager", pmAddress);

console.log(`Funding PortfolioManager ${pmAddress} for NFT #${NFT_ID}...`);

// ── Step 1: Wrap ETH → WETH ──────────────────────────────────────────────────
console.log(`\n[1/4] Wrapping ${WETH_DEPOSIT_AMOUNT} ETH → WETH...`);
const wethContract = getContract({
  address: WETH_SEPOLIA,
  abi: WETH_ABI,
  client: { public: publicClient, wallet: deployer },
});
const wrapTx = await deployer.writeContract({
  address: WETH_SEPOLIA,
  abi: WETH_ABI,
  functionName: "deposit",
  value: WETH_DEPOSIT_AMOUNT,
});
await publicClient.waitForTransactionReceipt({ hash: wrapTx });
console.log(`  ✓ Wrapped · tx: ${wrapTx}`);

// ── Step 2: Approve + Deposit WETH ──────────────────────────────────────────
console.log(`\n[2/4] Approving WETH to PortfolioManager...`);
const approveTx = await wethContract.write.approve([pmAddress, WETH_DEPOSIT_AMOUNT]);
await publicClient.waitForTransactionReceipt({ hash: approveTx });
console.log(`  ✓ Approved · tx: ${approveTx}`);

console.log(`[3/4] Depositing 0.1 WETH for NFT #${NFT_ID}...`);
const depositWethTx = await pm.write.deposit([NFT_ID, WETH_SEPOLIA, WETH_DEPOSIT_AMOUNT]);
await publicClient.waitForTransactionReceipt({ hash: depositWethTx });
const wethBalance = await pm.read.getBalance([NFT_ID, WETH_SEPOLIA]);
console.log(`  ✓ Deposited · tx: ${depositWethTx}`);
console.log(`  PortfolioManager WETH balance: ${wethBalance}`);

// ── Step 3: Deposit USDC (if available) ─────────────────────────────────────
console.log(`\n[4/4] Checking USDC balance...`);
const usdcContract = getContract({
  address: USDC_SEPOLIA,
  abi: erc20Abi,
  client: { public: publicClient, wallet: deployer },
});
const usdcBalance = await usdcContract.read.balanceOf([deployer.account.address]);

if (usdcBalance >= USDC_DEPOSIT_AMOUNT) {
  const approveUsdcTx = await usdcContract.write.approve([pmAddress, USDC_DEPOSIT_AMOUNT]);
  await publicClient.waitForTransactionReceipt({ hash: approveUsdcTx });

  const depositUsdcTx = await pm.write.deposit([NFT_ID, USDC_SEPOLIA, USDC_DEPOSIT_AMOUNT]);
  await publicClient.waitForTransactionReceipt({ hash: depositUsdcTx });
  const pmUsdcBalance = await pm.read.getBalance([NFT_ID, USDC_SEPOLIA]);
  console.log(`  ✓ Deposited 100 USDC · tx: ${depositUsdcTx}`);
  console.log(`  PortfolioManager USDC balance: ${pmUsdcBalance}`);
} else {
  console.log(`  ! Deployer USDC balance too low (${usdcBalance} units < 100 USDC).`);
  console.log(`    Get Sepolia USDC from: https://faucet.circle.com`);
  console.log(`    Then re-run this script.`);
}

console.log(`\n✓ Portfolio funded.`);
console.log(`  WETH_SEPOLIA : ${WETH_SEPOLIA}`);
console.log(`  USDC_SEPOLIA : ${USDC_SEPOLIA}`);
