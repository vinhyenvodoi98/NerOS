# iNFT — Autonomous DeFi Portfolio Manager

An intelligent NFT that autonomously manages a DeFi portfolio. The NFT has an AI brain (0G Compute inference + tool use), persistent memory stored on 0G Storage, a human-readable identity via ENS, executes real trades on Uniswap V3, and runs 24/7 via KeeperHub.

> *"I minted an NFT. It made me $200 while I slept. Here's the transaction history."*

---

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│  CLI (Ink)  │───▶│  Agent Brain │───▶│  0G Compute AI  │
└─────────────┘    │  strategy.ts │    │  (tool-use loop)│
                   └──────┬───────┘    └─────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌─────────────┐ ┌────────────┐ ┌──────────────┐
   │ 0G Storage  │ │  Sepolia   │ │  CoinGecko   │
   │ personality │ │iNFT / swap │ │ market data  │
   │   memory    │ │  contract  │ │              │
   └─────────────┘ └────────────┘ └──────────────┘
```

---

## Prerequisites

- Node.js 20+
- A funded Ethereum wallet (needs Sepolia ETH + 0G testnet tokens)
- Get **Sepolia ETH**: https://sepoliafaucet.com
- Get **0G testnet tokens**: https://faucet.0g.ai

---

## Environment Setup

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PRIVATE_KEY` | Deployer / agent wallet private key |
| `RPC_URL` | Sepolia RPC (e.g. from Alchemy or Infura) |
| `MAINNET_RPC_URL` | Mainnet RPC — required for ENS text-record reads/writes |
| `ZERO_G_PROVIDER_ADDRESS` | 0G Compute provider address |
| `ZERO_G_RPC` | 0G Storage indexer endpoint |
| `ZERO_G_PRIVATE_KEY` | 0G Storage signer (defaults to `PRIVATE_KEY` if not set) |
| `ENS_NAME` | ENS name owned by your wallet (e.g. `nerosbot.eth`) |
| `ENS_RESOLVER` | ENS Public Resolver address on Sepolia (if name is on Sepolia ENS testnet) |

---

## Quick Start

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Deploy the iNFT contract

```bash
npx hardhat run scripts/deploy-inft.ts --network sepolia
```

This writes the deployed address to `deployments.json`.

### Step 3 — Set up 0G Compute account (one-time)

This creates a billing ledger on the 0G network and funds the inference sub-account.
**Only needed once per wallet.** Re-run only if the sub-account balance runs out.

```bash
npx tsx --tsconfig tsconfig.cli.json scripts/setup-0g-account.ts
```

Expected output:
```
Wallet: 0x71C6...
0G balance: 10.49 0G
No ledger found — will create one
Creating ledger with 3 0G...
✓ Ledger created
No inference sub-account found — will create one
Transferring 2 0G to create inference sub-account...
✓ Inference sub-account created and funded with 2 0G

✓ 0G Compute account setup complete. Run: npm run agent -- --nft-id 1
```

### Step 4 — Deploy mock tokens and fund the portfolio (Sepolia testnet)

Real Sepolia USDC and WETH are difficult to obtain. Instead, deploy two mock ERC-20 tokens, create a Uniswap V3 pool for them, and seed the `PortfolioManager` — all in one command:

```bash
npm run deploy-mock
```

What it does:
1. Deploys `MockUSD` (mUSD, 18 dec) and `MockETH` (mETH, 18 dec)
2. Mints tokens to the deployer wallet
3. Creates a Uniswap V3 0.3% pool initialized at **1 mETH = 2,000 mUSD**
4. Adds 50,000 of each token as full-range liquidity
5. Deposits **200,000 mUSD + 100 mETH** (~$200k each side) into the `PortfolioManager` for nftId=1
6. Writes all addresses into `deployments.json`

After this the agent automatically picks up the mock token addresses — no further config needed.

> **Resumable:** Each step saves its result to `deployments.json` immediately on success. If the script fails mid-way, re-run `npm run deploy-mock` — completed steps are skipped automatically.

> **Uniswap V3 on Sepolia** uses a separate deployment from Mainnet/Goerli:
> - Factory: `0x0227628f3F023bb0B980b67D528571c95c6DaC1c`
> - NonfungiblePositionManager: `0x1238536071E1c677A632429e3655c799b22cDA52`

### Step 5 — Mint your iNFT

```bash
npm run mint
```

This uploads the NFT personality JSON to 0G Storage and mints the iNFT on Sepolia.

### Step 6 — Check portfolio balance

```bash
npm run balance -- --nft-id 1
```

Prints the current token balances held by the `PortfolioManager` for this NFT, with live USD values from CoinGecko:

```
  iNFT #1 · NerOSBot · nerosbot.eth
  ──────────────────────────────────────────────────────
  Token   Amount                Price         USD Value
  ──────────────────────────────────────────────────────
  ETH     86.008571             $2,300.76     $197,885.08
  USDC    217,907.04            $0.9998       $217,855.40
  ──────────────────────────────────────────────────────
  Total                                       $415,740.48

  ETH  24h: +1.79%   USDC 24h: +0.0060%
```

