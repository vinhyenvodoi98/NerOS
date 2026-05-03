# NerOS Terminal UI — Warm Minimalism Design System

## 1. Current State Analysis

The existing UI has three components:

| Component | Issue |
|---|---|
| `Header` | Round border box is heavy; all text the same visual weight |
| `ToolRow` | `●` bullet is ambiguous — looks the same for running and done; status icon comes after the label (wrong read order) |
| `Decision` | Reason text and badge have no visual separation; color is the only differentiator |
| `mint.ts` | Pure `console.log` + chalk, bypasses Ink entirely — inconsistent feel |

---

## 2. Design Principles

### Color Palette (5 roles, not 5 colors)

```
Brand   #d7875f  warm amber    — NerOS identity mark only
Success #5faf5f  soft green    — confirmed, done, positive
Error   #d75f5f  muted red     — failed, rejected
Warning #d7af5f  warm yellow   — caution, pending action
Accent  #87afd7  cool blue     — links, CIDs, tx hashes
```

Default terminal white for primary text. `dimColor` (gray) for all secondary/metadata. No purple, cyan, or magenta.

### Typography rules

- **Bold** — brand name, decision badge, section titles, numeric values that matter
- `dimColor` — timestamps, CIDs, tx hashes, cycle counts, runtime
- Normal weight — tool names, reasons, log lines
- Avoid ALL CAPS except decision badge (`BUY`, `SELL`, `HOLD`)

### Spacing hierarchy

```
marginTop={1}   between major sections
paddingX={2}    inside content blocks
gap={2}         between inline elements
```

No borders except the outermost header. Separators are thin `─` lines in dim, not box borders.

---

## 3. ASCII Layout Mocks

### `npm run agent` — Main agent cycle

```
  ◈ NerOS                                               alpha-nft.eth
  ─────────────────────────────────────────────────────────────────────
  NerOSBot   Risk 7/10 · aggressive   Cycle 13   0G: bafk3x…7z ↗


  Steps
  ─────────────────────────────────────────────────────────────────────
  ✓  read_memory            12 trades · +$187
  ✓  get_market_data        ETH $2,401 ↓3.2%
  ✓  read_ens_instructions  (none)
  ⠙  execute_trade


  Decision
  ─────────────────────────────────────────────────────────────────────
  ETH retraced to support. Position size within risk limits.

  [ BUY ]   0x4a3f…c291 ↗   Cycle 13   4.2s


```

### `npm run mint` — Interactive setup

```
  ◈ NerOS   Mint new iNFT
  ─────────────────────────────────────────────────────────────────────

  Name your iNFT
  > NerOSBot

  Risk level  1 – 10
  > 7

  Style   aggressive / balanced / conservative
  > (auto → aggressive)

  Preferred assets
  > ETH, USDC

  ENS name
  > alpha-nft.eth

  ─────────────────────────────────────────────────────────────────────

  ✓  Personality uploaded   CID: bafk3x…7z ↗
  ✓  iNFT #1 minted         0x9f2a…b348 ↗
  ✓  ENS assigned           alpha-nft.eth

     Active NFT set to #1 — no need to pass --nft-id next time.


```

### `npm run history` — Trade log

```
  ◈ NerOS                                               alpha-nft.eth
  ─────────────────────────────────────────────────────────────────────
  NerOSBot   13 trades   +$187.40 total P&L


  Trade History
  ─────────────────────────────────────────────────────────────────────
  #   Action   Asset   Amount      P&L       Tx
  ─   ──────   ─────   ──────      ───       ──────────────
  13  BUY      ETH     0.041 ETH   —         0x4a3f…c291 ↗
  12  SELL     ETH     0.038 ETH   +$12.40   0x7b1e…f823 ↗
  11  HOLD     —       —           —         —
  10  BUY      ETH     0.035 ETH   —         0x2c9d…a104 ↗
  ...


```

### `npm run watch` — Keeper watcher (autonomous loop)

