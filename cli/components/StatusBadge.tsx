import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../theme.js';

interface StatusBadgeProps {
  label: string;
  detail?: string;
  status?: 'done' | 'error' | 'running';
}

const LABEL_WIDTH = 24;

export function StatusBadge({ label, detail, status = 'done' }: StatusBadgeProps) {
  const icon =
    status === 'done'  ? <Text color={C.success}>✓</Text> :
    status === 'error' ? <Text color={C.error}>✗</Text>   :
                         <Text color={C.warning}>…</Text>;

  return (
    <Box gap={2} paddingX={2}>
      {icon}
      <Text>{label.padEnd(LABEL_WIDTH)}</Text>
      {detail && <Text color={C.accent}>{detail}</Text>}
    </Box>
  );
}
