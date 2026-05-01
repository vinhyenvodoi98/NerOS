import "dotenv/config";
import { ethers } from "ethers";
import { program } from "commander";
import fs from "node:fs";
import path from "node:path";
import { loadPersonality } from "../../intelligence/agent/personality.js";
import { getPrice } from "../../intelligence/agent/market.js";
import { resolveNftId } from "../session.js";

program
  .option("--nft-id <n>", "NFT token ID", parseInt)
  .parse(process.argv);

const opts = program.opts<{ nftId?: number }>();
const nftId = resolveNftId(opts.nftId);

const PM_ABI = [
  "function getBalance(uint256 nftId, address token) external view returns (uint256)",
];

const KEEPER_ABI = [
  "function lastRunTimestamp() external view returns (uint256)",
  "function INTERVAL() external view returns (uint256)",
];

function loadTokenConfig() {
  try {
    const deps = JSON.parse(
      fs.readFileSync(path.resolve("deployments.json"), "utf8")
    ) as Record<string, { address: string }>;
    if (deps.MockUSD?.address && deps.MockETH?.address) {
      return {
        ETH:  { address: deps.MockETH.address, decimals: 18 },
        USDC: { address: deps.MockUSD.address, decimals: 18 },
      };
    }
  } catch { /* fall through */ }
  return {
    ETH:  { address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", decimals: 18 },
    USDC: { address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6 },
  };
}

function getPortfolioManagerAddress(): string {
  const deps = JSON.parse(
    fs.readFileSync(path.resolve("deployments.json"), "utf8")
  ) as Record<string, { address: string }>;
  if (!deps.PortfolioManager?.address)
    throw new Error("PortfolioManager not found in deployments.json");
  return deps.PortfolioManager.address;
}

function getKeeperAddress(): string | null {
  try {
    const deps = JSON.parse(
      fs.readFileSync(path.resolve("deployments.json"), "utf8")
    ) as Record<string, { address: string }>;
    return deps.KeeperAdapter?.address ?? null;
  } catch { return null; }
}

function fmt(n: number, dec = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function col(s: string, width: number): string {
  return s.padEnd(width);
}

if (!process.env.RPC_URL) throw new Error("RPC_URL not set");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const pm = new ethers.Contract(getPortfolioManagerAddress(), PM_ABI, provider);
const tokens = loadTokenConfig();

const keeperAddress = getKeeperAddress();
const keeper = keeperAddress
  ? new ethers.Contract(keeperAddress, KEEPER_ABI, provider)
  : null;

const [personality, rawEth, rawUsdc, ethMkt, usdcMkt, keeperEthRaw, lastRunRaw, intervalRaw] =
  await Promise.all([
    loadPersonality(nftId),
    pm.getBalance(nftId, tokens.ETH.address) as Promise<bigint>,
    pm.getBalance(nftId, tokens.USDC.address) as Promise<bigint>,
    getPrice("ETH"),
    getPrice("USDC"),
    keeperAddress ? provider.getBalance(keeperAddress) : Promise.resolve(0n),
    keeper ? (keeper.lastRunTimestamp() as Promise<bigint>) : Promise.resolve(0n),
    keeper ? (keeper.INTERVAL() as Promise<bigint>) : Promise.resolve(300n),
  ]);

const ethAmt  = parseFloat(ethers.formatUnits(rawEth,  tokens.ETH.decimals));
const usdcAmt = parseFloat(ethers.formatUnits(rawUsdc, tokens.USDC.decimals));

const ethUsd   = ethAmt  * ethMkt.price;
const usdcUsd  = usdcAmt * usdcMkt.price;
const totalUsd = ethUsd  + usdcUsd;

const DIVIDER = "  " + "─".repeat(54);
const header  = `  iNFT #${nftId} · ${personality.name} · ${personality.ensName}`;

console.log("\n" + header);
console.log(DIVIDER);
console.log(
  "  " +
  col("Token", 8) +
  col("Amount", 22) +
  col("Price", 14) +
  "USD Value"
);
console.log(DIVIDER);
console.log(
  "  " +
  col("ETH",  8) +
  col(fmt(ethAmt, 6), 22) +
  col(`$${fmt(ethMkt.price)}`, 14) +
  `$${fmt(ethUsd)}`
);
console.log(
  "  " +
  col("USDC", 8) +
  col(fmt(usdcAmt, 2), 22) +
  col(`$${fmt(usdcMkt.price, 4)}`, 14) +
  `$${fmt(usdcUsd)}`
);
console.log(DIVIDER);
console.log(
  "  " +
  col("Total", 8) +
  col("", 22) +
  col("", 14) +
  `$${fmt(totalUsd)}`
);

const sign = (n: number) => (n >= 0 ? "+" : "");
console.log(
  `\n  ETH  24h: ${sign(ethMkt.change24h)}${fmt(ethMkt.change24h, 2)}%` +
  `   USDC 24h: ${sign(usdcMkt.change24h)}${fmt(usdcMkt.change24h, 4)}%`
);

// KeeperAdapter section
if (keeperAddress) {
  const keeperEth = parseFloat(ethers.formatEther(keeperEthRaw));
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const elapsed = nowSec - lastRunRaw;
  const remaining = intervalRaw - elapsed;
  const nextIn = remaining > 0n ? `in ${remaining}s` : "NOW (overdue)";

  console.log(`\n  KeeperAdapter · ${keeperAddress}`);
  console.log(DIVIDER);
  console.log(`  ETH balance   ${fmt(keeperEth, 6)} ETH${keeperEth === 0 ? "  ⚠ no ETH — auto-trigger will fail" : ""}`);
  console.log(`  Last trigger  ${lastRunRaw === 0n ? "never" : new Date(Number(lastRunRaw) * 1000).toLocaleString()}`);
  console.log(`  Next trigger  ${nextIn}`);
  console.log(DIVIDER);
}
console.log();