```
  ◈ NerOS   Keeper Watcher                              alpha-nft.eth
  ─────────────────────────────────────────────────────────────────────
  NerOSBot   Listening for triggers…   Block 8,241,034


  Activity
  ─────────────────────────────────────────────────────────────────────
  14:23:05   Triggered   running agent…
  14:23:09   BUY         ETH · 0x4a3f…c291 ↗
  14:18:41   Triggered   running agent…
  14:18:44   HOLD        —
  14:09:12   Triggered   running agent…
  14:09:15   SELL        ETH · 0x7b1e…f823 ↗


```

---

## 4. React Ink Implementation

### 4.1 Color tokens (`cli/theme.ts`)

```ts
export const C = {
  brand:   '#d7875f',
  success: '#5faf5f',
  error:   '#d75f5f',
  warning: '#d7af5f',
  accent:  '#87afd7',
} as const;

export const SEP = '─'.repeat(69);
```

---

### 4.2 `StatusIcon` — reusable status marker

```tsx
// cli/components/StatusIcon.tsx
import React from 'react';
import { Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import { C } from '../theme.js';

type Status = 'running' | 'done' | 'error' | 'warn' | 'idle';

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
```

---

### 4.3 `Section` — titled block with separator

```tsx
// cli/components/Section.tsx
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
    <Box flexDirection="column" marginTop={marginTop} paddingX={2}>
      {title && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>{title}</Text>
          <Text dimColor>{SEP}</Text>
        </Box>
      )}
      {children}
    </Box>
  );
}
```

---

### 4.4 `Header` — redesigned identity bar

```tsx
// cli/components/Header.tsx
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
  subtitle?: string;     // e.g. "Keeper Watcher", "Mint new iNFT"
}

export function Header({
  name, ensName, riskLevel, style, memoryCID, cycleCount, subtitle,
}: HeaderProps) {
  const shortCID = memoryCID
    ? `${memoryCID.slice(0, 6)}…${memoryCID.slice(-2)} ↗`
    : null;

  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1}>
      {/* Brand row */}
      <Box justifyContent="space-between">
        <Box gap={2}>
          <Text color={C.brand} bold>◈ NerOS</Text>
          {subtitle && <Text dimColor>{subtitle}</Text>}
        </Box>
        <Text dimColor>{ensName}</Text>
      </Box>

      {/* Separator */}
      <Text dimColor>{SEP}</Text>

      {/* Identity row */}
      <Box gap={3} marginBottom={1}>
        <Text bold>{name}</Text>
        <Text dimColor>Risk {riskLevel}/10 · {style}</Text>
        {cycleCount !== undefined && (
          <Text dimColor>Cycle {cycleCount}</Text>
        )}
        {shortCID && (
          <Text dimColor>0G: <Text color={C.accent}>{shortCID}</Text></Text>
        )}
      </Box>
    </Box>
  );
}
```

---

### 4.5 `ToolRow` — redesigned step row

```tsx
// cli/components/ToolRow.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { StatusIcon } from './StatusIcon.js';
import { C } from '../theme.js';

interface ToolRowProps {
  tool: string;
  status: 'running' | 'done' | 'error';
  summary?: string;
}

// Fixed-width label column for clean alignment
const LABEL_WIDTH = 26;

export function ToolRow({ tool, status, summary }: ToolRowProps) {
  const label = tool.padEnd(LABEL_WIDTH);

  return (
    <Box gap={2} paddingX={2}>
      <StatusIcon status={status} />
      <Text>{label}</Text>
      {summary && (
        status === 'error'
          ? <Text color={C.error}>{summary}</Text>
          : <Text dimColor>{summary}</Text>
      )}
    </Box>
  );
}
```

---

### 4.6 `Decision` — redesigned outcome card

