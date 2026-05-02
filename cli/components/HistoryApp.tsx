import React from "react";
import { Box, Text } from "ink";
import { Header } from "./Header.js";
import { Section } from "./Section.js";
import { C } from "../theme.js";
import { etherscanTx } from "../link.js";
import type { TradeMemory, TradeRecord, NFTPersonality } from "../../0g/schema.js";

const W = { time: 17, action: 7, pair: 12, amtIn: 12, amtOut: 12, reason: 28, tx: 14 };
const DIVIDER = "─".repeat(Object.values(W).reduce((a, b) => a + b, 0));

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s.padEnd(n);
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function TradeRow({ trade }: { trade: TradeRecord }) {
  const color =
    trade.action === "buy"  ? C.success :
    trade.action === "sell" ? C.error   : "#808080";
  const isBold = trade.action === "buy" || trade.action === "sell";
  const shortTx = trade.txHash && trade.txHash !== "0xstub"
    ? etherscanTx(`${trade.txHash.slice(0, 6)}…${trade.txHash.slice(-4)} ↗`, trade.txHash)
    : "—";
  const amtIn  = parseFloat(trade.amountIn  || "0").toFixed(4);
  const amtOut = parseFloat(trade.amountOut || "0").toFixed(4);

  return (
    <Box paddingX={2}>
      <Text dimColor>{pad(fmtTime(trade.timestamp), W.time)}</Text>
      <Text color={color} bold={isBold}>{pad(trade.action.toUpperCase(), W.action)}</Text>
      <Text>{pad(`${trade.tokenIn}→${trade.tokenOut}`, W.pair)}</Text>
      <Text>{pad(amtIn, W.amtIn)}</Text>
      <Text>{pad(amtOut, W.amtOut)}</Text>
      <Text dimColor>{pad(trade.reason.slice(0, W.reason - 1), W.reason)}</Text>
      <Text color={C.accent}>{shortTx}</Text>
    </Box>
  );
}

export interface HistoryAppProps {
  memory: TradeMemory;
  personality: NFTPersonality;
}

export function HistoryApp({ memory, personality }: HistoryAppProps) {
  const { trades } = memory;
  const pnl = memory.totalPnL ?? 0;
  const pnlColor = pnl >= 0 ? C.success : C.error;
  const pnlLabel = `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`;
  const subtitle = `${trades.length} trade${trades.length !== 1 ? "s" : ""}   ${pnlLabel} total P&L`;

  return (
    <Box flexDirection="column">
      <Header
        name={personality.name}
        ensName={personality.ensName}
        riskLevel={personality.riskTolerance}
        style={personality.style}
        subtitle={subtitle}
      />

      {trades.length === 0 ? (
        <Section>
          <Box paddingX={2}>
            <Text dimColor>No trade history found for iNFT #{memory.nftId}</Text>
          </Box>
        </Section>
      ) : (
        <Section title="Trade History">
          <Box paddingX={2}>
            <Text bold dimColor>{pad("Time",       W.time)}</Text>
            <Text bold dimColor>{pad("Action",     W.action)}</Text>
            <Text bold dimColor>{pad("Pair",       W.pair)}</Text>
            <Text bold dimColor>{pad("Amount In",  W.amtIn)}</Text>
            <Text bold dimColor>{pad("Amount Out", W.amtOut)}</Text>
            <Text bold dimColor>{pad("Reason",     W.reason)}</Text>
            <Text bold dimColor>{"Tx"}</Text>
          </Box>
          <Box paddingX={2}>
            <Text dimColor>{DIVIDER}</Text>
          </Box>

          {trades.map((trade, i) => <TradeRow key={i} trade={trade} />)}

          <Box paddingX={2} marginTop={1}>
            <Text dimColor>{DIVIDER}</Text>
          </Box>

          <Box paddingX={2} gap={2} marginBottom={1}>
            <Text>Total P&L</Text>
            <Text color={pnlColor} bold>{pnlLabel}</Text>
            <Text dimColor>{trades.length} trade{trades.length !== 1 ? "s" : ""}</Text>
          </Box>
        </Section>
      )}
    </Box>
  );
}
