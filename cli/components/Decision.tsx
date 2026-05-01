import React from "react";
import { Box, Text } from "ink";

type DecisionKind = "buy" | "sell" | "hold";

interface DecisionProps {
  decision: DecisionKind;
  reason: string;
  txHash?: string | null;
  cycleCount?: number;
  elapsed: number;
}

const BADGE_COLOR: Record<DecisionKind, string> = {
  buy: "green",
  sell: "red",
  hold: "gray",
};

const SEPARATOR = "─".repeat(57);

export function Decision({ decision, reason, txHash, cycleCount, elapsed }: DecisionProps) {
  const color = BADGE_COLOR[decision];
  const badge = decision.toUpperCase();
  const shortTx = txHash && txHash !== "0xstub"
    ? `${txHash.slice(0, 6)}...${txHash.slice(-4)}`
    : null;
  const etherscanUrl = shortTx
    ? `https://sepolia.etherscan.io/tx/${txHash}`
    : null;
  const cycleLabel = cycleCount !== undefined ? `Cycle ${cycleCount} · ` : "";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>{SEPARATOR}</Text>
      <Text>{reason}</Text>
      <Box marginTop={1} gap={2}>
        <Text color={color} bold>[{badge}]</Text>
        {shortTx && etherscanUrl ? (
          <Text>
            {"tx: "}
            <Text dimColor>{shortTx}</Text>
            {"  ↗ "}
            <Text color="cyan">{etherscanUrl}</Text>
          </Text>
        ) : null}
      </Box>
      <Text dimColor>
        {cycleLabel}Runtime {elapsed.toFixed(1)}s
      </Text>
    </Box>
  );
}
