# Prize Submission — "How are you using this Protocol / API?"

---

## 0G

NerOS uses 0G at every layer of the AI agent stack — 0G Storage persists the NFT's trade memory and personality as immutable JSON blobs (CIDs stored on-chain), and 0G Compute drives all inference via the broker's tool-use loop. The iNFT literally cannot think or remember without 0G.

Code: 0G Storage upload/download: https://github.com/vinhyenvodoi98/NerOS/blob/main/0g/client.ts#L17-L54 | Trade memory read/write via 0G CIDs: https://github.com/vinhyenvodoi98/NerOS/blob/main/intelligence/agent/memory.ts#L32-L72 | Personality loaded from 0G Storage: https://github.com/vinhyenvodoi98/NerOS/blob/main/intelligence/agent/personality.ts#L31-L56 | 0G Compute broker + inference loop: https://github.com/vinhyenvodoi98/NerOS/blob/main/intelligence/agent/strategy.ts#L226-L271 | 0G ledger + sub-account setup: https://github.com/vinhyenvodoi98/NerOS/blob/main/scripts/setup-0g-account.ts#L20-L60

Feedback: https://github.com/vinhyenvodoi98/NerOS/blob/main/feedbacks/OG_FEEDBACK.md — covers 4 real bugs hit during integration: ethers peer conflict, broken ESM build in @0glabs/0g-serving-broker, missing indexer RPC methods on testnet, and wrong ZERO_G_RPC env var silently breaking all storage calls, each with the exact workaround applied.

---

## ENS

ENS gives each iNFT a human-readable identity ({tokenId}.nerosbot.eth) and acts as the human-to-AI communication channel: users write instructions to a text record, the agent reads and clears them each cycle. This turns ENS into a live message queue between a person and an autonomous on-chain agent.

Code: Read/set/clear ENS text record instructions: https://github.com/vinhyenvodoi98/NerOS/blob/main/intelligence/agent/ens.ts#L38-L76 | Create subdomain per NFT + set addr + avatar: https://github.com/vinhyenvodoi98/NerOS/blob/main/intelligence/agent/ens.ts#L80-L146 | Agent reads ENS instruction as a tool call: https://github.com/vinhyenvodoi98/NerOS/blob/main/intelligence/agent/tools.ts#L105-L110 | Agent clears ENS record after processing: https://github.com/vinhyenvodoi98/NerOS/blob/main/intelligence/agent/strategy.ts#L314-L317 | CLI command to write instruction to ENS: https://github.com/vinhyenvodoi98/NerOS/blob/main/cli/commands/send-instruction.ts#L37

---

## KeeperHub

KeeperHub is the heartbeat of NerOS — it wakes the AI agent every 5 minutes via two integration levels: (1) on-chain via KeeperAdapter.checkUpkeep()/performUpkeep() which the keeper contract implements natively, and (2) off-chain via a webhook server that runs the full agent reasoning cycle and returns structured trade decisions as JSON for KeeperHub to act on.

Code: checkUpkeep / performUpkeep / forceUpkeep contract: https://github.com/vinhyenvodoi98/NerOS/blob/main/contracts/KeeperAdapter.sol#L26-L52 | Webhook server /trigger endpoint: https://github.com/vinhyenvodoi98/NerOS/blob/main/cli/commands/serve.ts#L140-L190 | Swap action builder (agent decision to KeeperHub payload): https://github.com/vinhyenvodoi98/NerOS/blob/main/cli/commands/serve.ts#L43-L92 | On-chain event listener to agent trigger: https://github.com/vinhyenvodoi98/NerOS/blob/main/intelligence/keeper/runner.ts#L50-L63 | CLI to fund/trigger/pause/resume keeper: https://github.com/vinhyenvodoi98/NerOS/blob/main/cli/commands/keeper.ts#L62-L224

Feedback: https://github.com/vinhyenvodoi98/NerOS/blob/main/feedbacks/KeeperHub_FEEDBACK.md — covers the webhook public URL requirement blocking local dev, undocumented webhook response schema blocking Level 3 (agent decides, KeeperHub executes swap), missing jitter on the cron interval, and three concrete feature asks: local simulator, REST API/CLI, and low-balance wallet alerts.
