import React, { useState, useEffect } from "react";
import { Box, useApp } from "ink";
import { EventEmitter } from "events";
import { Header } from "./components/Header.js";
import { ToolRow } from "./components/ToolRow.js";
import { Decision } from "./components/Decision.js";
import type { NFTPersonality } from "../0g/schema.js";

// ── Event contract ─────────────────────────────────────────────────────────────
// T-105 emits these events on the stream as the agent runs.

export type AgentStreamEvent =
  | { type: "tool_start"; tool: string }
  | { type: "tool_done"; tool: string; summary?: string }
  | { type: "tool_error"; tool: string; error: string }
  | {
      type: "decision";
      decision: "buy" | "sell" | "hold";
      reason: string;
      txHash?: string | null;
      cycleCount?: number;
      elapsed: number;
    };

export class AgentStream extends EventEmitter {
  toolStart(tool: string) {
    this.emit("event", { type: "tool_start", tool } satisfies AgentStreamEvent);
  }
  toolDone(tool: string, summary?: string) {
    this.emit("event", { type: "tool_done", tool, summary } satisfies AgentStreamEvent);
  }
  toolError(tool: string, error: string) {
    this.emit("event", { type: "tool_error", tool, error } satisfies AgentStreamEvent);
  }
  decision(
    decision: "buy" | "sell" | "hold",
    reason: string,
    txHash: string | null,
    cycleCount: number | undefined,
    elapsed: number,
  ) {
    this.emit("event", {
      type: "decision",
      decision,
      reason,
      txHash,
      cycleCount,
      elapsed,
    } satisfies AgentStreamEvent);
  }
}

// ── Internal state types ───────────────────────────────────────────────────────

interface ToolRowState {
  tool: string;
  status: "running" | "done" | "error";
  summary?: string;
}

interface DecisionState {
  decision: "buy" | "sell" | "hold";
  reason: string;
  txHash?: string | null;
  cycleCount?: number;
  elapsed: number;
}

// ── App component ──────────────────────────────────────────────────────────────

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
      if (ev.type === "tool_start") {
        setRows((prev) => [...prev, { tool: ev.tool, status: "running" }]);
      } else if (ev.type === "tool_done") {
        setRows((prev) =>
          prev.map((r) =>
            r.tool === ev.tool && r.status === "running"
              ? { ...r, status: "done", summary: ev.summary }
              : r,
          ),
        );
      } else if (ev.type === "tool_error") {
        setRows((prev) =>
          prev.map((r) =>
            r.tool === ev.tool && r.status === "running"
              ? { ...r, status: "error", summary: ev.error }
              : r,
          ),
        );
      } else if (ev.type === "decision") {
        setDecisionState({
          decision: ev.decision,
          reason: ev.reason,
          txHash: ev.txHash,
          cycleCount: ev.cycleCount,
          elapsed: ev.elapsed,
        });
        // Give Ink one render tick to paint, then exit cleanly
        setTimeout(() => exit(), 50);
      }
    }

    stream.on("event", onEvent);
    return () => { stream.off("event", onEvent); };
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
      {rows.map((row, i) => (
        <ToolRow
          key={`${row.tool}-${i}`}
          tool={row.tool}
          status={row.status}
          summary={row.summary}
        />
      ))}
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
