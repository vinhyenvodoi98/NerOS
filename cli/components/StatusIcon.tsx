import React from 'react';
import { Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import { C } from '../theme.js';

type Status = 'running' | 'done' | 'error';

interface StatusIconProps {
  status: Status;
}

export function StatusIcon({ status }: StatusIconProps) {
  if (status === 'running') return <Spinner />;
  if (status === 'done')    return <Text color={C.success}>✓</Text>;
  return <Text color={C.error}>✗</Text>;
}
