# NerOS — Flow Diagrams

## 1. Current Flow (Local Signing)

```mermaid
sequenceDiagram
    participant KH as KeeperHub
    participant KA as KeeperAdapter.sol
    participant SV as serve.ts (local server)
    participant AG as Agent (0G Compute AI)
    participant PM as PortfolioManager.sol
    participant UNI as Uniswap V3

    KH->>KA: checkUpkeep() [view]
    KA-->>KH: upkeepNeeded = true
    KH->>KA: performUpkeep() [on-chain]
    KA-->>KH: emit UpkeepTriggered

    KH->>SV: POST /trigger { secret }
    SV->>AG: runAgent(nftId)

    AG->>AG: read_memory (0G Storage)
    AG->>AG: get_market_data (CoinGecko)
    AG->>AG: get_portfolio_balance → PM.getBalance()
    AG->>AG: read_ens_instructions (ENS)

    Note over AG: AI decides: BUY / SELL / HOLD

    AG->>SV: tool call "execute_trade" (name + args only)
    Note over SV: tools.ts handleExecuteTrade()<br/>signs tx with PRIVATE_KEY on local server
    SV->>PM: executeTrade() [msg.sender = local wallet]
    PM->>UNI: exactInputSingle()
    UNI-->>PM: amountOut (tokens returned to PM)
    SV-->>AG: { txHash, amountOut }

    AG->>AG: write_memory (0G Storage)
    SV-->>KH: { decision, txHash, swapAction }
```

---

## 2. Improved Flow (KeeperHub Signing)

```mermaid
sequenceDiagram
    participant KH as KeeperHub
    participant KA as KeeperAdapter.sol
    participant SV as serve.ts (local server)
    participant AG as Agent (0G Compute AI)
    participant PM as PortfolioManager.sol
    participant UNI as Uniswap V3

    KH->>KA: checkUpkeep() [view]
    KA-->>KH: upkeepNeeded = true
    KH->>KA: performUpkeep() [on-chain]
    KA-->>KH: emit UpkeepTriggered

    KH->>SV: POST /trigger { secret }
    SV->>AG: runAgent(nftId)

    AG->>AG: read_memory (0G Storage)
    AG->>AG: get_market_data (CoinGecko)
    AG->>AG: get_portfolio_balance → PM.getBalance()
    AG->>AG: read_ens_instructions (ENS)

    Note over AG: AI decides: BUY / SELL / HOLD

    AG->>SV: tool call "execute_trade" (name + args only)
    Note over SV: tools.ts does NOT sign tx<br/>computes params only, returns intent
    SV-->>AG: { tokenIn, tokenOut, amountIn, amountOutMin }

    AG->>AG: write_memory (0G Storage)
    SV-->>KH: { decision, swapAction: { contractAddress, abi, args } }

    Note over KH: KeeperHub reads swapAction<br/>signs tx with Turnkey wallet

    KH->>PM: executeTrade() [signed by Turnkey wallet]
    PM->>UNI: exactInputSingle()
    UNI-->>PM: amountOut (tokens returned to PM)
```

---

## 3. Side-by-side Comparison

```
CURRENT FLOW
─────────────────────────────────────────────────────────
KeeperHub ──► /trigger ──► Agent (AI) ──► execute_trade
                                               │
                                    PRIVATE_KEY on local server
                                               │
                                               ▼
                                    PortfolioManager.sol
                                               │
                                               ▼
                                          Uniswap V3


IMPROVED FLOW
─────────────────────────────────────────────────────────
KeeperHub ──► /trigger ──► Agent (AI) ──► returns params only
                                               │
                                    no PRIVATE_KEY needed
                                               │
                                               ▼
                               serve.ts returns swapAction in response
                                               │
                                               ▼
                               KeeperHub Turnkey wallet signs tx
                                               │
                                               ▼
                                    PortfolioManager.sol
                                               │
                                               ▼
                                          Uniswap V3
```

---

## 4. Changes Required for the Improved Flow

```
intelligence/agent/tools.ts
└── handleExecuteTrade()
    Current:  signs tx with PRIVATE_KEY, calls PM.executeTrade() on-chain
    Replace:  compute params only, return { tokenIn, tokenOut, amountIn, amountOutMin }

cli/commands/serve.ts
└── buildSwapAction()              ← already implemented, no changes needed
    reads trace from agent → builds swapAction JSON → returns in HTTP response

contracts/PortfolioManager.sol
└── onlyAuthorized modifier
    Add: KeeperHub Turnkey wallet address to the authorized list

KeeperHub dashboard
└── configure HTTP Action to read swapAction from response
    → web3/write-contract action calls PM.executeTrade()
```
