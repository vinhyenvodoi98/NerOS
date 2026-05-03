# PLAN.md — iNFT Portfolio Manager

## Executive Summary

Build an intelligent NFT that autonomously manages a DeFi portfolio. Demo is entirely CLI-based — styled with Ink (React for terminal) to match the feel of Claude Code itself. No frontend required.

Target: **0G Track 2 — iNFT Innovation** + ENS + Uniswap + KeeperHub.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    JUDGE / USER (terminal)                    │
│              npm run mint / agent / history / watch          │
└───────────────────────┬──────────────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │    Ink CLI Layer   │  ← Claude Code-style terminal UI
              │  (React + chalk)   │    Header, ToolRow, Decision
              └─────────┬──────────┘
                        │
        ┌───────────────┼────────────────────┐
        │               │                    │
┌───────▼──────┐ ┌──────▼───────┐ ┌─────────▼────────┐
│  iNFT.sol    │ │PortfolioMgr  │ │  KeeperAdapter   │
│  (ERC-721)   │ │  .sol        │ │  .sol            │
│              │ │ Uniswap V3   │ │ checkUpkeep /    │
│ personalityH │ │ exactInput   │ │ performUpkeep    │
│ memoryHash   │ │ Single()     │ │ INTERVAL = 300s  │
└──────┬───────┘ └──────────────┘ └────────┬─────────┘
       │                                    │
       │  0G Storage                        │  KeeperHub (on-chain)
       │  ┌──────────────────────┐          │  ┌────────────────────┐
       └─►│  NFTPersonality JSON │          └─►│  intelligence/     │
          │  TradeMemory log     │             │  keeper/runner.ts  │
          │  Decision traces     │             │  (event listener)  │
          └──────────────────────┘             └────────┬───────────┘
                                                        │
                                              ┌─────────▼──────────┐
                                              │  intelligence/     │
                                              │  agent/strategy.ts │
                                              │                    │
                                              │  0G Compute        │
                                              │  AI Inference      │
                                              │  tool-use loop:    │
                                              │  read_memory       │
                                              │  get_market_data   │
                                              │  get_portfolio     │
                                              │  read_ens_instr    │
                                              │  execute_trade     │
                                              │  write_memory      │
                                              └────────────────────┘
```

---

## Phase Plan (5-Day Hackathon)

### Phase 1 — Foundation (Day 1)
**Goal**: Contracts deployed, 0G connected, basic mint works.

#### 1.1 Project Scaffold
- `npm init`, `npx hardhat init --typescript`
- Install: `@openzeppelin/contracts`, `@uniswap/v3-periphery`, `@0glabs/0g-serving-broker`, `@0gfoundation/0g-ts-sdk`, `ethers@6`, `ink`, `chalk`, `ora`, `boxen`
- `.env` with all keys from CLAUDE.md
- `hardhat.config.ts`: Sepolia + Etherscan verify

#### 1.2 iNFT Contract (`contracts/iNFT.sol`)
```solidity
contract iNFT is ERC721, Ownable {
    struct Intelligence {
        string  personalityHash; // 0G CID
        string  memoryHash;      // 0G CID (updated after each trade)
        address portfolioManager;
        uint8   riskLevel;       // 1-10
        bool    isActive;
    }
    mapping(uint256 => Intelligence) public intelligence;

    function mint(string calldata personalityCID, uint8 riskLevel)
        external returns (uint256 tokenId);

    function updateMemory(uint256 tokenId, string calldata newCID)
        external onlyAuthorized;

    function getIntelligence(uint256 tokenId)
        external view returns (Intelligence memory);
}
```

#### 1.3 0G Storage Schema (`0g/schema.ts`)
```typescript
interface NFTPersonality {
  nftId: number;
  name: string;           // "NerOSBot"
  ensName: string;        // "alpha-nft.eth"
  riskTolerance: number;  // 1-10
  style: "aggressive" | "balanced" | "conservative";
  preferredAssets: string[];
  maxPositionPct: number;
  createdAt: number;
}

interface TradeMemory {
  nftId: number;
  trades: TradeRecord[];
  totalPnL: number;
  lastUpdated: number;
}

