# TASK.md — iNFT Portfolio Manager

> **Legend**: `[ ]` Todo · `[~]` In Progress · `[x]` Done · `[!]` Blocked

---

## DAY 1 — Foundation

### Setup & Scaffold
- [x] **T-001** `npm init`, `npx hardhat init --typescript`
- [x] **T-002** Install deps:
  ```
  @openzeppelin/contracts  @uniswap/v3-periphery  @0glabs/0g-serving-broker
  @0gfoundation/0g-ts-sdk  ethers@6  ink  @inkjs/ui  chalk  ora  boxen  commander
  dotenv  tsx
  ```
- [x] **T-003** Create `.env.example` (all keys from CLAUDE.md)
- [x] **T-004** Configure `hardhat.config.ts`: Sepolia + Etherscan verify
- [ ] **T-005** `tsconfig.json`: `"jsx": "react"` (required for Ink), `"moduleResolution": "bundler"`
- [ ] **T-006** Add scripts to `package.json`:
  ```json
  "mint":             "tsx cli/commands/mint.ts",
  "agent":            "tsx cli/commands/agent.ts",
  "history":          "tsx cli/commands/history.ts",
  "send-instruction": "tsx cli/commands/send-instruction.ts",
  "watch":            "tsx cli/commands/watch.ts"
  ```

### 0G Storage Layer
- [ ] **T-010** Create `0g/schema.ts` — `NFTPersonality`, `TradeMemory`, `TradeRecord` interfaces (see PLAN.md §1.3)
- [ ] **T-011** Create `0g/client.ts`:
  - `uploadJSON(data: object): Promise<string>` → returns CID
  - `downloadJSON<T>(cid: string): Promise<T>` → returns parsed object
- [ ] **T-012** Smoke test: upload `{ hello: "world" }` → get CID → download → assert equal
- [ ] **T-013** Confirm 0G testnet is reachable; log CID to console

### iNFT Smart Contract
- [ ] **T-020** Write `contracts/iNFT.sol` (see PLAN.md §1.2):
  - `Intelligence` struct: `personalityHash` (string CID), `memoryHash` (string CID), `portfolioManager`, `riskLevel`, `isActive`
  - `mint(personalityCID, riskLevel)` → emits `Minted(tokenId, owner, personalityCID)`
  - `updateMemory(tokenId, newCID)` → `onlyAuthorized` modifier
  - `setPortfolioManager(tokenId, addr)` → only NFT owner
  - `getIntelligence(tokenId)` → view
- [ ] **T-021** Write `test/iNFT.test.ts` — mint, updateMemory, access control
- [ ] **T-022** Write `scripts/deploy-inft.ts` → logs address, writes to `deployments.json`
- [ ] **T-023** Deploy to Sepolia + `npx hardhat verify`

### Day 1 Integration Check
- [ ] **T-030** Script: upload personality JSON to 0G → call `iNFT.mint(cid, 7)` → log tokenId
- [ ] **T-031** Read `getIntelligence(1).personalityHash` on-chain, matches uploaded CID
- [ ] **T-032** Download personality from 0G using on-chain CID — confirm readable JSON

---

## DAY 2 — Intelligence Layer

### Agent Modules
- [ ] **T-040** `intelligence/agent/personality.ts`:
  - `loadPersonality(nftId)` → reads on-chain `personalityHash` → downloads from 0G → returns `NFTPersonality`
- [ ] **T-041** `intelligence/agent/memory.ts`:
  - `loadMemory(nftId)` → reads on-chain `memoryHash` → downloads from 0G → returns `TradeMemory`
  - `appendTrade(nftId, record)` → download current memory → append → upload new version → call `iNFT.updateMemory(tokenId, newCID)`
- [ ] **T-042** `intelligence/agent/market.ts`:
  - `getPrice(token)` → CoinGecko free API → `{ price, change24h, volume }`
- [ ] **T-043** `intelligence/agent/strategy.ts` — main 0G Compute agent runner:
  - Init broker: `createZGComputeNetworkBroker(wallet)` from `@0glabs/0g-serving-broker`
  - Get endpoint + headers: `broker.inference.getServiceMetadata(providerAddress)` + `broker.inference.getRequestHeaders(providerAddress)`
  - Define 6 tools in OpenAI-compatible format (endpoint accepts `/chat/completions`)
  - Tool-use loop: POST to `${endpoint}/chat/completions` → handle `tool_calls` → send results → repeat until `finish_reason === "stop"`
  - Build system prompt from `NFTPersonality`
  - Return `{ decision, reason, txHash, trace }`

### Tool Handlers (stubs acceptable for Day 2)
- [ ] **T-044** `read_memory` → calls `loadMemory()` + `loadPersonality()`
- [ ] **T-045** `get_market_data` → calls `getPrice()`
- [ ] **T-046** `get_portfolio_balance` → stub: returns hardcoded `{ USDC: "100", ETH: "0.01" }` (real: Day 3)
- [ ] **T-047** `read_ens_instructions` → stub: returns `null` (real: Day 3)
- [ ] **T-048** `execute_trade` → stub: logs intent, returns `{ txHash: "0xstub" }` (real: Day 3)
- [ ] **T-049** `write_memory` → calls `appendTrade()`

