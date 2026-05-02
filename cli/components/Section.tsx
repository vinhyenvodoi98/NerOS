import React from 'react';
import { Box, Text } from 'ink';
import { SEP } from '../theme.js';

interface SectionProps {
  title?: string;
  children: React.ReactNode;
  marginTop?: number;
}

export function Section({ title, children, marginTop = 1 }: SectionProps) {
  return (
    <Box flexDirection="column" marginTop={marginTop}>
      {title && (
        <Box flexDirection="column" paddingX={2} marginBottom={1}>
          <Text bold>{title}</Text>
          <Text dimColor>{SEP}</Text>
        </Box>
      )}
      {children}
    </Box>
  );
}