```tsx
// cli/components/Decision.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { C, SEP } from '../theme.js';

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

      {/* Reason */}
      <Box marginTop={1} marginBottom={1}>
        <Text>{reason}</Text>
      </Box>

      {/* Badge + tx + meta inline */}
      <Box gap={3}>
        <Text color={color} bold>[ {label} ]</Text>
        {shortTx && (
          <Text color={C.accent}>{shortTx} ↗</Text>
        )}
        <Text dimColor>
          {cycleCount !== undefined ? `Cycle ${cycleCount}   ` : ''}
          {elapsed.toFixed(1)}s
        </Text>
      </Box>
    </Box>
  );
}
```

---

### 4.7 `LogLine` — structured log for watch/history

```tsx
// cli/components/LogLine.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../theme.js';

type LogAction = 'buy' | 'sell' | 'hold' | 'triggered' | 'error' | 'info';

interface LogLineProps {
  timestamp: string;   // e.g. "14:23:05"
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
  const shortTx = txHash ? `${txHash.slice(0, 6)}…${txHash.slice(-4)} ↗` : null;

  return (
    <Box gap={3} paddingX={2}>
      <Text dimColor>{timestamp}</Text>
      <Text color={color} bold={action === 'buy' || action === 'sell'}>
        {action.toUpperCase().padEnd(9)}
      </Text>
      {detail && <Text dimColor>{detail}</Text>}
      {shortTx && <Text color={C.accent}>{shortTx}</Text>}
    </Box>
  );
}
```

---

### 4.8 `StatusBadge` — inline badge (mint success rows)

```tsx
// cli/components/StatusBadge.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { C } from '../theme.js';

interface StatusBadgeProps {
  label: string;            // e.g. "Personality uploaded"
  detail?: string;          // e.g. "CID: bafk3x…7z ↗"
  status?: 'done' | 'error' | 'running';
}

const LABEL_WIDTH = 24;

export function StatusBadge({ label, detail, status = 'done' }: StatusBadgeProps) {
  const icon =
    status === 'done'    ? <Text color={C.success}>✓</Text>  :
    status === 'error'   ? <Text color={C.error}>✗</Text>    :
    /* running */          <Text color={C.warning}>…</Text>;

  return (
    <Box gap={2} paddingX={2}>
      {icon}
      <Text>{label.padEnd(LABEL_WIDTH)}</Text>
      {detail && <Text color={C.accent}>{detail}</Text>}
    </Box>
  );
}
```

---

### 4.9 Updated `renderer.tsx` (wiring it together)

```tsx
// cli/renderer.tsx
import React, { useState, useEffect } from 'react';
import { Box, useApp } from 'ink';
import { Header } from './components/Header.js';
import { ToolRow } from './components/ToolRow.js';
import { Decision } from './components/Decision.js';
import { Section } from './components/Section.js';
import type { NFTPersonality } from '../0g/schema.js';
import { AgentStream, type AgentStreamEvent } from './stream.js';

export { AgentStream, type AgentStreamEvent };

interface ToolRowState {
  tool: string;
  status: 'running' | 'done' | 'error';
  summary?: string;
}

interface DecisionState {
  decision: 'buy' | 'sell' | 'hold';
  reason: string;
  txHash?: string | null;
  cycleCount?: number;
  elapsed: number;
}

interface AppProps {
  personality: NFTPersonality;
  memoryCID?: string;
  cycleCount?: number;
  stream: AgentStream;
}

export function App({ personality, memoryCID, cycleCount, stream }: AppProps) {
  const { exit } = useApp();
  const [rows, setRows] = useState<ToolRowState[]>([]);
  const [decisionState, setDecisionState] = useState<DecisionState | null>(null);

  useEffect(() => {
    function onEvent(ev: AgentStreamEvent) {
      if (ev.type === 'tool_start') {
        setRows((prev) => [...prev, { tool: ev.tool, status: 'running' }]);
      } else if (ev.type === 'tool_done') {
        setRows((prev) =>
          prev.map((r) =>
            r.tool === ev.tool && r.status === 'running'
              ? { ...r, status: 'done', summary: ev.summary }
              : r,
          ),
        );
      } else if (ev.type === 'tool_error') {
        setRows((prev) =>
          prev.map((r) =>
            r.tool === ev.tool && r.status === 'running'
              ? { ...r, status: 'error', summary: ev.error }
              : r,
          ),
        );
      } else if (ev.type === 'decision') {
        setDecisionState({
          decision: ev.decision,
          reason: ev.reason,
          txHash: ev.txHash,
          cycleCount: ev.cycleCount,
          elapsed: ev.elapsed,
        });
        setTimeout(() => exit(), 50);
      }
    }

    stream.on('event', onEvent);
    return () => { stream.off('event', onEvent); };
  }, [stream, exit]);

  return (
    <Box flexDirection="column">
      <Header
        name={personality.name}
        ensName={personality.ensName}
        riskLevel={personality.riskTolerance}
        style={personality.style}
        memoryCID={memoryCID}
        cycleCount={cycleCount}
      />

      <Section title="Steps">
        {rows.map((row, i) => (
          <ToolRow
            key={`${row.tool}-${i}`}
            tool={row.tool}
            status={row.status}
            summary={row.summary}
          />
        ))}
      </Section>

      {decisionState && (
        <Decision
          decision={decisionState.decision}
          reason={decisionState.reason}
          txHash={decisionState.txHash}
          cycleCount={decisionState.cycleCount}
          elapsed={decisionState.elapsed}
        />
      )}
    </Box>
  );
}
```