### Agent Validation
- [ ] **T-050** Run `npm run agent -- --nft-id 1`; confirm no crash
- [ ] **T-051** Claude calls `read_memory` and `get_market_data` in every run
- [ ] **T-052** Claude calls `write_memory` as the final tool call every run
- [ ] **T-053** On-chain `memoryHash` changes after run (new 0G CID)
- [ ] **T-054** Save full tool-call trace to `intelligence/logs/run-{timestamp}.json`

---

## DAY 3 — DeFi + ENS Integration

### PortfolioManager Contract
- [ ] **T-060** Write `contracts/PortfolioManager.sol` (see PLAN.md §3.1):
  - `executeTrade(nftId, tokenIn, tokenOut, amountIn, amountOutMin, poolFee)` → `ISwapRouter.exactInputSingle()`
  - `getBalance(nftId, token)` → view
  - `onlyAuthorized` modifier (agent wallet + KeeperAdapter)
  - Reverts if `amountOutMin == 0`
  - Emits `TradeExecuted(nftId, tokenIn, tokenOut, amountIn, amountOut)`
- [ ] **T-061** `contracts/interfaces/IPortfolioManager.sol`
- [ ] **T-062** `test/PortfolioManager.test.ts` — Hardhat mainnet fork, real Uniswap pool
- [ ] **T-063** Deploy `PortfolioManager.sol` to Sepolia + verify
- [ ] **T-064** Fund portfolio contract: 0.1 ETH + 100 USDC on Sepolia

### Uniswap Wiring
- [ ] **T-065** Replace `execute_trade` stub with real handler:
  - Calculate `amountOutMin` from CoinGecko price with 0.5% slippage
  - Call `PortfolioManager.executeTrade()` via ethers
  - Await tx confirmation, return `{ txHash, amountOut }`
- [ ] **T-066** Run agent, confirm real swap tx appears on Sepolia Etherscan
- [ ] **T-067** Replace `get_portfolio_balance` stub: call `PortfolioManager.getBalance()`

### ENS Integration
- [ ] **T-070** Register ENS name (e.g. `alphabot.eth`) on Sepolia ENS testnet
- [ ] **T-071** `intelligence/agent/ens.ts`:
  - `readInstruction(ensName)` → `resolver.getText("inft.instruction")`
  - `clearInstruction(ensName, wallet)` → `resolver.setText(..., "")`
- [ ] **T-072** Replace `read_ens_instructions` stub with real ENS read
- [ ] **T-073** After agent processes instruction, call `clearInstruction()`
- [ ] **T-074** Test: set text record "be very conservative" → run agent → Claude uses it in reasoning

### Day 3 Integration Check
- [ ] **T-080** Full E2E: `npm run agent` → 6 real tool calls → real Uniswap swap → 0G memory updated
- [ ] **T-081** `npm run send-instruction -- "sell everything"` → ENS updated → next agent run responds
- [ ] **T-082** Trade record in 0G log has real `txHash` (not "0xstub")

---

## DAY 4 — Automation + CLI Polish

### KeeperHub
- [ ] **T-090** Write `contracts/KeeperAdapter.sol` (see PLAN.md §4.1)
- [ ] **T-091** Deploy `KeeperAdapter.sol` to Sepolia + verify
- [ ] **T-092** Register job on KeeperHub dashboard, link to deployed contract
- [ ] **T-093** Write `intelligence/keeper/runner.ts`:
  - `watchAndRun(nftId)` → subscribe to `UpkeepTriggered` event → call agent
  - Print to Ink UI: `[Keeper] Triggered {time} → running agent...`
- [ ] **T-094** Run `npm run watch -- --nft-id 1`, wait for first automated trigger

### Ink CLI — Components
- [ ] **T-100** `cli/components/Header.tsx` — boxen-style header:
  ```
  ╭─ AlphaBot · alphabot.eth ──────────────────────────────╮
  │  Risk 7/10 · aggressive · 0G: bafk...x7z ↗ · Cycle 13 │
  ╰─────────────────────────────────────────────────────────╯
  ```
- [ ] **T-101** `cli/components/ToolRow.tsx`:
  - `status: "running"` → `● tool_name  ⠸` (ora spinner)
  - `status: "done"` → `● tool_name  ✓  {summary}` (green checkmark)
  - `status: "error"` → `● tool_name  ✗  {error}` (red)
- [ ] **T-102** `cli/components/Decision.tsx`:
  ```
  ─────────────────────────────────────────────────────────
  {Claude's one-sentence reasoning streamed live}
  [BUY]  tx: 0x4a3f...c291  ↗ Etherscan        ← green badge
  [SELL] tx: ...                                 ← red badge
  [HOLD]                                         ← gray badge
  Cycle 13 · Runtime 4.2s
  ```
- [ ] **T-103** `cli/renderer.tsx` — root Ink `<App>` that composes Header + ToolRows + Decision; accepts agent stream as prop

