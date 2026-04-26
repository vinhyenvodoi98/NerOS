import { loadMemory, appendTrade } from "./memory.js";
import { loadPersonality } from "./personality.js";
import { getPrice } from "./market.js";
import type { TradeRecord } from "../../0g/schema.js";

export interface ToolContext {
  nftId: number;
  lastTxHash: { value: string | null };
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

// T-046: get_portfolio_balance — stub until Day 3 (PortfolioManager)
function handleGetPortfolioBalance() {
  return { USDC: "100", ETH: "0.01" };
}

// T-047: read_ens_instructions — stub until Day 3 (ENS resolver)
function handleReadEnsInstructions() {
  return null;
}

// T-048: execute_trade — stub until Day 3 (PortfolioManager)
function handleExecuteTrade(
  args: Record<string, unknown>,
  lastTxHash: { value: string | null },
) {
  const { nft_id, action, token_in, token_out, amount_in } = args as {
    nft_id: number;
    action: string;
    token_in: string;
    token_out: string;
    amount_in: string;
  };
  console.error(
    `[execute_trade stub] iNFT #${nft_id}: ${action.toUpperCase()} ${amount_in} ${token_in} → ${token_out}`,
  );
  lastTxHash.value = "0xstub";
  return { txHash: "0xstub" };
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
      return handleGetPortfolioBalance();

    case "read_ens_instructions":
      return handleReadEnsInstructions();

    case "execute_trade":
      return handleExecuteTrade(args, ctx.lastTxHash);

    case "write_memory":
      return handleWriteMemory(args, ctx.nftId, ctx.lastTxHash);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
