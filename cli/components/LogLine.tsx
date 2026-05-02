import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../theme.js';

type LogAction = 'buy' | 'sell' | 'hold' | 'triggered' | 'error' | 'info';

interface LogLineProps {
  timestamp: string;
  action: LogAction;
  detail?: string;
  txHash?: string;
}

const ACTION_COLOR: Record<LogAction, string | undefined> = {
  buy:       C.success,
  sell:      C.error,
  hold:      undefined,
  triggered: C.warning,
  error:     C.error,
  info:      undefined,
};

export function LogLine({ timestamp, action, detail, txHash }: LogLineProps) {
  const color = ACTION_COLOR[action];
  const isBold = action === 'buy' || action === 'sell';
  const shortTx = txHash ? `${txHash.slice(0, 6)}…${txHash.slice(-4)} ↗` : null;

  return (
    <Box gap={3} paddingX={2}>
      <Text dimColor>{timestamp}</Text>
      <Text color={color} bold={isBold}>{action.toUpperCase().padEnd(9)}</Text>
      {detail && <Text dimColor>{detail}</Text>}
      {shortTx && <Text color={C.accent}>{shortTx}</Text>}
    </Box>
  );
}