interface TradeRecord {
  timestamp: number;
  action: "buy" | "sell" | "hold";
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  txHash: string | null;
  reason: string;
  priceAtExecution: number;
}
```

#### 1.4 Checkpoint
- `npx hardhat compile` passes
- `iNFT.sol` deployed + verified on Sepolia
- `npm run mint` → personality uploaded to 0G → CID stored on-chain → readable back

---

### Phase 2 — Intelligence Layer (Day 2)
**Goal**: 0G Compute AI Inference makes decisions using 0G memory, full tool-use loop runs.

#### 2.1 0G Compute Agent Tools

0G Compute uses `@0glabs/0g-serving-broker` for auth/billing, then calls a standard `/chat/completions` endpoint. Tools are defined in OpenAI-compatible format.

```typescript
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const broker = await createZGComputeNetworkBroker(wallet);

// Get inference endpoint + signed request headers
const { endpoint, model } = await broker.inference.getServiceMetadata(
  process.env.ZERO_G_PROVIDER_ADDRESS!
);
const headers = await broker.inference.getRequestHeaders(
  process.env.ZERO_G_PROVIDER_ADDRESS!
);

// Tool definitions — OpenAI-compatible format (endpoint accepts /chat/completions)
const tools = [
  { type: "function", function: {
      name: "read_memory",
      description: "Load NFT personality and trade history from 0G Storage",
      parameters: { type: "object", properties: { nftId: { type: "number" } }, required: ["nftId"] } } },
  { type: "function", function: {
      name: "get_market_data",
      description: "Get current price, 24h change, and volume from CoinGecko",
      parameters: { type: "object", properties: { token: { type: "string" } }, required: ["token"] } } },
  { type: "function", function: {
      name: "get_portfolio_balance",
      description: "Get current token balances from PortfolioManager contract",
      parameters: { type: "object", properties: { nftId: { type: "number" } }, required: ["nftId"] } } },
  { type: "function", function: {
      name: "read_ens_instructions",
      description: "Read owner instruction from ENS text record inft.instruction",
      parameters: { type: "object", properties: { ensName: { type: "string" } }, required: ["ensName"] } } },
  { type: "function", function: {
      name: "execute_trade",
      description: "Execute a swap via PortfolioManager → Uniswap V3",
      parameters: { type: "object",
        properties: { tokenIn: { type: "string" }, tokenOut: { type: "string" },
                      amountIn: { type: "string" }, slippagePct: { type: "number" } },
        required: ["tokenIn", "tokenOut", "amountIn", "slippagePct"] } } },
  { type: "function", function: {
      name: "write_memory",
      description: "Append trade record to 0G Storage and update on-chain CID",
      parameters: { type: "object", properties: { nftId: { type: "number" }, record: { type: "object" } }, required: ["nftId", "record"] } } },
];
```

#### 2.2 Decision Loop

```typescript
const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: "Run your decision cycle." }];

while (true) {
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ model, messages, tools }),
  });
  const data = await res.json();
  const choice = data.choices[0];

  if (choice.finish_reason === "stop") break;

  // handle tool_calls
  for (const call of choice.message.tool_calls ?? []) {
    const args = JSON.parse(call.function.arguments);
    const result = await toolHandlers[call.function.name](args);
    messages.push(choice.message);
    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
  }
}

// Flow: read_memory → get_market_data → get_portfolio_balance
//       → read_ens_instructions → [model reasons]
//       → execute_trade (if BUY/SELL) → write_memory
```

#### 2.3 Agent Execution Flow — Network Map

```
npm run agent -- --nft-id 1
        │
        ▼