Automatically uses mock token addresses from `deployments.json` when present, otherwise falls back to real Sepolia WETH/USDC.

### Step 7 — Run the agent

```bash
npm run agent -- --nft-id 1
```

The agent will:
1. Load personality from 0G Storage (or reconstruct from on-chain data if unavailable)
2. Read any pending ENS instruction (`inft.instruction` text record on `nerosbot.eth`)
3. Call the 0G Compute AI in a tool-use loop
4. Fetch market data from CoinGecko
5. Make a BUY / SELL / HOLD decision
6. Execute a real Uniswap V3 swap via `PortfolioManager`
7. Clear the ENS instruction after it is processed
8. Write the trade record to 0G Storage and update the on-chain `memoryHash`
9. Save a full trace to `intelligence/logs/run-{timestamp}.json`

#### Agent flags

| Flag | Description | Default |
|---|---|---|
| `--nft-id <n>` | NFT token ID to manage | last minted |
| `--pool-fee <n>` | Uniswap V3 fee tier (`500`, `3000`, `10000`) | from `deployments.json` → `UniswapPool.fee` |
| `--token-a <SYMBOL:ADDRESS:DECIMALS>` | Override or add token A for the pool | from `deployments.json` |
| `--token-b <SYMBOL:ADDRESS:DECIMALS>` | Override or add token B for the pool | from `deployments.json` |

**Examples:**

```bash
# Default — pool fee and tokens auto-loaded from deployments.json
npm run agent -- --nft-id 1

# Override fee tier only (e.g. use the 0.05% pool)
npm run agent -- --nft-id 1 --pool-fee 500

# Use a completely different Uniswap V3 pool
npm run agent -- --nft-id 1 \
  --pool-fee 3000 \
  --token-a WETH:0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14:18 \
  --token-b USDC:0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238:6
```

Token symbols provided via `--token-a` / `--token-b` are passed to the AI so it knows which symbol names to use in `execute_trade` calls. They override the defaults loaded from `deployments.json`.

### Step 8 — Set up KeeperHub automation (24/7 upkeep)

KeeperHub calls `performUpkeep` on your `KeeperAdapter` contract on a schedule, keeping the agent running around the clock. Two sub-steps:

#### 8a — Deploy the KeeperAdapter contract

```bash
npx hardhat run scripts/deploy-keeper.ts --network sepolia
```

Writes the `KeeperAdapter` address to `deployments.json`.

#### 8b — Create the KeeperHub workflow

