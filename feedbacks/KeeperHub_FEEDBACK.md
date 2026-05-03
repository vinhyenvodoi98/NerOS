# KeeperHub — Builder Feedback

Project: **NerOS / iNFT Portfolio Manager**
Builder: vinhyenvodoi98
Date: 2026-05-03

---

## What We Built

An autonomous NFT that runs a DeFi portfolio 24/7 without human input. KeeperHub is the scheduler that wakes the AI agent on a cron and triggers on-chain + off-chain actions. We integrated at two levels:

- **Level 1** — KeeperHub calls `KeeperAdapter.performUpkeep()` on Sepolia on a cron. The on-chain event `UpkeepTriggered` is picked up by `intelligence/keeper/runner.ts`, which runs the AI agent.
- **Level 2** — KeeperHub POSTs to a webhook server (`cli/commands/serve.ts`). The server runs the full agent cycle and returns the decision as JSON.

Relevant files: [contracts/KeeperAdapter.sol](contracts/KeeperAdapter.sol), [cli/commands/serve.ts](cli/commands/serve.ts), [intelligence/keeper/runner.ts](intelligence/keeper/runner.ts), [cli/commands/keeper.ts](cli/commands/keeper.ts)

---

## What Worked Well

### 1. Dashboard registration is fast

Registering the upkeep on `app.keeperhub.com` took under 10 minutes: paste contract address, set trigger interval, fund the Turnkey wallet, done. No CLI needed for this path. For a hackathon timeline this is the right balance.

### 2. HTTP webhook action opens up agent-based architectures

The webhook action type is the most interesting feature for AI/agent projects. The flow — KeeperHub fires a POST on cron → your server runs an AI reasoning cycle → returns structured JSON — maps naturally onto autonomous agent patterns. Level 2 integration (webhook server in `serve.ts`) worked end-to-end. This is a compelling primitive.

### 3. Turnkey wallet model is the right security design

The non-custodial Turnkey wallet for on-chain execution means the builder never has to give KeeperHub a private key. From a security architecture standpoint this is correct, and the model is easy to explain: "I fund a wallet address, KeeperHub signs from it."

---

## Pain Points and Bugs

### 1. Webhook requires a public URL — no local dev tunnel or simulator

To use the HTTP webhook action, KeeperHub needs to reach your server. During a hackathon, the server is `localhost`. This forces ngrok (or a VPS) as a hard dependency before you can test Level 2 at all. We had ngrok set up, but it's extra friction and a failure mode during a live demo (tunnel drops, URL changes between ngrok sessions on the free tier).

**Ask:** Either a KeeperHub local dev proxy (like Stripe's `stripe listen`) or a "test webhook" button in the dashboard that fires a one-shot POST to a URL you paste, so you can verify your server response format without standing up a tunnel.

### 2. No way to know what JSON format KeeperHub expects in the webhook response

The webhook response from our server is arbitrary JSON. KeeperHub's docs don't specify whether it reads the response body for anything (e.g., to chain into a next action). We had to guess:
- Does KeeperHub read `result.swapAction` to trigger a follow-on Uniswap action?
- Does it only check the HTTP status code?
- Is there a schema for chaining webhook → on-chain action?

This ambiguity blocked Level 3. We structured the response to include a `swapAction` object ([serve.ts:182](cli/commands/serve.ts#L182)) but couldn't verify KeeperHub consumed it.

**Ask:** Document the webhook response schema — especially whether KeeperHub can chain a webhook response into a follow-on action (e.g., webhook returns `swapAction`, KeeperHub reads it and executes the swap).

### 3. Cron scheduler has no jitter / randomness option

With a fixed 300-second interval, every `performUpkeep` fires on the exact same cadence. For AI agents making market decisions this is fine, but it also means that if the webhook server is briefly down at the exact trigger time, the entire cycle is skipped until the next interval. A configurable jitter window (e.g., fire within ±30s of the interval) would improve reliability.

---

## What We Wish Existed

1. **Local dev tunnel / webhook simulator** — `keeperhub dev` that runs locally and fires test POSTs to `localhost:3000` on a schedule. Removes the ngrok dependency entirely.

2. **KeeperHub CLI / REST API** — `keeperhub jobs list`, `keeperhub jobs trigger <id>`, `keeperhub jobs history <id>`. Hackathon builders redeploy constantly; re-registering in the dashboard every time is friction.

3. **Low-balance wallet alerts** — email/webhook when the Turnkey wallet drops below a configurable ETH threshold. Essential for any always-on automation.

---

## Overall

Levels 1 and 2 shipped. Level 3 (the most compelling demo: AI decides → KeeperHub executes trade, no private key on the server) is blocked by the lack of arbitrary contract call support. That one feature would make KeeperHub the default automation layer for autonomous agents.
