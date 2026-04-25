export interface NFTPersonality {
  nftId: number;
  name: string;
  ensName: string;
  riskTolerance: number;
  style: "aggressive" | "balanced" | "conservative";
  preferredAssets: string[];
  maxPositionPct: number;
  createdAt: number;
}

export interface TradeMemory {
  nftId: number;
  trades: TradeRecord[];
  totalPnL: number;
  lastUpdated: number;
}

export interface TradeRecord {
  timestamp: number;
  action: "buy" | "sell" | "hold";
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  txHash: string | null;
  reason: string;
  priceAtExecution: number;
}