cli/commands/agent.ts
  └─ resolveNftId(1)               [local]
  └─ runAgent(1)
        │
        ├── INIT ─────────────────────────────────────────────────────
        │
        │  [0G EVM Testnet]  evmrpc-testnet.0g.ai
        │    createZGComputeNetworkBroker(zgWallet)
        │      └─ reads 0G LedgerBroker + ServiceRegistry contracts
        │    broker.inference.getServiceMetadata(providerAddress)
        │      └─ returns: endpoint URL + model name
        │
        │  [Sepolia]  RPC_URL
        │    loadPersonality(nftId)
        │      └─ iNFT.getIntelligence(1)  → personalityHash (0G CID)
        │      [0G Storage]  ZERO_G_RPC
        │        └─ downloadJSON(cid)  → NFTPersonality object
        │
        ├── TOOL-USE LOOP (repeats until finish_reason = "stop") ────
        │
        │  [0G Compute]  endpoint/chat/completions
        │    broker.inference.getRequestHeaders()  ← billing headers
        │    POST /chat/completions  { messages, tools, tool_choice }
        │      └─ AI returns: tool_calls[] or finish_reason="stop"
        │
        │  For each tool_call the AI requests:
        │
        │  ● read_memory
        │    [Sepolia]     iNFT.getIntelligence(1) → memoryHash
        │    [0G Storage]  downloadJSON(memoryHash) → TradeMemory
        │
        │  ● get_market_data
        │    [CoinGecko API]  price / change24h / volume
        │
        │  ● get_portfolio_balance
        │    [stub → Day 3: Sepolia PortfolioManager.getBalance()]
        │
        │  ● read_ens_instructions
        │    [stub → Day 3: Sepolia ENS resolver getText()]
        │
        │  ● execute_trade
        │    [stub → Day 3: Sepolia Uniswap V3 via PortfolioManager]
        │
        │  ● write_memory  (always the final tool call)
        │    [0G Storage]  uploadJSON(memory)      → newCid
        │    [Sepolia]     iNFT.updateMemory(1, newCid)  → tx confirmed
        │
        │    ↑ tool result sent back to AI → loop continues
        │
        ├── POST-LOOP ────────────────────────────────────────────────
        │
        │  [local]  validate T-051/T-052 (warn if violated)
        │  [local]  write intelligence/logs/run-{ts}.json
        │
        └── return { decision, reason, txHash, trace }
              ▼
        cli/commands/agent.ts  prints trace + decision to terminal
```

**Network summary:**

| Network | Purpose | Env var |
|---|---|---|
| 0G EVM Testnet | broker init, billing headers | `ZERO_G_EVM_RPC` (default: `evmrpc-testnet.0g.ai`) |
| 0G Compute | AI inference (`/chat/completions`) | `ZERO_G_PROVIDER_ADDRESS` |
| 0G Storage | upload/download JSON (personality, memory) | `ZERO_G_RPC`, `ZERO_G_PRIVATE_KEY` |
| Sepolia | iNFT contract (`getIntelligence`, `updateMemory`) | `RPC_URL`, `PRIVATE_KEY` |
| CoinGecko | market prices | no key needed |

#### 2.4 System Prompt (sent to 0G Compute inference)
```
You are the autonomous AI brain of iNFT #{id}, named {name}.
Personality: {style}, risk level {riskLevel}/10.
Max {maxPositionPct}% of portfolio in any single asset.

Use your tools to gather data. Make exactly ONE decision: BUY, SELL, or HOLD.
If BUY or SELL, call execute_trade. Always end by calling write_memory.
Justify every decision in one sentence.
If owner sent ENS instructions, prioritize them.
```

> Model selection: use whichever model 0G Compute exposes that supports function calling (tool use). Check `ZERO_G_COMPUTE_URL` docs for available model IDs.

#### 2.4 Checkpoint
- `npm run agent -- --nft-id 1` runs, shows all tool calls streaming in Ink
- 0G Compute AI calls `write_memory` every run
- 0G CID changes on-chain after run

---

### Phase 3 — DeFi + ENS Integration (Day 3)
**Goal**: Real Uniswap swaps execute; ENS instruction channel works.

#### 3.1 PortfolioManager Contract (`contracts/PortfolioManager.sol`)
```solidity
contract PortfolioManager {
    ISwapRouter public immutable swapRouter;
    address public immutable iNFTContract;
    mapping(uint256 => mapping(address => uint256)) public balances;

    function executeTrade(
        uint256 nftId,
        address tokenIn, address tokenOut,
        uint256 amountIn, uint256 amountOutMin,
        uint24 poolFee
    ) external onlyAuthorized returns (uint256 amountOut);

    function getBalance(uint256 nftId, address token)
        external view returns (uint256);
}
```
- Uses `ISwapRouter.exactInputSingle()` with `deadline = block.timestamp + 300`
- Pool fee: 3000 for ETH/USDC
- Reverts if `amountOutMin == 0`

#### 3.2 ENS Instruction Channel (`intelligence/agent/ens.ts`)
```typescript
// Read: provider.getResolver(ensName).getText("inft.instruction")
// Clear after processing: resolver.setText(namehash, "inft.instruction", "")
```
- Owner sets ENS text record → agent reads next cycle → clears after use

#### 3.3 Checkpoint
- `PortfolioManager` deployed, funded with 0.1 ETH + 100 USDC on Sepolia
- Real swap tx visible on Etherscan
- `npm run send-instruction -- "be conservative"` → ENS record updates → next agent run shows different reasoning

---

### Phase 4 — Automation + CLI Polish (Day 4)
**Goal**: KeeperHub runs autonomously; CLI looks like Claude Code.

#### 4.1 KeeperAdapter Contract (`contracts/KeeperAdapter.sol`)
```solidity
contract KeeperAdapter {
    uint256 public constant INTERVAL = 300;
    uint256 public lastRunTimestamp;

    function checkUpkeep(bytes calldata)
        external view returns (bool upkeepNeeded, bytes memory);

    function performUpkeep(bytes calldata) external {
        require(block.timestamp - lastRunTimestamp >= INTERVAL);
        lastRunTimestamp = block.timestamp;
        emit UpkeepTriggered(block.timestamp);
    }
    event UpkeepTriggered(uint256 timestamp);
}
```

#### 4.2 Keeper Runner (`intelligence/keeper/runner.ts`)
```typescript
// Listen for UpkeepTriggered → call runIntelligenceAgent(nftId)
// Ink UI shows: [Keeper] Triggered 14:23:05 → running agent...
```

#### 4.3 Ink CLI Renderer (`cli/`)

**Components**:
```tsx
// cli/components/Header.tsx
// ╭─ NerOSBot · alpha-nft.eth ─────────────────────────────╮
// │  Risk 7/10 · aggressive · 0G: bafk...x7z ↗            │
// ╰─────────────────────────────────────────────────────────╯

