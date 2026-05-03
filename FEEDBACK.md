# Uniswap Developer Platform — Builder Feedback

Project: **NerOS / iNFT Portfolio Manager**
Track: 0G Track 2 — iNFT Innovation
Builder: vinhyenvodoi98
Date: 2026-05-03

---

## What We Built

An ERC-721 NFT with an AI brain that autonomously executes DeFi trades. The core loop:
AI agent (running on 0G Compute) → decides buy/sell/hold → calls `PortfolioManager.executeTrade()` → which calls `SwapRouter02.exactInputSingle()` on Uniswap V3 Sepolia.

Relevant files: [contracts/PortfolioManager.sol](contracts/PortfolioManager.sol), [intelligence/agent/tools.ts](intelligence/agent/tools.ts), [test/PortfolioManager.test.ts](test/PortfolioManager.test.ts)

---

## What Worked Well

### 1. `exactInputSingle` is a clean, minimal API

The `SwapRouter02.exactInputSingle` surface is excellent. One function, one struct, one return value. An AI agent calling it through a wrapper contract needs exactly this level of simplicity. We wired it up in under 50 lines of Solidity ([PortfolioManager.sol:104-114](contracts/PortfolioManager.sol#L104-L114)).

### 2. Mainnet fork testing is the killer workflow

Being able to impersonate a Binance whale address and deposit real USDC into our contract on a local fork, then execute a real Uniswap V3 swap, was the most productive testing workflow we had. The tests in [test/PortfolioManager.test.ts:128-193](test/PortfolioManager.test.ts#L128-L193) confirmed the full swap path end-to-end without spending real ETH. This unlocked fast iteration.

### 3. SwapRouter02's no-deadline interface is cleaner

SwapRouter02 removing the `deadline` field from `ExactInputSingleParams` vs the original SwapRouter V1 is a good simplification. Our contract doesn't manage time-based expiry, so one less field to pass is a net win.

### 4. `SafeERC20.forceApprove` pairs well with SwapRouter

The `forceApprove` → `exactInputSingle` pattern worked cleanly. No double-approval issues, no stuck approvals from failed txs. SafeERC20 v5 handles the edge cases that used to trip up integrators.

---

## Pain Points and Bugs

### 1. SwapRouter02 address is hard to find for Sepolia

The Sepolia SwapRouter02 address (`0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`) is not prominently documented. We found it by digging through GitHub issues and cross-referencing the Uniswap app's network config. The main docs page for contract addresses only lists mainnet prominently. We hardcoded it in [scripts/deploy-portfolio.ts:7](scripts/deploy-portfolio.ts#L7) after 30 minutes of searching.

**Ask:** A single canonical "Uniswap V3 contract addresses by network" page that includes testnets.

### 2. SwapRouter V1 vs V2 interface discrepancy causes silent confusion

Many tutorials, Stack Overflow answers, and even some Uniswap docs reference the original `SwapRouter` (`0xE592427A...`) with a `deadline` field. SwapRouter02 drops that field. If you copy-paste from older examples, the struct is wrong and the ABI won't encode correctly. Took us an extra hour to diagnose. We left a comment in the contract ([PortfolioManager.sol:6](contracts/PortfolioManager.sol#L6)) as a breadcrumb.

**Ask:** Prominently call out the SwapRouter → SwapRouter02 interface difference on the SwapRouter02 docs page, with a migration note.

### 3. Sepolia pool liquidity is effectively zero

The WETH/USDC 0.3% pool on Sepolia has so little liquidity that any non-trivial swap reverts with a slippage error. This blocks end-to-end demo runs on the actual testnet. We had to deploy our own MockERC20 tokens + a local Uniswap V3 pool on Sepolia just to have a functional test environment. That's ~4 extra scripts and 2 extra contracts.

**Ask:** Either seed official Sepolia pools with meaningful liquidity, or provide a "Uniswap V3 testnet starter kit" that deploys a usable WETH/USDC pool with test liquidity. Even a faucet that adds liquidity on demand would be useful.

### 4. No easy way to get a quote from within an AI agent

Our agent needs `amountOutMinimum` before calling `executeTrade`. The Quoter contract's `quoteExactInputSingle` simulates the swap but modifies state (hence `staticcall` only). That means:
- We can't call it from inside a contract that also executes the swap.
- Calling it off-chain requires running a full JSON-RPC `eth_call`, not just a read.

We ended up falling back to CoinGecko prices with a 0.5% haircut ([intelligence/agent/tools.ts:150-159](intelligence/agent/tools.ts#L150-L159)). This diverges from on-chain prices and fails entirely on our mock Sepolia pool (which is 1:1, not CoinGecko price).

**Ask:** A REST API endpoint — `/v1/quote?tokenIn=USDC&tokenOut=WETH&amountIn=100&chainId=11155111` — that returns `expectedAmountOut` and a suggested `amountOutMinimum` with slippage baked in. This is the single most useful addition for AI/agent integrations where you need a quote synchronously without SDK setup.

### 5. No official TypeScript types for SwapRouter ABI fragments

When building the TypeScript agent side, we needed the ABI for `PortfolioManager` → `SwapRouter02` calls. The `@uniswap/v3-periphery` package has ABIs, but they reference the original SwapRouter, not SwapRouter02. The `@uniswap/swap-router-contracts` package exists but is poorly documented and has no published TypeScript types. We ended up writing an inline ABI string ([intelligence/agent/tools.ts:54-58](intelligence/agent/tools.ts#L54-L58)).

**Ask:** Publish SwapRouter02 TypeScript types as a first-class export from `@uniswap/swap-router-contracts` or include them in the SDK.

### 6. `v3-sdk` testnet support is incomplete

We tried using `@uniswap/v3-sdk` to compute the route off-chain (for the quote). The SDK works well on mainnet but requires fetching pool state (slot0, liquidity) which isn't reliably available on Sepolia because there's no real liquidity. The SDK's `Route` and `Trade` objects assume you can fetch current pool state — on testnet this returns zeros, making computed quotes useless.

**Ask:** A "simulation mode" for the SDK that accepts synthetic pool state so you can test routes without real on-chain liquidity.

---

## DX Friction / Missing Things

### Permit2 + custom intermediary contract is under-documented

We use `PortfolioManager` as an intermediary: the agent calls PM, PM calls SwapRouter. This means PM needs to `approve` SwapRouter before each swap. That's a fine pattern, but there's no guidance in Uniswap docs on "how to integrate SwapRouter from a contract that holds user funds." The Permit2 docs assume direct user → router flow.

### No webhook/event stream for swap execution

Our agent watches for the `TradeExecuted` event from our own contract. There's no Uniswap-native event stream or webhook to subscribe to "swaps involving my pool/contract." We had to poll with `eth_getLogs`. For an AI agent that needs to confirm trade execution before writing memory, this is friction.

### Subgraph for Sepolia is stale or missing

The hosted subgraph at `api.thegraph.com/subgraphs/name/uniswap/uniswap-v3` is mainnet-only. Attempts to find a Sepolia equivalent returned 404 or stale data. Historical trade data from Sepolia swaps — useful for testing the AI's memory loop — was unavailable via any official Uniswap data source.

---

## What We Wish Existed

1. **A testnet quote API** — single HTTP endpoint returning expected swap output + suggested slippage for any token pair on any supported chain. Would make AI agent integration trivially simple.

2. **Testnet pool seeding tool** — CLI or webapp that lets you deploy a fresh V3 pool with test tokens and add meaningful liquidity in one command. "uniswap-cli init-testnet-pool --tokenA USDC --tokenB WETH --chainId 11155111"

3. **Canonical Sepolia contract addresses page** — all V3 contracts (Factory, SwapRouter, SwapRouter02, Quoter, QuoterV2, PositionManager) on one page, machine-readable JSON preferred.

4. **Contract integration guide** — a guide specifically for "I have a contract that calls SwapRouter on behalf of users/NFTs." The current docs assume direct EOA → router flow. Multi-hop intermediary patterns (contract holds funds, contract calls router) are a major use case that needs its own guide.

5. **Swap simulation via `eth_call`** — if the Quoter's `quoteExactInputSingle` could be exposed as a simple REST call without needing a node connection, it would unlock a whole class of agent/bot integrations that don't want to manage a provider connection just for a quote.

---

## Overall

The core Uniswap V3 swap primitive (`exactInputSingle`) is solid, well-designed, and battle-tested. The pain is almost entirely in the surrounding ecosystem: testnet infrastructure, documentation discoverability, and tooling for non-standard integration patterns (contracts-as-agents, AI tool use, intermediary contracts).

For hackathon-speed development, the biggest unlocks would be: a testnet quote API and better Sepolia pool liquidity. Both would have saved us 4–6 hours.

Thanks for building the best DEX primitive in the space. The swap execution itself never let us down.
