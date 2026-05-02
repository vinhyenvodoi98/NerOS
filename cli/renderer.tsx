import React, { useState, useEffect } from "react";
import { Box, useApp } from "ink";
import { Header } from "./components/Header.js";
import { ToolRow } from "./components/ToolRow.js";
import { Decision } from "./components/Decision.js";
import { Section } from "./components/Section.js";
import type { NFTPersonality } from "../0g/schema.js";
import { AgentStream, type AgentStreamEvent } from "./stream.js";

export { AgentStream, type AgentStreamEvent };

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