// cli/components/ToolRow.tsx
// ● read_memory     ⠸  (spinner while running)
// ● read_memory     ✓  12 trades · P&L +$187.40   (on complete)

// cli/components/Decision.tsx
// ─────────────────────────────────────────────────────────
// ETH has retraced to $2,400 support. Buying 40 USDC worth.
// [BUY]  tx: 0x4a3f...c291  ↗ Etherscan
// Cycle 13 · 4.2s
```

**Commands** (all in `cli/commands/`):
- `mint.ts` — interactive personality setup, uploads to 0G, mints NFT
- `agent.ts` — renders Ink app, streams 0G Compute AI tool calls live
- `history.ts` — reads 0G memory, prints trade table with P&L column
- `send-instruction.ts` — writes ENS text record, confirms
- `watch.ts` — keeper watcher, shows countdown + auto-triggers agent

#### 4.4 Checkpoint
- KeeperHub job registered on Sepolia, triggering every 5 min
- All 5 CLI commands work end-to-end
- Ink output matches Claude Code visual style (spinners, checkmarks, boxes)

---

### Phase 6 — KeeperHub Integration (ETHGlobal Prize Track)
**Goal**: Replace polling-based `watch.tsx` with KeeperHub as the authoritative scheduler and executor. Target: ETHGlobal KeeperHub "Most Innovative Application" prize ($2,500).

#### Why KeeperHub matters (not just Chainlink)
The current `KeeperAdapter.sol` uses the Chainlink-compatible `checkUpkeep`/`performUpkeep` interface, but the ETHGlobal prize specifically requires integration via **KeeperHub's own platform** (app.keeperhub.com) — which provides a non-custodial Turnkey wallet, native Uniswap support, cron scheduling, HTTP actions, and an MCP server.

#### Architecture — 3 integration levels

```
Level 1 (Must)          Level 2 (Better)         Level 3 (Stretch)
──────────────          ────────────────          ─────────────────
KeeperHub               KeeperHub                 KeeperHub
  Cron (5 min)            Cron (5 min)              Cron (5 min)
  ↓                       ↓                         ↓
  performUpkeep()         HTTP POST /trigger        HTTP POST /trigger
  on KeeperAdapter        (webhook server)          (webhook server)
  ↓                       ↓                         ↓
  UpkeepTriggered         runAgent()                runAgent()
  event on-chain          directly                  ↓
  ↓                       (no watch.tsx needed)     AI decides BUY/SELL
  watch.tsx picks up                                ↓
  event → runs agent                                KeeperHub Uniswap
                                                    action executes swap
                                                    (no local PRIVATE_KEY!)
