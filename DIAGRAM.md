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

---

## 5. ENS Flow

### 5.1 What each storage layer holds

```
┌─────────────────────────────────────────────────────────────┐
│  ENS (text record)                                          │
│  key: "inft.instruction"                                    │
│  value: "be more conservative"  ← short string, cleared    │
│                                   after agent reads it      │
├─────────────────────────────────────────────────────────────┤
│  0G Storage (JSON blobs)                                    │
│                                                             │
│  Personality CID → { name, ensName, riskTolerance, ... }   │
│  Memory CID     → { trades: [...], totalPnL: 187.40 }      │
│                   append-only, never overwritten            │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Human instruction flow (send-instruction → agent)

```mermaid
sequenceDiagram
    participant U  as User
    participant SI as send-instruction.ts
    participant EN as ENS Resolver (Sepolia)
    participant AG as Agent (0G Compute AI)
    participant SV as serve.ts / tools.ts
    participant ZG as 0G Storage

    U->>SI: npm run send-instruction --nft-id 1 "be more conservative"
    SI->>EN: resolver.setText(namehash, "inft.instruction", "be more conservative")
    EN-->>SI: tx confirmed
    SI-->>U: ✓ ENS text record updated

    Note over EN: text record lives on-chain<br/>until agent clears it

    KeeperHub->>SV: POST /trigger
    SV->>AG: runAgent(nftId)

    AG->>EN: read_ens_instructions → resolver.text(namehash, "inft.instruction")
    EN-->>AG: "be more conservative"

    Note over AG: AI adjusts decision<br/>based on instruction

    AG->>ZG: write_memory (trade record saved)
    AG->>EN: clearInstruction() → resolver.setText(..., "")

    Note over EN: text record cleared —<br/>will not be re-applied next cycle
```

### 5.3 ENS vs 0G Storage — who writes, who reads

```mermaid
flowchart LR
    U(["User"])
    AG(["Agent (AI)"])
    EN[("ENS\ntext record")]
    ZG[("0G Storage\nJSON blobs")]

    U -->|send-instruction\nsetText 'inft.instruction'| EN
    AG -->|read_ens_instructions\nreads text record| EN
    AG -->|clearInstruction\nsetText ''| EN

    AG -->|write_memory\nappend trade record| ZG
    AG -->|read_memory\nload trade history| ZG
    ZG -->|personality CID\nat mint time| AG
```

### 5.4 ENS name in personality — what it is and is not

```
npm run mint
    │
    ├─ User types: "nerosbot"
    │       └─► ensName = "nerosbot.eth"  ← JavaScript string only
    │
    ├─ personality JSON uploaded to 0G:
    │       { name: "NerOSBot", ensName: "nerosbot.eth", ... }
    │                                ↑
    │                   stored as a plain field in JSON
    │                   NOT registered in ENS registry
    │
    └─ iNFT.mint(personalityCID, riskLevel) on Sepolia
            └─► only CID stored on-chain, ensName never touches ENS registry

Why it still works:
    ENS_RESOLVER env var → points directly at a Sepolia resolver contract
    resolver.setText(namehash("nerosbot.eth"), ...)
        └─► works without registering the name
        └─► because you call the resolver contract directly,
            bypassing the ENS registry ownership check
```
