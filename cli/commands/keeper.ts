import "dotenv/config";
import chalk from "chalk";
import { program } from "commander";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { etherscanTx } from "../link.js";
import { C, SEP } from "../theme.js";

const KEEPER_ABI = ["function withdraw() external"];

program
  .option("--fund [eth]",  "Send ETH to KeeperAdapter (default 0.01)")
  .option("--withdraw",    "Pull all ETH back from KeeperAdapter")
  .parse(process.argv);

const opts = program.opts<{ fund?: string | boolean; withdraw?: boolean }>();

if (!opts.fund && !opts.withdraw) {
  console.error(chalk.hex(C.error)("  Usage: npm run keeper -- --fund [amount]  |  --withdraw"));
  process.exit(1);
}

function getKeeperAddress(): string {
  const deps = JSON.parse(
    fs.readFileSync(path.resolve("deployments.json"), "utf8"),
  ) as Record<string, { address: string }>;
  if (!deps.KeeperAdapter?.address)
    throw new Error("KeeperAdapter not found in deployments.json — run deploy-keeper first");
  return deps.KeeperAdapter.address;
}

if (!process.env.RPC_URL)     throw new Error("RPC_URL not set");
if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");

const provider      = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet        = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const keeperAddress = getKeeperAddress();

const action = opts.withdraw ? "Withdraw" : "Fund";
console.log();
console.log(`  ${chalk.hex(C.brand).bold('◈ NerOS')}  ${chalk.dim(`Keeper · ${action}`)}`);
console.log(`  ${chalk.dim(SEP)}`);
console.log(`  ${chalk.dim('KeeperAdapter')}  ${chalk.hex(C.accent)(keeperAddress)}`);
console.log(`  ${chalk.dim('Wallet       ')}  ${wallet.address}`);
console.log();

// ── Fund ──────────────────────────────────────────────────────────────────────
if (opts.fund !== undefined) {
  const amountEth = typeof opts.fund === "string" ? opts.fund : "0.01";
  const amountWei = ethers.parseEther(amountEth);

  const [keeperBal, walletBal] = await Promise.all([
    provider.getBalance(keeperAddress),
    provider.getBalance(wallet.address),
  ]);

  console.log(`  ${chalk.dim('Keeper balance')}  ${ethers.formatEther(keeperBal)} ETH`);
  console.log(`  ${chalk.dim('Wallet balance')}  ${ethers.formatEther(walletBal)} ETH`);
  console.log();

  if (walletBal < amountWei) {
    console.error(`  ${chalk.hex(C.error)('✗')}  Insufficient balance — need ${amountEth} ETH, have ${ethers.formatEther(walletBal)} ETH`);
    process.exit(1);
  }

  process.stdout.write(`  ${chalk.dim('·')}  Sending ${chalk.bold(amountEth + ' ETH')} to KeeperAdapter…  `);
  let tx: ethers.TransactionResponse;
  try {
    tx = await wallet.sendTransaction({ to: keeperAddress, value: amountWei });
  } catch (err: unknown) {
    process.stdout.write(chalk.hex(C.error)('✗') + '\n\n');
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('CALL_EXCEPTION') || msg.includes('execution reverted') || msg.includes('missing revert data')) {
      console.error(`  ${chalk.hex(C.error)('✗')}  Contract rejected ETH — redeploy with: ${chalk.bold('npm run deploy-keeper')}`);
    } else {
      console.error(`  ${chalk.hex(C.error)('✗')}  ${msg}`);
    }
    process.exit(1);
  }
  process.stdout.write(chalk.hex(C.warning)('pending') + '\n');

  process.stdout.write(`  ${chalk.dim('·')}  Waiting for confirmation…  `);
  const receipt = await tx.wait();
  process.stdout.write(chalk.hex(C.success)('✓') + '\n');

  const balanceAfter = await provider.getBalance(keeperAddress);
  const shortHash    = `${tx.hash.slice(0, 10)}…${tx.hash.slice(-8)}`;
  console.log();
  console.log(`  ${chalk.hex(C.success)('✓')}  Funded successfully`);
  console.log(`     ${chalk.dim('Amount  ')}  ${amountEth} ETH`);
  console.log(`     ${chalk.dim('Balance ')}  ${ethers.formatEther(keeperBal)} → ${chalk.bold(ethers.formatEther(balanceAfter))} ETH`);
  console.log(`     ${chalk.dim('Tx      ')}  ${chalk.hex(C.accent)(etherscanTx(shortHash, tx.hash))} ↗`);
  console.log(`     ${chalk.dim('Block   ')}  ${receipt?.blockNumber}`);
  console.log();
}

// ── Withdraw ──────────────────────────────────────────────────────────────────
if (opts.withdraw) {
  const keeperBal = await provider.getBalance(keeperAddress);

  console.log(`  ${chalk.dim('Keeper balance')}  ${ethers.formatEther(keeperBal)} ETH`);
  console.log();

  if (keeperBal === 0n) {
    console.log(`  ${chalk.hex(C.warning)('·')}  Keeper balance is 0 ETH — nothing to withdraw.`);
    console.log();
    process.exit(0);
  }

  const keeper = new ethers.Contract(keeperAddress, KEEPER_ABI, wallet);

  process.stdout.write(`  ${chalk.dim('·')}  Withdrawing ${chalk.bold(ethers.formatEther(keeperBal) + ' ETH')}…  `);
  const tx = await (keeper.withdraw() as Promise<ethers.TransactionResponse>);
  process.stdout.write(chalk.hex(C.warning)('pending') + '\n');

  process.stdout.write(`  ${chalk.dim('·')}  Waiting for confirmation…  `);
  const receipt = await tx.wait();
  process.stdout.write(chalk.hex(C.success)('✓') + '\n');

  const [balanceAfter, walletAfter] = await Promise.all([
    provider.getBalance(keeperAddress),
    provider.getBalance(wallet.address),
  ]);
  const shortHash = `${tx.hash.slice(0, 10)}…${tx.hash.slice(-8)}`;
  console.log();
  console.log(`  ${chalk.hex(C.success)('✓')}  Withdrawn successfully`);
  console.log(`     ${chalk.dim('Amount     ')}  ${ethers.formatEther(keeperBal)} ETH`);
  console.log(`     ${chalk.dim('Keeper bal ')}  ${ethers.formatEther(keeperBal)} → ${chalk.bold(ethers.formatEther(balanceAfter))} ETH`);
  console.log(`     ${chalk.dim('Wallet bal ')}  ${chalk.bold(ethers.formatEther(walletAfter))} ETH`);
  console.log(`     ${chalk.dim('Tx         ')}  ${chalk.hex(C.accent)(etherscanTx(shortHash, tx.hash))} ↗`);
  console.log(`     ${chalk.dim('Block      ')}  ${receipt?.blockNumber}`);
  console.log();
}
