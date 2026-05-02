import "dotenv/config";
import React from "react";
import { render } from "ink";
import { ethers } from "ethers";
import { program } from "commander";
import fs from "node:fs";
import path from "node:path";
import { loadPersonality } from "../../intelligence/agent/personality.js";
import { getPrice } from "../../intelligence/agent/market.js";
import { resolveNftId } from "../session.js";
import { BalanceApp } from "../components/BalanceApp.js";
import type { KeeperStatus } from "../components/BalanceApp.js";

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

function fmtCountdown(secs: bigint): string {
  if (secs <= 0n) return "NOW (overdue)";
  const m = Number(secs) / 60 | 0;
  const s = Number(secs) % 60;
  return m > 0 ? `in ${m}m ${String(s).padStart(2, "0")}s` : `in ${s}s`;
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
    pm.getBalance(nftId, tokens.ETH.address)  as Promise<bigint>,
    pm.getBalance(nftId, tokens.USDC.address) as Promise<bigint>,
    getPrice("ETH"),
    getPrice("USDC"),
    keeperAddress ? provider.getBalance(keeperAddress) : Promise.resolve(0n),
    keeper ? (keeper.lastRunTimestamp() as Promise<bigint>) : Promise.resolve(0n),
    keeper ? (keeper.INTERVAL()         as Promise<bigint>) : Promise.resolve(300n),
  ]);

const ethAmt  = parseFloat(ethers.formatUnits(rawEth,  tokens.ETH.decimals));
const usdcAmt = parseFloat(ethers.formatUnits(rawUsdc, tokens.USDC.decimals));
const ethUsd  = ethAmt  * ethMkt.price;
const usdcUsd = usdcAmt * usdcMkt.price;
const totalUsd = ethUsd + usdcUsd;

let keeperStatus: KeeperStatus | undefined;
if (keeperAddress) {
  const nowSec   = BigInt(Math.floor(Date.now() / 1000));
  const elapsed  = nowSec - lastRunRaw;
  const remaining = intervalRaw - elapsed;
  keeperStatus = {
    address:    keeperAddress,
    ethBalance: parseFloat(ethers.formatEther(keeperEthRaw)),
    lastRunAt:  lastRunRaw === 0n ? null : new Date(Number(lastRunRaw) * 1000),
    nextIn:     fmtCountdown(remaining),
    overdue:    remaining <= 0n,
  };
}

const { unmount, waitUntilExit } = render(
  React.createElement(BalanceApp, {
    personality, ethAmt, usdcAmt, ethUsd, usdcUsd, totalUsd, ethMkt, usdcMkt,
    keeper: keeperStatus,
  })
);
setTimeout(unmount, 150);
await waitUntilExit();
