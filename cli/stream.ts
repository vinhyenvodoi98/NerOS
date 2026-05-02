import { EventEmitter } from "events";

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
  toolStart(tool: string): void {
    this.emit("event", { type: "tool_start", tool } as AgentStreamEvent);
  }
  toolDone(tool: string, summary?: string): void {
    this.emit("event", { type: "tool_done", tool, summary } as AgentStreamEvent);
  }
  toolError(tool: string, error: string): void {
    this.emit("event", { type: "tool_error", tool, error } as AgentStreamEvent);
  }
  decision(
    decision: "buy" | "sell" | "hold",
    reason: string,
    txHash: string | null,
    cycleCount: number | undefined,
    elapsed: number,
  ): void {
    this.emit("event", {
      type: "decision",
      decision,
      reason,
      txHash,
      cycleCount,
      elapsed,
    } as AgentStreamEvent);
  }
}
