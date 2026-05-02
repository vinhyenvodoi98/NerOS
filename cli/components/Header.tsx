import React from 'react';
import { Box, Text } from 'ink';
import { C, SEP } from '../theme.js';

interface HeaderProps {
  name: string;
  ensName: string;
  riskLevel: number;
  style: string;
  memoryCID?: string;
  cycleCount?: number;
  subtitle?: string;
}

export function Header({
  name, ensName, riskLevel, style, memoryCID, cycleCount, subtitle,
}: HeaderProps) {
  const shortCID = memoryCID
    ? `${memoryCID.slice(0, 6)}…${memoryCID.slice(-2)} ↗`
    : null;

  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1}>
      {/* Brand bar: ◈ NerOS (left) · ens name (right) */}
      <Box>
        <Text color={C.brand} bold>◈ NerOS</Text>
        {subtitle && <Text dimColor>  {subtitle}</Text>}
        <Box flexGrow={1} />
        <Text dimColor>{ensName}</Text>
      </Box>

      <Text dimColor>{SEP}</Text>

      {/* Identity row */}
      <Box gap={3} marginBottom={1}>
        <Text bold>{name}</Text>
        <Text dimColor>Risk {riskLevel}/10 · {style}</Text>
        {cycleCount !== undefined && <Text dimColor>Cycle {cycleCount}</Text>}
        {shortCID && (
          <Text dimColor>{'0G: '}<Text color={C.accent}>{shortCID}</Text></Text>
        )}
      </Box>
    </Box>
  );
}
