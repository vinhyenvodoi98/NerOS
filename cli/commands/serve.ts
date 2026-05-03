import "dotenv/config";
import http from "node:http";
import React from "react";
import { render } from "ink";
import { program } from "commander";
import { runAgent } from "../../intelligence/agent/strategy.js";
import { loadPersonality } from "../../intelligence/agent/personality.js";
import { loadMemory } from "../../intelligence/agent/memory.js";
import { resolveNftId } from "../session.js";
import { AgentStream } from "../stream.js";
import { App } from "../renderer.js";
import { C, SEP } from "../theme.js";
import chalk from "chalk";

program
  .option("--nft-id <n>", "Default NFT token ID", parseInt)
  .parse(process.argv);

const opts = program.opts<{ nftId?: number }>();
const defaultNftId = resolveNftId(opts.nftId);

const PORT   = parseInt(process.env.WEBHOOK_PORT ?? "3000", 10);
const SECRET = process.env.WEBHOOK_SECRET ?? "";

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

let agentRunning = false;

async function handleAgentRun(nftId: number): Promise<{ decision: string; reason: string; txHash: string | null }> {
  const personality = await loadPersonality(nftId);
  let cycleCount = 1;
  try {
    const memory = await loadMemory(nftId);
    cycleCount = memory.trades.length + 1;
  } catch { /* 0G unavailable */ }

  const stream = new AgentStream();
  const { waitUntilExit } = render(
    React.createElement(App, { personality, memoryCID: undefined, cycleCount, stream })
  );

  const start = Date.now();
  let result: { decision: string; reason: string; txHash: string | null } = {
    decision: "hold",
    reason: "",
    txHash: null,
  };

  await new Promise<void>((resolve) => {
    runAgent(nftId, undefined, {
      toolStart: (t) => stream.toolStart(t),
      toolDone:  (t, s) => stream.toolDone(t, s),
      toolError: (t, e) => stream.toolError(t, e),
    }).then((r) => {
      result = r;
      const elapsed = (Date.now() - start) / 1000;
      stream.decision(r.decision, r.reason, r.txHash, cycleCount, elapsed);
      resolve();
    }).catch((err) => {
      stream.toolError("agent", err instanceof Error ? err.message : String(err));
      resolve();
    });
  });

  await waitUntilExit();
  return result;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/trigger") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (agentRunning) {
    res.writeHead(409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent already running" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  await new Promise<void>((resolve) => req.on("end", resolve));

  let nftId = defaultNftId;
  let bodySecret: string | undefined;
  try {
    const parsed = JSON.parse(body) as { nftId?: number; secret?: string };
    if (typeof parsed.nftId === "number") nftId = parsed.nftId;
    if (typeof parsed.secret === "string") bodySecret = parsed.secret;
  } catch { /* use default */ }

  const headerAuth = req.headers["authorization"] ?? "";
  const validHeader = SECRET && headerAuth === `Bearer ${SECRET}`;
  const validBody   = SECRET && bodySecret === SECRET;
  if (!validHeader && !validBody) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  agentRunning = true;
  console.log(`\n  ${chalk.dim(nowTime())}   ${chalk.hex(C.warning)("TRIGGER")}   nft #${nftId}`);

  try {
    const result = await handleAgentRun(nftId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    console.log(`  ${chalk.dim(nowTime())}   ${chalk.hex(C.success)("DONE")}      decision: ${result.decision}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
    console.log(`  ${chalk.dim(nowTime())}   ${chalk.hex(C.error)("ERROR")}     ${msg}`);
  } finally {
    agentRunning = false;
  }
});

server.listen(PORT, () => {
  console.log();
  console.log(`  ${chalk.hex(C.brand).bold("◈ NerOS")}  ${chalk.dim("Webhook Server")}  ${chalk.dim("·")}  ${chalk.dim("listening")} ${chalk.hex(C.accent)(`:${PORT}`)}`);
  console.log(`  ${chalk.dim(SEP)}`);
  console.log(`  ${chalk.dim("POST /trigger")}   ${chalk.dim("Authorization: Bearer $WEBHOOK_SECRET")}`);
  console.log(`  ${chalk.dim(`Default NFT: #${defaultNftId}`)}`);
  console.log();
});
