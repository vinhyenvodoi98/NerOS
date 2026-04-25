# iNFT Portfolio Manager

## What This Project Is

An intelligent NFT that autonomously manages a DeFi portfolio. The NFT has an AI brain (Claude API + tool use), persistent memory and personality stored on 0G, a human-readable identity via ENS, executes real trades on Uniswap V3, and runs 24/7 via KeeperHub.

Demo pitch: *"I minted an NFT. It made me $200 while I slept. Here's the transaction history."*

**Primary target: 0G Track 2 — iNFT Innovation. Everything else serves that narrative.**

## Repository Structure

```
NerOS/
├── contracts/
│   ├── iNFT.sol                  # ERC-721, stores 0G CIDs on-chain
│   ├── PortfolioManager.sol      # Uniswap V3 swap execution
│   ├── KeeperAdapter.sol         # checkUpkeep / performUpkeep
│   └── interfaces/
├── intelligence/
│   ├── agent/
│   │   ├── strategy.ts           # Claude API tool-use loop (main brain)
│   │   ├── memory.ts             # 0G read/write for trade memory
│   │   ├── personality.ts        # Load NFT personality from 0G
│   │   ├── market.ts             # CoinGecko price fetcher
│   │   └── ens.ts                # ENS text record read/clear
│   └── keeper/
│       └── runner.ts             # Event listener → triggers agent
├── cli/
│   ├── renderer.tsx              # Ink root app (Claude Code-style UI)
│   ├── components/
│   │   ├── Header.tsx            # iNFT identity box
│   │   ├── ToolRow.tsx           # Per-tool spinner → checkmark + result
│   │   └── Decision.tsx          # BUY/SELL/HOLD badge + tx link
│   └── commands/
│       ├── mint.ts               # npm run mint
│       ├── agent.ts              # npm run agent
│       ├── history.ts            # npm run history
│       ├── send-instruction.ts   # npm run send-instruction
│       └── watch.ts              # npm run watch
├── 0g/
│   ├── schema.ts                 # NFTPersonality, TradeMemory interfaces
│   └── client.ts                 # uploadJSON / downloadJSON wrappers
├── scripts/
│   ├── deploy-inft.ts
│   ├── deploy-portfolio.ts
│   └── deploy-keeper.ts
├── test/
├── hardhat.config.ts
└── package.json
```

## Tech Stack

| Layer | Technology |
|---|---|
| Contracts | Solidity 0.8.24, Hardhat, OpenZeppelin |
| Chain | Ethereum Sepolia testnet |
| Storage | 0G Decentralized Storage Network |
| DEX | Uniswap V3 (SwapRouter02, `exactInputSingle`) |
| Identity | ENS (ethers v6 resolver, text records) |
| Automation | KeeperHub (`checkUpkeep` / `performUpkeep`) |
| AI Brain | Anthropic Claude API (claude-sonnet-4-6, tool use) |
| CLI UI | Ink (React for terminal), chalk, ora, boxen |
| Language | TypeScript throughout |

## Environment Variables

```bash
# .env — never commit
PRIVATE_KEY=              # deployer + agent signer
RPC_URL=                  # Sepolia RPC (Alchemy/Infura)
ANTHROPIC_API_KEY=        # Claude API
ZERO_G_RPC=               # 0G storage node endpoint
ZERO_G_PRIVATE_KEY=       # 0G storage signer
ENS_RESOLVER=             # ENS PublicResolver on Sepolia
UNISWAP_ROUTER=           # SwapRouter02 on Sepolia
KEEPERHUB_REGISTRY=       # KeeperHub registry address
ETHERSCAN_API_KEY=        # contract verification
```

## Critical Invariants

1. `PortfolioManager` enforces `maxPositionPct` on-chain — never bypass this check.
2. Every swap must set `amountOutMin > 0` — no unbounded slippage.
3. 0G trade history is **append-only** — never overwrite, only append + re-upload.
4. `performUpkeep` is idempotent — safe to call twice in the same block.
5. ENS instruction is cleared after the agent processes it — never re-apply.

## Commands

```bash
npm install                                      # install deps
npx hardhat compile                              # compile contracts
npx hardhat test                                 # run tests
npx hardhat run scripts/deploy-inft.ts --network sepolia

npm run mint                                     # mint iNFT, upload personality to 0G
npm run agent -- --nft-id 1                      # run one decision cycle (Ink UI)
npm run history -- --nft-id 1                    # print trade history from 0G
npm run send-instruction -- --nft-id 1 "be conservative"  # write ENS text record
npm run watch -- --nft-id 1                      # keeper watcher, autonomous loop
```

## Demo Script (CLI, ~3 min)

```
Terminal A                                  Terminal B
─────────────────────────────────           ──────────────────────────────
$ npm run mint                              $ npm run watch -- --nft-id 1
  ✓ Personality uploaded → 0G                [Keeper] Listening for triggers...
  ✓ iNFT #1 minted · tx: 0x...
  ✓ ENS: alpha-nft.eth assigned

$ npm run agent -- --nft-id 1
  ╭─ AlphaBot · alpha-nft.eth ──╮            [Keeper] Triggered at 14:23:05
  │ Risk 7/10 · aggressive      │            [Keeper] Running agent...
  ╰─────────────────────────────╯
  ● read_memory     ✓ 12 trades · +$187
  ● get_market_data ✓ ETH $2,401 ↓3.2%
  ● read_ens_instructions ✓ (none)
  ─────────────────────────────────
  ETH retraced to support. Buying.
  ● execute_trade   ✓ 0x4a3f...c291 ↗
  ● write_memory    ✓ CID: bafk...x7z ↗
  Decision: BUY · Cycle 13 · 4.2s

$ npm run send-instruction -- --nft-id 1 "be more conservative"
  ✓ ENS text record updated

$ npm run agent -- --nft-id 1           # shows adjusted behavior
$ npm run history -- --nft-id 1         # table of all trades + P&L
```

## Priorities for Claude Code

- **Demo path first**: code the exact 5-command sequence above before anything else.
- **Real transactions**: Sepolia only — no mocks in the demo path.
- **Ink over console.log**: all CLI output goes through Ink components.
- **Hackathon pace**: skip error handling for cases that can't happen in demo.
