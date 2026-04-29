/**
 * deploy-mock-tokens.ts — resumable setup for mock token trading
 *
 * Each step checks deployments.json before running and saves on success.
 * Re-run after any failure to continue from where it left off.
 *
 *  1. Deploy MockUSD + MockETH (18 decimals each)
 *  2. Mint tokens to deployer
 *  3. Create + initialize a Uniswap V3 pool at 1:1 price
 *  4. Add 50k full-range liquidity
 *  5. Deposit 1000 of each into the existing PortfolioManager for nftId=1
 *
 * Run: npx hardhat run scripts/deploy-mock-tokens.ts --network sepolia
 */
import "dotenv/config";
import { network } from "hardhat";
import { parseEther, erc20Abi } from "viem";
import fs from "node:fs";
import path from "node:path";

// ── Uniswap V3 addresses (same across Mainnet + official testnets) ────────────
const UNISWAP_FACTORY  = "0x1F98431c8aD98523631AE4a59f267346ea31F984" as const;
const POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88" as const;

const POOL_FEE   = 3000;
const TICK_LOWER = -887220;
const TICK_UPPER =  887220;
const SQRT_PRICE_1_1 = 79228162514264337593543950336n;

const NFT_ID    = 1n;
const LIQUIDITY = parseEther("50000");
const DEPOSIT   = parseEther("1000");

// ── Hardhat viem setup ───────────────────────────────────────────────────────
const { viem } = await network.create("sepolia");
const [deployer] = await viem.getWalletClients();
const pub = await viem.getPublicClient();

// ── Checkpoint helpers ───────────────────────────────────────────────────────
const deploymentsPath = path.resolve("deployments.json");
const deps: Record<string, any> = fs.existsSync(deploymentsPath)
  ? JSON.parse(fs.readFileSync(deploymentsPath, "utf8"))
  : {};

const save = () => fs.writeFileSync(deploymentsPath, JSON.stringify(deps, null, 2));

if (!deps.PortfolioManager?.address)
  throw new Error("PortfolioManager not in deployments.json — deploy it first");
const pmAddress = deps.PortfolioManager.address as `0x${string}`;

const wait = async (hash: `0x${string}`) =>
  pub.waitForTransactionReceipt({ hash });

// ── ABIs ─────────────────────────────────────────────────────────────────────
const FACTORY_ABI = [
  { name: "createPool", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"tokenA",type:"address"},{name:"tokenB",type:"address"},{name:"fee",type:"uint24"}],
    outputs: [{type:"address"}] },
  { name: "getPool", type: "function", stateMutability: "view",
    inputs: [{type:"address"},{type:"address"},{type:"uint24"}],
    outputs: [{type:"address"}] },
] as const;

const POOL_ABI = [
  { name: "initialize", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"sqrtPriceX96",type:"uint160"}], outputs: [] },
] as const;

const PM_DEPOSIT_ABI = [
  { name: "deposit", type: "function", stateMutability: "nonpayable",
    inputs: [{name:"nftId",type:"uint256"},{name:"token",type:"address"},{name:"amount",type:"uint256"}],
    outputs: [] },
] as const;

const NFPM_MINT_ABI = [
  { name: "mint", type: "function", stateMutability: "payable",
    inputs: [{ name: "params", type: "tuple", components: [
      {name:"token0",         type:"address"},
      {name:"token1",         type:"address"},
      {name:"fee",            type:"uint24"},
      {name:"tickLower",      type:"int24"},
      {name:"tickUpper",      type:"int24"},
      {name:"amount0Desired", type:"uint256"},
      {name:"amount1Desired", type:"uint256"},
      {name:"amount0Min",     type:"uint256"},
      {name:"amount1Min",     type:"uint256"},
      {name:"recipient",      type:"address"},
      {name:"deadline",       type:"uint256"},
    ]}],
    outputs: [{name:"tokenId",type:"uint256"},{name:"liquidity",type:"uint128"},
              {name:"amount0",type:"uint256"},{name:"amount1",type:"uint256"}] },
] as const;

// ── Step 1: Deploy or reuse MockUSD + MockETH ────────────────────────────────
let mockUSD: any, mockETH: any;

if (deps.MockUSD?.address && deps.MockETH?.address) {
  console.log("\n[1/5] MockUSD + MockETH already deployed — skipping.");
  mockUSD = await viem.getContractAt("MockERC20", deps.MockUSD.address as `0x${string}`);
  mockETH = await viem.getContractAt("MockERC20", deps.MockETH.address as `0x${string}`);
  console.log(`  MockUSD: ${mockUSD.address} (existing)`);
  console.log(`  MockETH: ${mockETH.address} (existing)`);
} else {
  console.log("\n[1/5] Deploying MockUSD + MockETH (18 decimals each)...");
  mockUSD = await viem.deployContract("MockERC20", ["MockUSD", "mUSD", 18]);
  mockETH = await viem.deployContract("MockERC20", ["MockETH", "mETH", 18]);
  console.log(`  MockUSD: ${mockUSD.address}`);
  console.log(`  MockETH: ${mockETH.address}`);
  deps.MockUSD = { address: mockUSD.address };
  deps.MockETH = { address: mockETH.address };
  save();
}