### Ink CLI — Commands
- [ ] **T-104** `cli/commands/mint.ts`:
  - Prompt: name, risk level (1-10), style, preferred assets
  - Upload personality JSON to 0G → get CID
  - Call `iNFT.mint(cid, riskLevel)` → await tx
  - Print: `✓ iNFT #{id} minted · tx: 0x... ↗` + `✓ ENS: {name}.eth`
- [ ] **T-105** `cli/commands/agent.ts`:
  - Parse `--nft-id` flag (commander)
  - Start Ink `<App>`, render Header
  - Stream Claude tool calls → update ToolRow components in real time
  - On finish: render Decision component
- [ ] **T-106** `cli/commands/history.ts`:
  - Load `TradeMemory` from 0G
  - Print table: `Time | Action | Pair | Amount In | Amount Out | P&L | Reason | Tx`
  - P&L column: green positive, red negative
  - Footer: `Total P&L: +$187.40 · 12 trades`
- [ ] **T-107** `cli/commands/send-instruction.ts`:
  - Args: `--nft-id <n> "<instruction>"`
  - Read ENS name from personality → write text record
  - Print: `✓ ENS text record updated for {ensName}`
- [ ] **T-108** `cli/commands/watch.ts`:
  - Print keeper status header
  - Listen for `UpkeepTriggered` → run agent → show Ink renderer inline
  - Show countdown to next trigger (refresh every second)

### Day 4 Integration Check
- [ ] **T-110** All 5 `npm run` commands work without errors
- [ ] **T-111** `npm run agent` renders tool rows updating in real-time (not all at once)
- [ ] **T-112** `npm run history` shows real trades from 0G with correct P&L
- [ ] **T-113** `npm run watch` shows keeper trigger then auto-runs agent

---

## DAY 5 — Demo Prep

### Pre-seed Demo State
- [ ] **T-120** Seed "AlphaBot" with 10+ trade records in 0G memory (script: `scripts/seed-memory.ts`)
- [ ] **T-121** Confirm total P&L shows +$150 to +$200
- [ ] **T-122** All seed txHash values are real Sepolia transactions
- [ ] **T-123** Fund demo wallet: 0.5 ETH + 200 USDC on Sepolia

### CLI Polish
- [ ] **T-130** Stream Claude's reasoning text token-by-token as it arrives (not buffered)
- [ ] **T-131** OSC 8 terminal hyperlinks for Etherscan + 0G explorer URLs (clickable in iTerm2/VS Code terminal)
- [ ] **T-132** `npm run watch` shows live countdown timer: `Next trigger in 4m 32s`
- [ ] **T-133** `npm run agent -- --force` flag: bypass Keeper INTERVAL check, run immediately (demo fallback)

### Demo Rehearsal
- [ ] **T-140** Time full 5-command demo: must complete in < 3 minutes
- [ ] **T-141** Run demo on a clean terminal (no previous output)
- [ ] **T-142** Prepare split terminal: Terminal A (commands) + Terminal B (`npm run watch`)
- [ ] **T-143** Write 30-second pitch: "I minted an NFT. It made me $187 while I slept."
- [ ] **T-144** Verify all Etherscan links open correctly in browser

### Submission
- [ ] **T-150** Write `README.md`: what it is, architecture diagram, 5 commands, integration list
- [ ] **T-151** Record 2-min demo video (fallback if live demo fails)
- [ ] **T-152** Submit to hackathon portal:
  - [ ] 0G Storage — personality + memory CIDs
  - [ ] ENS — name + text record demo
  - [ ] Uniswap — real swap txHash
  - [ ] KeeperHub — job URL
- [ ] **T-153** Post in submission: all contract addresses, ENS name, 0G CIDs, Etherscan links

---

## Work Allocation (2-Person Team)

| Person | Days | Tasks |
|---|---|---|
| **Dev A** — Contracts + DeFi | Day 1-3 | T-020~023, T-060~074, T-090~094 |
| **Dev B** — Agent + 0G | Day 1-3 | T-010~013, T-040~054 |
| **Dev A** | Day 4 | T-104~108 (CLI commands) |
| **Dev B** | Day 4 | T-100~103 (Ink components) |
| **Both** | Day 5 | T-120~153 |

---

## Definition of Done

A task is done when:
1. Code runs without errors on the demo path
2. The specific assertion/output in the task matches
3. Contracts: deployed on Sepolia + verified on Etherscan
4. CLI: output renders correctly in terminal, no garbled Ink output
5. No `console.log` bypassing Ink in the demo path

---

## Deployed Addresses (fill in as you go)

| Item | Value |
|---|---|
| iNFT.sol | `TBD` |
| PortfolioManager.sol | `TBD` |
| KeeperAdapter.sol | `TBD` |
| Demo iNFT ID | `#1` |
| ENS Name | `alphabot.eth` |
| Personality CID (0G) | `TBD` |
| Memory CID (0G) | `TBD` |
| KeeperHub Job URL | `TBD` |
