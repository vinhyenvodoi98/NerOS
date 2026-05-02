import React from 'react';
import { Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import { C } from '../theme.js';

export type Status = 'running' | 'done' | 'error' | 'warn' | 'idle';

interface StatusIconProps {
  status: Status;
}

export function StatusIcon({ status }: StatusIconProps) {
  if (status === 'running') return <Spinner />;
  if (status === 'done')    return <Text color={C.success}>✓</Text>;
  if (status === 'error')   return <Text color={C.error}>✗</Text>;
  if (status === 'warn')    return <Text color={C.warning}>!</Text>;
  return <Text dimColor>·</Text>;
}
