import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  name: string;
  ensName: string;
  riskLevel: number;
  style: string;
  memoryCID?: string;
  cycleCount?: number;
}

export function Header({ name, ensName, riskLevel, style, memoryCID, cycleCount }: HeaderProps) {
  const shortCID = memoryCID
    ? `${memoryCID.slice(0, 6)}...${memoryCID.slice(-3)} ↗`
    : "—";
  const cycle = cycleCount !== undefined ? ` · Cycle ${cycleCount}` : "";

  return (
    <Box borderStyle="round" paddingX={1} flexDirection="column">
      <Text bold>
        {name} · {ensName}
      </Text>
      <Text dimColor>
        Risk {riskLevel}/10 · {style} · 0G: {shortCID}
        {cycle}
      </Text>
    </Box>
  );
}
