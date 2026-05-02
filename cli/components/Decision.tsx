import React from 'react';
import { Box, Text } from 'ink';
import { C, SEP } from '../theme.js';
import { etherscanTx } from '../link.js';

type DecisionKind = 'buy' | 'sell' | 'hold';

interface DecisionProps {
  decision: DecisionKind;
  reason: string;
  txHash?: string | null;
  cycleCount?: number;
  elapsed: number;
}

const BADGE: Record<DecisionKind, { label: string; color: string }> = {
  buy:  { label: 'BUY',  color: C.success },
  sell: { label: 'SELL', color: C.error   },
  hold: { label: 'HOLD', color: '#808080' },
};

export function Decision({ decision, reason, txHash, cycleCount, elapsed }: DecisionProps) {
  const { label, color } = BADGE[decision];
  const shortTx = txHash && txHash !== '0xstub'
    ? `${txHash.slice(0, 6)}…${txHash.slice(-4)}`
    : null;

  return (
    <Box flexDirection="column" paddingX={2} marginTop={1}>
      <Text bold>Decision</Text>
      <Text dimColor>{SEP}</Text>

      <Box marginTop={1} marginBottom={1}>
        <Text>{reason}</Text>
      </Box>

      <Box gap={3}>
        <Text color={color} bold>{'[ '}{label}{' ]'}</Text>
        {shortTx && txHash && (
          <Text color={C.accent}>{etherscanTx(`${shortTx} ↗`, txHash)}</Text>
        )}
        <Text dimColor>
          {cycleCount !== undefined ? `Cycle ${cycleCount}   ` : ''}
          {elapsed.toFixed(1)}{'s'}
        </Text>
      </Box>
    </Box>
  );
}
