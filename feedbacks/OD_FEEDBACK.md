1. There is error when i install
```
npm install @0gfoundation/0g-ts-sdk ethers
```
Error
```
npm error Could not resolve dependency:
npm error @0gfoundation/0g-ts-sdk@"*" from the root project
npm error
npm error Conflicting peer dependency: ethers@6.13.1
npm error node_modules/ethers
npm error   peer ethers@"6.13.1" from @0gfoundation/0g-ts-sdk@1.2.6
npm error   node_modules/@0gfoundation/0g-ts-sdk
npm error     @0gfoundation/0g-ts-sdk@"*" from the root project
```

2. `@0glabs/0g-serving-broker@0.7.5` — Broken ESM build causes `SyntaxError` at startup

**Error:**
```
SyntaxError: The requested module './index-33b65b9f.js' does not provide an export named 'C'
```

**Root cause:**
The package ships an ESM entry at `lib.esm/index.mjs` that re-exports named symbols from
bundled chunk files (e.g. `index-33b65b9f.js`). Those chunk files have a `.js` extension and
the package has no `"type": "module"` in its own `package.json`, so Node.js treats them as
CommonJS. When an ESM module (`index.mjs`) tries to import *named* exports from a CJS file,
Node.js can only expose the whole `module.exports` as the `default` export — named imports
such as `C` (`CONTRACT_ADDRESSES`) are invisible, causing the static linking error.

**Fix applied in `intelligence/agent/strategy.ts`:**
Replace the direct ESM import with `createRequire` to force Node.js to resolve the package
via the `require` condition (`lib.commonjs/index.js`), which is a proper CJS build:

```ts
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = _require("@0glabs/0g-serving-broker")
  as typeof import("@0glabs/0g-serving-broker");
```

**Affected version:** `0.7.5`
**Workaround:** force CJS via `createRequire` (no package upgrade needed)

3. `@0gfoundation/0g-ts-sdk@1.2.6` — Indexer RPC methods `indexer_getFileLocations` and `indexer_getShardedNodes` not available on 0G testnet

**Error:**
```
JsonRpcError: the method indexer_getFileLocations does not exist/is not available
JsonRpcError: the method indexer_getShardedNodes does not exist/is not available
```

**Root cause:**
SDK v1.2.6 added `indexer_getFileLocations` (file-specific node lookup) and updated `selectNodes` to use `indexer_getShardedNodes`. Neither method is implemented by the current 0G testnet indexer at `https://indexer-storage-testnet-turbo.0g.ai`. The testnet only exposes `indexer_getNodeLocations`, which returns a plain IP→location map.

**Fix applied in `0g/client.ts`:**
Bypass the broken Indexer download path entirely. Call `indexer.getNodeLocations()` directly to get the IP list, construct `StorageNode` URLs using the standard port `5678`, then drive `Downloader.downloadToBlob()` manually:

```ts
const locations = await indexer.getNodeLocations() as unknown as Record<string, unknown>;
const ips = Object.keys(locations);
const nodes = ips.map((ip) => new StorageNode(`http://${ip}:5678`));
const downloader = new Downloader(nodes);
const [blob, err] = await downloader.downloadToBlob(rootHash, false);
```

**Affected version:** `1.2.6`
**Workaround:** use `indexer_getNodeLocations` + direct `Downloader` construction (no package downgrade needed)

4. `ZERO_G_RPC` env var — wrong URL causes all indexer RPC calls to fail silently

**Error:**
```
JsonRpcError: the method indexer_getNodeLocations does not exist/is not available
```

**Root cause:**
`ZERO_G_RPC` was set to the EVM RPC endpoint (`https://evmrpc-testnet.0g.ai`) instead of the storage indexer. The EVM RPC only handles Ethereum JSON-RPC methods (`eth_*`, `net_*`) and returns "method does not exist" for any `indexer_*` call. This made every indexer fix look broken when the real issue was just a misconfigured env var.

**Fix applied in `.env`:**
```diff
- ZERO_G_RPC=https://evmrpc-testnet.0g.ai
+ ZERO_G_RPC=https://indexer-storage-testnet-turbo.0g.ai
```

**Note:** Keep `ZERO_G_RPC` pointing to the storage indexer. The EVM RPC (`https://evmrpc-testnet.0g.ai`) is already hardcoded as `ZG_EVM_RPC` in `0g/client.ts` and does not need an env var.
