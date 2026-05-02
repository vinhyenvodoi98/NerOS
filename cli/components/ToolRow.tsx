import React from 'react';
import { Box, Text } from 'ink';
import { StatusIcon } from './StatusIcon.js';
import { C } from '../theme.js';

interface ToolRowProps {
  tool: string;
  status: 'running' | 'done' | 'error';
  summary?: string;
}

// Fixed-width label so result values align into a clean column
const LABEL_WIDTH = 26;

export function ToolRow({ tool, status, summary }: ToolRowProps) {
  return (
    <Box gap={2} paddingX={2}>
      <StatusIcon status={status} />
      <Text>{tool.padEnd(LABEL_WIDTH)}</Text>
      {summary && (
        status === 'error'
          ? <Text color={C.error}>{summary}</Text>
          : <Text dimColor>{summary}</Text>
      )}
    </Box>
  );
}
