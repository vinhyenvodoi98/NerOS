import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { loadMemory, appendTrade } from "./memory.js";
import { loadPersonality } from "./personality.js";
import { getPrice } from "./market.js";
import { readInstruction } from "./ens.js";
import type { TradeRecord } from "../../0g/schema.js";

export interface ToolContext {
  nftId: number;
  ensName: string;
  lastTxHash: { value: string | null };
  pendingEnsInstruction: { value: string | null };
}

// Load token config — prefers MockUSD/MockETH from deployments.json (set by deploy-mock-tokens)
// Falls back to real Sepolia WETH/USDC when mock tokens are not deployed.
function loadTokenConfig(): { tokens: Record<string, { address: string; decimals: number }>; isMock: boolean } {
  try {
    const deps = JSON.parse(fs.readFileSync(path.resolve("deployments.json"), "utf8")) as Record<string, { address: string }>;
    if (deps.MockUSD?.address && deps.MockETH?.address) {
      return {
        isMock: true,
        tokens: {
          WETH: { address: deps.MockETH.address, decimals: 18 },
          ETH:  { address: deps.MockETH.address, decimals: 18 },
          USDC: { address: deps.MockUSD.address, decimals: 18 },
        },
      };
    }
  } catch { /* fall through */ }
  return {
    isMock: false,
    tokens: {
      WETH: { address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", decimals: 18 },
      ETH:  { address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", decimals: 18 },
      USDC: { address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6 },
    },
  };
}

const { tokens: SEPOLIA_TOKENS, isMock: IS_MOCK_POOL } = loadTokenConfig();

const PORTFOLIO_MANAGER_ABI = [
  "function executeTrade(uint256 nftId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint24 poolFee) external returns (uint256 amountOut)",
  "function getBalance(uint256 nftId, address token) external view returns (uint256)",
  "event TradeExecuted(uint256 indexed nftId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)",
];

// 0.3% fee tier — standard ETH/USDC pool on Uniswap V3
const DEFAULT_POOL_FEE = 3000;

function getPortfolioManagerAddress(): string {
  const deps = JSON.parse(
    fs.readFileSync(path.resolve("deployments.json"), "utf8")
  ) as Record<string, { address: string }>;
  if (!deps.PortfolioManager?.address)
    throw new Error("PortfolioManager address not found in deployments.json");
  return deps.PortfolioManager.address;
}

// T-044: read_memory
async function handleReadMemory(nftId: number) {
  const [memory, personality] = await Promise.all([
    loadMemory(nftId),
    loadPersonality(nftId),
  ]);
  return { memory, personality };
}

// T-045: get_market_data
async function handleGetMarketData(token: string) {
  return getPrice(token);
}

// T-067: get_portfolio_balance — reads real on-chain balances from PortfolioManager
async function handleGetPortfolioBalance(nftId: number) {
  if (!process.env.RPC_URL) throw new Error("RPC_URL not set");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const pm = new ethers.Contract(
    getPortfolioManagerAddress(),
    PORTFOLIO_MANAGER_ABI,
    provider,
  );

  const [wethBalance, usdcBalance] = await Promise.all([
    pm.getBalance(nftId, SEPOLIA_TOKENS.WETH.address) as Promise<bigint>,
    pm.getBalance(nftId, SEPOLIA_TOKENS.USDC.address) as Promise<bigint>,
  ]);

  return {
    ETH:  ethers.formatUnits(wethBalance, SEPOLIA_TOKENS.WETH.decimals),
    USDC: ethers.formatUnits(usdcBalance, SEPOLIA_TOKENS.USDC.decimals),
  };
}

// T-072: read_ens_instructions — real ENS read from mainnet
async function handleReadEnsInstructions(ctx: ToolContext) {
  const instruction = await readInstruction(ctx.ensName);
  if (instruction) ctx.pendingEnsInstruction.value = instruction;
  return instruction;
}

// T-065: execute_trade — real Uniswap V3 swap via PortfolioManager
async function handleExecuteTrade(
  args: Record<string, unknown>,
  lastTxHash: { value: string | null },
) {
  const { nft_id, token_in, token_out, amount_in } = args as {
    nft_id: number;
    action: string;
    token_in: string;
    token_out: string;
    amount_in: string;
  };

  const tokenInKey  = token_in.toUpperCase();
  const tokenOutKey = token_out.toUpperCase();
  const tokenInCfg  = SEPOLIA_TOKENS[tokenInKey];
  const tokenOutCfg = SEPOLIA_TOKENS[tokenOutKey];

  if (!tokenInCfg)  throw new Error(`Unsupported tokenIn: ${token_in}`);
  if (!tokenOutCfg) throw new Error(`Unsupported tokenOut: ${token_out}`);

  // amount_in from AI is human-readable (e.g. "20" USDC, not 20_000_000)
  const amountInHuman = parseFloat(amount_in);
  const amountInBN = ethers.parseUnits(
    amountInHuman.toFixed(tokenInCfg.decimals),
    tokenInCfg.decimals,
  );

  // Mock pool uses 1:1 price — CoinGecko-based slippage would reject sell-direction swaps.
  // Use amountOutMin=1 on testnet mock pools; real pools keep the 0.5% guard.
  let amountOutMin: bigint;
  if (IS_MOCK_POOL) {
    amountOutMin = 1n;
  } else {
    const [priceIn, priceOut] = await Promise.all([
      getPrice(tokenInKey === "WETH" ? "ETH" : tokenInKey),
      getPrice(tokenOutKey === "WETH" ? "ETH" : tokenOutKey),
    ]);
    const amountInUsd      = amountInHuman * priceIn.price;
    const expectedOutHuman = amountInUsd / priceOut.price;
    amountOutMin = ethers.parseUnits(
      (expectedOutHuman * 0.995).toFixed(tokenOutCfg.decimals),
      tokenOutCfg.decimals,
    );
  }

  if (!process.env.RPC_URL)    throw new Error("RPC_URL not set");
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const pm = new ethers.Contract(
    getPortfolioManagerAddress(),
    PORTFOLIO_MANAGER_ABI,
    wallet,
  );

  const tx = await pm.executeTrade(
    nft_id,
    tokenInCfg.address,
    tokenOutCfg.address,
    amountInBN,
    amountOutMin,
    DEFAULT_POOL_FEE,
  );
  const receipt = await tx.wait();

  // Extract amountOut from TradeExecuted event
  const iface = pm.interface;
  const tradeEvent = (receipt.logs as { topics: string[]; data: string }[])
    .map((log) => { try { return iface.parseLog(log); } catch { return null; } })
    .find((e) => e?.name === "TradeExecuted");

  const amountOut = (tradeEvent?.args?.amountOut as bigint | undefined) ?? 0n;
  const amountOutFormatted = ethers.formatUnits(amountOut, tokenOutCfg.decimals);

  lastTxHash.value = receipt.hash as string;
  return { txHash: receipt.hash as string, amountOut: amountOutFormatted };
}

// T-049: write_memory
async function handleWriteMemory(
  args: Record<string, unknown>,
  nftId: number,
  lastTxHash: { value: string | null },
) {
  const record: TradeRecord = {
    timestamp: Date.now(),
    action: args["action"] as "buy" | "sell" | "hold",
    tokenIn: args["token_in"] as string,
    tokenOut: args["token_out"] as string,
    amountIn: args["amount_in"] as string,
    amountOut: args["amount_out"] as string,
    txHash: (args["tx_hash"] as string | undefined) ?? lastTxHash.value,
    reason: args["reason"] as string,
    priceAtExecution: args["price_at_execution"] as number,
  };
  const newCid = await appendTrade(nftId, record);
  return { newCid };
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "read_memory":
      return handleReadMemory(ctx.nftId);

    case "get_market_data":
      return handleGetMarketData(args["token"] as string);

    case "get_portfolio_balance":
      return handleGetPortfolioBalance(ctx.nftId);

    case "read_ens_instructions":
      return handleReadEnsInstructions(ctx);

    case "execute_trade":
      return handleExecuteTrade(args, ctx.lastTxHash);

    case "write_memory":
      return handleWriteMemory(args, ctx.nftId, ctx.lastTxHash);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