// Uniswap requires token0 < token1 by address
const [token0, token1] = [mockUSD.address, mockETH.address].sort() as
  [`0x${string}`, `0x${string}`];

// ── Step 2: Mint tokens to deployer ─────────────────────────────────────────
if (deps.mockSetup?.minted) {
  console.log("\n[2/5] Tokens already minted — skipping.");
} else {
  console.log("\n[2/5] Minting tokens to deployer...");
  const totalMint = LIQUIDITY + DEPOSIT + parseEther("500");
  await wait(await mockUSD.write.mint([deployer.account.address, totalMint]));
  await wait(await mockETH.write.mint([deployer.account.address, totalMint]));
  console.log(`  ✓ Minted ${totalMint / 10n ** 18n} of each token`);
  deps.mockSetup = { ...deps.mockSetup, minted: true };
  save();
}

// ── Step 3: Create + initialize Uniswap V3 pool ──────────────────────────────
let poolAddress: `0x${string}`;

if (deps.UniswapPool?.address) {
  console.log("\n[3/5] Uniswap V3 pool already exists — skipping.");
  poolAddress = deps.UniswapPool.address as `0x${string}`;
  console.log(`  Pool: ${poolAddress} (existing)`);
} else {
  console.log("\n[3/5] Creating Uniswap V3 pool (fee=0.3%)...");
  await wait(await deployer.writeContract({
    address: UNISWAP_FACTORY, abi: FACTORY_ABI,
    functionName: "createPool", args: [token0, token1, POOL_FEE],
  }));

  poolAddress = await pub.readContract({
    address: UNISWAP_FACTORY, abi: FACTORY_ABI,
    functionName: "getPool", args: [token0, token1, POOL_FEE],
  }) as `0x${string}`;
  console.log(`  Pool: ${poolAddress}`);

  await wait(await deployer.writeContract({
    address: poolAddress, abi: POOL_ABI,
    functionName: "initialize", args: [SQRT_PRICE_1_1],
  }));
  console.log("  ✓ Pool initialized at 1:1 price");
  deps.UniswapPool = { address: poolAddress, token0, token1, fee: POOL_FEE };
  save();
}

// ── Step 4: Add full-range liquidity ────────────────────────────────────────
if (deps.mockSetup?.liquidityAdded) {
  console.log("\n[4/5] Liquidity already added — skipping.");
} else {
  console.log("\n[4/5] Adding liquidity...");
  await wait(await deployer.writeContract({
    address: token0, abi: erc20Abi, functionName: "approve",
    args: [POSITION_MANAGER, LIQUIDITY],
  }));
  await wait(await deployer.writeContract({
    address: token1, abi: erc20Abi, functionName: "approve",
    args: [POSITION_MANAGER, LIQUIDITY],
  }));

  const mintTx = await deployer.writeContract({
    address: POSITION_MANAGER, abi: NFPM_MINT_ABI, functionName: "mint",
    args: [{
      token0, token1, fee: POOL_FEE,
      tickLower: TICK_LOWER, tickUpper: TICK_UPPER,
      amount0Desired: LIQUIDITY, amount1Desired: LIQUIDITY,
      amount0Min: 0n, amount1Min: 0n,
      recipient: deployer.account.address,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    }],
  });
  await wait(mintTx);
  console.log(`  ✓ Liquidity added · tx: ${mintTx}`);
  deps.mockSetup = { ...deps.mockSetup, liquidityAdded: true };
  save();
}

// ── Step 5: Deposit into existing PortfolioManager for nftId=1 ──────────────
if (deps.mockSetup?.depositsComplete) {
  console.log(`\n[5/5] Deposits already done — skipping.`);
} else {
  console.log(`\n[5/5] Funding PortfolioManager ${pmAddress} for NFT #1...`);

  await wait(await deployer.writeContract({
    address: mockUSD.address, abi: erc20Abi, functionName: "approve",
    args: [pmAddress, DEPOSIT],
  }));
  await wait(await deployer.writeContract({
    address: pmAddress, abi: PM_DEPOSIT_ABI, functionName: "deposit",
    args: [NFT_ID, mockUSD.address, DEPOSIT],
  }));
  console.log("  ✓ Deposited 1000 mUSD");

  await wait(await deployer.writeContract({
    address: mockETH.address, abi: erc20Abi, functionName: "approve",
    args: [pmAddress, DEPOSIT],
  }));
  await wait(await deployer.writeContract({
    address: pmAddress, abi: PM_DEPOSIT_ABI, functionName: "deposit",
    args: [NFT_ID, mockETH.address, DEPOSIT],
  }));
  console.log("  ✓ Deposited 1000 mETH");
  deps.mockSetup = { ...deps.mockSetup, depositsComplete: true };
  save();
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n✓ Done! deployments.json updated.");
console.log(`  PortfolioManager : ${pmAddress}  (existing)`);
console.log(`  MockUSD (mUSD)   : ${mockUSD.address}`);
console.log(`  MockETH (mETH)   : ${mockETH.address}`);
console.log(`  Uniswap Pool     : ${poolAddress}`);
console.log("\nNext: npm run agent -- --nft-id 1");