```

#### 6.1 Level 1 — KeeperHub as on-chain scheduler (replaces manual `keeper --trigger`)

- Get KEEPERHUB_API_KEY from app.keeperhub.com
- Register workflow on KeeperHub dashboard:
  - **Trigger**: Scheduled, every 5 minutes
  - **Action**: Smart Contract Call → `KeeperAdapter.performUpkeep(bytes "")` on Sepolia
  - Fund KeeperHub wallet with Sepolia ETH for gas
- `watch.tsx` continues to poll for `UpkeepTriggered` event (already implemented)
- **Demo**: Show KeeperHub dashboard job history alongside `watch.tsx` output

#### 6.2 Level 2 — KeeperHub HTTP webhook (removes local `watch.tsx` dependency)

```typescript
// cli/commands/serve.ts — new command: npm run serve -- --nft-id 1
// HTTP server receives POST /trigger from KeeperHub → runs agent → returns JSON

POST /trigger
  Authorization: Bearer WEBHOOK_SECRET
  Body: { nftId: 1 }

Response: { decision: "buy", reason: "...", txHash: "0x..." }
```

- Register second KeeperHub workflow:
  - **Trigger**: Scheduled, every 5 minutes
  - **Action**: HTTP POST to `https://<ngrok or VPS>/trigger`
  - Header: `Authorization: Bearer ${WEBHOOK_SECRET}`
  - Body: `{ "nftId": 1 }`
- `npm run serve` starts the webhook server, listens on WEBHOOK_PORT
- Agent runs on demand without `watch.tsx` polling

#### 6.3 Level 3 — KeeperHub Uniswap execution (no local private key for trades)

- KeeperHub's Turnkey wallet executes the Uniswap swap
- Flow: agent returns `{ action: "buy", tokenIn: "USDC", tokenOut: "ETH", amount: "20" }`
- Webhook server calls KeeperHub API → triggers a "swap" workflow
- KeeperHub signs the tx from its HSM-backed wallet
- **Eliminates PRIVATE_KEY requirement** for trade execution

#### 6.4 Checkpoint
- KeeperHub dashboard shows ≥1 successful automated trigger
- Agent runs without manual `keeper --trigger`
- (Level 2) `npm run serve` handles full cycle without `watch.tsx`
- KeeperHub Job URL recorded in `deployments.json` + TASK.md

---

### Phase 5 — Demo Prep (Day 5)
**Goal**: Rehearsed, pre-seeded, no surprises.

#### 5.1 Pre-seed Demo State
- iNFT "NerOSBot" with 10+ historical trades in 0G memory
- Total P&L shows +$187-200
- All txHash values point to real Sepolia transactions

#### 5.2 CLI Polish
- Stream 0G Compute AI's reasoning text as it arrives (not after)
- `npm run history` → color P&L: green positive, red negative
- `npm run watch` → countdown timer to next Keeper run
- All Etherscan + 0G explorer links are clickable (OSC 8 hyperlinks in terminal)

#### 5.3 Demo Rehearsal
- Run the 5-command demo 3x from a clean terminal
- Time it: must finish in < 3 minutes
- Fallback: `npm run agent` has a `--force` flag to bypass Keeper and run immediately

#### 5.4 Submission
- README with architecture diagram + integration checklist
- 2-min screen recording (backup)
- Submit contract addresses, 0G CIDs, ENS name

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| 0G SDK API breaking / undocumented | High | Timebox 4h Day 1; fallback to IPFS if 0G upload fails |
| Uniswap no testnet liquidity | Medium | Hardhat mainnet fork for tests; use smallest swap amounts in demo |
| KeeperHub registration slow | Medium | Level 1 takes <10 min on dashboard; Level 2 needs ngrok or VPS |
| KeeperHub webhook unreachable | Medium | Use ngrok tunnel for demo; `npm run keeper -- --trigger` as fallback |
| KeeperHub wallet underfunded | High | Fund KeeperHub Turnkey wallet with 0.05 ETH Sepolia before demo |
| 0G Compute latency > 5s | Low | Stream response; Ink spinner shows progress |
| 0G Compute model lacks tool-use support | Medium | Fallback: parse JSON from raw completion; wrap in manual tool-call loop |
| Demo wallet underfunded | High | Pre-fund 2 wallets (0.5 ETH + 200 USDC each) day before |
| Terminal colors differ across machines | Low | Test on judge's OS; chalk auto-detects color support |

---

## Success Metrics

| Priority | Metric |
|---|---|
| Must | Real Uniswap tx + 0G memory update visible in one agent cycle |
| Must | 0G is critical path (personality + memory — not optional decoration) |
| Must | Ink CLI shows tool-use trace streaming live |
| Nice | ENS instruction visibly changes 0G Compute AI's next decision |
| Nice | P&L shows positive returns |
| Stretch | Two iNFTs with different personalities running in split terminal |