1. Go to [app.keeperhub.com](https://app.keeperhub.com) and sign in.
2. Click **New Workflow**.
3. Add a **Schedule** trigger: `*/5 * * * *` (every 5 minutes).
4. Add a **Smart Contract Call** action:
   - **Network**: Ethereum Sepolia
   - **Contract address**: value of `KeeperAdapter.address` from `deployments.json`
   - **ABI**: paste the `performUpkeep(bytes)` fragment — `[{"inputs":[{"name":"","type":"bytes"}],"name":"performUpkeep","outputs":[],"stateMutability":"nonpayable","type":"function"}]`
   - **Function**: `performUpkeep`
   - **calldata**: `0x`
5. Save and copy your **API key** from the dashboard → add it to `.env` as `KEEPERHUB_API_KEY`.

#### 8c — Fund the KeeperHub Turnkey wallet

KeeperHub uses a dedicated Turnkey wallet per workflow to pay for gas. Find the wallet address in the workflow settings page, then fund it:

```bash
# Fund the KeeperHub Turnkey wallet (replace with the address from your dashboard)
npm run keeper -- --fund 0.05 --address 0xYourTurnkeyWalletAddress

# Fund KeeperAdapter itself (so it can call forceUpkeep if needed)
npm run keeper -- --fund 0.05
```

Verify both show a non-zero balance before proceeding.

#### 8d — Verify end-to-end

Run the watch listener in one terminal, then wait up to 5 minutes for KeeperHub to fire automatically:

```bash
# Terminal A — watch for on-chain triggers
npm run watch -- --nft-id 1

# Terminal B — or force an immediate trigger to test right now
npm run keeper -- --trigger
```

A successful run shows `[Keeper] Triggered` in the watch log and a green ✓ in the KeeperHub job history.

---

## Demo Script (~3 min)

```
Terminal A                                  Terminal B
─────────────────────────────────           ──────────────────────────────
$ npm run mint                              $ npm run watch -- --nft-id 1
  ✓ Personality uploaded → 0G                [Keeper] Listening for triggers...
  ✓ iNFT #1 minted · tx: 0x...
  ✓ ENS: nerosbot.eth assigned

$ npm run balance -- --nft-id 1
  iNFT #1 · NerOSBot · nerosbot.eth
  ETH  86.008 · $197,885   USDC 217,907 · $217,855
  Total: $415,740

$ npm run agent -- --nft-id 1
  ─── Tool Call Trace ─────────────────       [Keeper] Triggered at 14:23:05
    ✓ read_memory                              [Keeper] Running agent...
    ✓ get_market_data · ETH $2401
    ✓ get_portfolio_balance
    ✓ execute_trade
    ✓ write_memory · BUY
  ─────────────────────────────────────
  ✓  T-051 PASS: read_memory + get_market_data called
  ✓  T-052 PASS: write_memory was final tool call
  Decision: BUY · Runtime 4.2s

$ npm run send-instruction -- --nft-id 1 "be more conservative"
  ✓ ENS text record updated

$ npm run agent -- --nft-id 1           # shows adjusted behavior
$ npm run history -- --nft-id 1         # table of all trades + P&L
```

---

## All Commands

```bash
npm install                                                    # install deps
npx hardhat compile                                            # compile contracts
npx hardhat test                                               # run tests

# ── Deploy ────────────────────────────────────────────────────────────────────
npx hardhat run scripts/deploy-inft.ts --network sepolia       # deploy iNFT contract
npm run deploy-mock                                            # deploy mock tokens + Uniswap pool + fund PM

# ── One-time setup ────────────────────────────────────────────────────────────
npx tsx --tsconfig tsconfig.cli.json scripts/setup-0g-account.ts  # fund 0G Compute account

# ── Demo commands ─────────────────────────────────────────────────────────────
npm run mint                                                   # mint iNFT, upload personality to 0G
npm run balance -- --nft-id 1                                  # show live portfolio balance + USD value
npm run agent -- --nft-id 1                                    # run one decision cycle (pool auto from deployments.json)
npm run agent -- --nft-id 1 --pool-fee 500                     # override pool fee tier
npm run agent -- --nft-id 1 --pool-fee 3000 \
  --token-a WETH:0xfFf...14:18 --token-b USDC:0x1c7...38:6   # use a custom pool
npm run history -- --nft-id 1                                  # print trade history from 0G
npm run send-instruction -- --nft-id 1 "be conservative"       # write ENS instruction
npm run watch -- --nft-id 1                                    # keeper watcher, autonomous loop

# ── KeeperHub ─────────────────────────────────────────────────────────────────
npx hardhat run scripts/deploy-keeper.ts --network sepolia     # deploy KeeperAdapter
npm run keeper -- --fund 0.05                                  # fund KeeperAdapter with ETH
npm run keeper -- --fund 0.05 --address 0xTurnkeyWallet        # fund KeeperHub Turnkey wallet
npm run keeper -- --trigger                                    # manually fire performUpkeep now
npm run keeper -- --stop                                       # pause keeper on-chain
npm run keeper -- --start                                      # resume keeper on-chain
npm run keeper -- --withdraw                                   # pull all ETH back from KeeperAdapter
```

---

## Known Issues

**`PM: insufficient balance` on `npm run agent`.**
The `PortfolioManager` has no tokens for nftId=1 yet. Run `npm run deploy-mock` first — it deposits 200,000 mUSD and 100 mETH.

**`npm run deploy-mock` fails at pool creation with `getPool returned no data`.**
The classic Uniswap V3 addresses (Mainnet/Goerli) are **not** deployed on Sepolia. The script already uses the correct Sepolia-specific addresses. If you see this error, verify that `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` (Factory) is live on [Sepolia Etherscan](https://sepolia.etherscan.io).

**`No ENS resolver found for nerosbot.eth`.**
This means `MAINNET_RPC_URL` is pointing to Sepolia, or the name is on Sepolia ENS and `ENS_RESOLVER` is not set. Set both in `.env`:
```
ENS_NAME=nerosbot.eth
ENS_RESOLVER=0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5   # Sepolia Public Resolver
MAINNET_RPC_URL=https://eth.drpc.org
```

**`setup-0g-account` must be run before the first `npm run agent`.**
If you see this error:
```
Error: Sub-account not found. Initialize it by transferring funds via "transfer-fund"
```
Run `scripts/setup-0g-account.ts` again. Your 0G sub-account balance may have been depleted.

**Personality CID unavailable on 0G testnet.**
If you see:
```
[personality] 0G download failed for CID 0x... — using on-chain fallback
```
This is normal on the volatile 0G testnet. The agent reconstructs the personality from the on-chain `riskLevel` and continues normally. Re-run `npm run mint` to re-upload the personality.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Contracts | Solidity 0.8.24, Hardhat, OpenZeppelin |
| Chain | Ethereum Sepolia testnet |
| Storage | 0G Decentralized Storage Network |
| DEX | Uniswap V3 (SwapRouter02) |
| Identity | ENS (ethers v6 resolver, text records) |
| Automation | KeeperHub (`checkUpkeep` / `performUpkeep`) |
| AI Brain | 0G Compute AI Inference (tool-use loop) |
| CLI UI | Ink (React for terminal), chalk, ora, boxen |
| Language | TypeScript throughout |