---

## 5. File Map

```
cli/
├── theme.ts                  ← NEW: color tokens + SEP constant
├── renderer.tsx              ← updated: uses Section
├── components/
│   ├── Header.tsx            ← redesigned
│   ├── ToolRow.tsx           ← redesigned: icon-first, fixed-width label
│   ├── Decision.tsx          ← redesigned: section style
│   ├── Section.tsx           ← NEW: titled separator block
│   ├── StatusIcon.tsx        ← NEW: extracted icon logic
│   ├── StatusBadge.tsx       ← NEW: mint success rows
│   └── LogLine.tsx           ← NEW: watch/history log entries
```

---

## 6. Before / After Comparison

### Tool row

```
BEFORE                              AFTER
────────────────────────────────    ────────────────────────────────
● get_market_data  ✓  ETH...        ✓  get_market_data        ETH $2,401 ↓3.2%
● execute_trade  ⠙                  ⠙  execute_trade
```

Changes: icon moves left (scan order matches reading order); fixed label column makes results align; dim on secondary data.

### Header

```
BEFORE                              AFTER
────────────────────────────────    ────────────────────────────────
╭─────────────────────────────╮     ◈ NerOS                alpha-nft.eth
│ NerOSBot · alpha-nft.eth    │     ──────────────────────────────────
│ Risk 7/10 · aggressive · …  │     NerOSBot   Risk 7/10   Cycle 13
╰─────────────────────────────╯
```

Changes: removed heavy border; brand mark uses accent color; ENS pushed right for balance; removed 0G CID from primary row (shown only as accent detail).

### Decision

```
BEFORE                              AFTER
────────────────────────────────    ────────────────────────────────
──────────────────────────          Decision
ETH retraced to support.            ──────────────────────────
                                    ETH retraced to support.
[BUY]  tx: 0x4a3f…c291  ↗ ...
  Cycle 13 · Runtime 4.2s           [ BUY ]   0x4a3f…c291 ↗   Cycle 13   4.2s
```

Changes: section header makes it feel like a result; reason gets a line of breathing room; badge uses consistent bracket style; metadata is dim inline.

---

## 7. Iteration Ideas

| Priority | Idea | Effort |
|---|---|---|
| High | Migrate `mint.ts` to Ink + `StatusBadge` for visual consistency | Small |
| High | Add a `--watch` live-update mode where `ToolRow` re-renders in place | Medium |
| Medium | `history.tsx` table using fixed-width columns with the `LogLine` component | Small |
| Medium | Animated `◈` brand mark that spins during active AI inference | Small |
| Low | Color-coded risk meter `▓▓▓▓▓▓▓░░░` inside the header | Small |
| Low | Dim timestamp on each `ToolRow` showing ms elapsed per tool | Small |
