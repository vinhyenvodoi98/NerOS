import React from "react";
import { Box, Text } from "ink";
import { Header } from "./Header.js";
import { Section } from "./Section.js";
import { C } from "../theme.js";
import type { NFTPersonality } from "../../0g/schema.js";

interface MarketInfo {
  price: number;
  change24h: number;
}

export interface KeeperStatus {
  address: string;
  ethBalance: number;
  lastRunAt: Date | null;
  nextIn: string;
  overdue: boolean;
}

export interface BalanceAppProps {
  personality: NFTPersonality;
  ethAmt: number;
  usdcAmt: number;
  ethUsd: number;
  usdcUsd: number;
  totalUsd: number;
  ethMkt: MarketInfo;
  usdcMkt: MarketInfo;
  keeper?: KeeperStatus;
}

// Column widths for the portfolio table
const COL = { token: 10, amount: 20, price: 16 };
const DIVIDER = "─".repeat(Object.values(COL).reduce((a, b) => a + b, 0) + 12);
const KEEPER_LABEL = 16;

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s.padEnd(n);
}

function fmt(n: number, dec = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function chgColor(v: number): string {
  return v >= 0 ? C.success : C.error;
}

function chgLabel(v: number, dec = 2): string {
  return `${v >= 0 ? "+" : ""}${fmt(Math.abs(v), dec)}%`;
}

export function BalanceApp({
  personality, ethAmt, usdcAmt, ethUsd, usdcUsd, totalUsd, ethMkt, usdcMkt, keeper,
}: BalanceAppProps) {
  return (
    <Box flexDirection="column">
      <Header
        name={personality.name}
        ensName={personality.ensName}
        riskLevel={personality.riskTolerance}
        style={personality.style}
      />

      {/* ── Portfolio table ── */}
      <Section title="Portfolio">
        {/* Column headers */}
        <Box paddingX={2}>
          <Text bold dimColor>{pad("Token",      COL.token)}</Text>
          <Text bold dimColor>{pad("Amount",     COL.amount)}</Text>
          <Text bold dimColor>{pad("Price",      COL.price)}</Text>
          <Text bold dimColor>{"USD Value"}</Text>
        </Box>
        <Box paddingX={2}>
          <Text dimColor>{DIVIDER}</Text>
        </Box>

        {/* ETH */}
        <Box paddingX={2}>
          <Text bold>{pad("ETH",  COL.token)}</Text>
          <Text>{pad(fmt(ethAmt, 6),              COL.amount)}</Text>
          <Text>{pad(`$${fmt(ethMkt.price)}`,     COL.price)}</Text>
          <Text>{`$${fmt(ethUsd)}`}</Text>
        </Box>

        {/* USDC */}
        <Box paddingX={2}>
          <Text bold>{pad("USDC", COL.token)}</Text>
          <Text>{pad(fmt(usdcAmt, 2),             COL.amount)}</Text>
          <Text>{pad(`$${fmt(usdcMkt.price, 4)}`, COL.price)}</Text>
          <Text>{`$${fmt(usdcUsd)}`}</Text>
        </Box>

        <Box paddingX={2} marginTop={1}>
          <Text dimColor>{DIVIDER}</Text>
        </Box>

        {/* Total */}
        <Box paddingX={2}>
          <Text bold>{pad("Total", COL.token)}</Text>
          <Text>{pad("", COL.amount)}</Text>
          <Text>{pad("", COL.price)}</Text>
          <Text color={totalUsd >= 0 ? C.success : C.error} bold>{`$${fmt(totalUsd)}`}</Text>
        </Box>

        {/* 24h price changes */}
        <Box paddingX={2} gap={4} marginTop={1} marginBottom={1}>
          <Text dimColor>
            {"ETH 24h  "}
            <Text color={chgColor(ethMkt.change24h)}>{chgLabel(ethMkt.change24h)}</Text>
          </Text>
          <Text dimColor>
            {"USDC 24h  "}
            <Text color={chgColor(usdcMkt.change24h)}>{chgLabel(usdcMkt.change24h, 4)}</Text>
          </Text>
        </Box>
      </Section>

      {/* ── Keeper section ── */}
      {keeper && (
        <Section title="Keeper">
          <Box paddingX={2}>
            <Text dimColor>{pad("ETH balance", KEEPER_LABEL)}</Text>
            {keeper.ethBalance === 0 ? (
              <Text color={C.error}>{fmt(keeper.ethBalance, 6)} ETH  ⚠ no ETH — auto-trigger will fail</Text>
            ) : (
              <Text>{fmt(keeper.ethBalance, 6)} ETH</Text>
            )}
          </Box>
          <Box paddingX={2}>
            <Text dimColor>{pad("Last trigger", KEEPER_LABEL)}</Text>
            <Text>{keeper.lastRunAt ? keeper.lastRunAt.toLocaleString() : "never"}</Text>
          </Box>
          <Box paddingX={2}>
            <Text dimColor>{pad("Next trigger", KEEPER_LABEL)}</Text>
            <Text color={keeper.overdue ? C.error : C.warning}>{keeper.nextIn}</Text>
          </Box>
          <Box paddingX={2} marginTop={1} marginBottom={1}>
            <Text dimColor>{pad("Address", KEEPER_LABEL)}</Text>
            <Text color={C.accent}>{keeper.address}</Text>
          </Box>
        </Section>
      )}
    </Box>
  );
}
