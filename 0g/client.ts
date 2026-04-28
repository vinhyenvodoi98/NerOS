import { Indexer, MemData, Downloader } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

const ZG_EVM_RPC = "https://evmrpc-testnet.0g.ai";

function indexerUrl(): string {
  return (process.env.ZERO_G_RPC || "").trim() || "https://indexer-storage-testnet-turbo.0g.ai";
}

function getSigner(): ethers.Wallet {
  const key = (process.env.ZERO_G_PRIVATE_KEY || "").trim() || (process.env.PRIVATE_KEY || "").trim();
  if (!key) throw new Error("No signer key: set ZERO_G_PRIVATE_KEY or PRIVATE_KEY in .env");
  const provider = new ethers.JsonRpcProvider(ZG_EVM_RPC);
  return new ethers.Wallet(key, provider);
}

export async function uploadJSON(data: object): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const file = new MemData(bytes);
  const indexer = new Indexer(indexerUrl());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, err] = await indexer.upload(file, ZG_EVM_RPC, getSigner() as any);
  if (err) throw err;

  const { rootHash } = result as { rootHash: string };
  return rootHash;
}

export async function downloadJSON<T>(rootHash: string): Promise<T> {
  const indexer = new Indexer(indexerUrl());

  // indexer_getFileLocations and indexer_getShardedNodes are not available on
  // the current 0G testnet. Use indexer_getNodeLocations (returns IP map) to
  // discover nodes, then construct StorageNode URLs with the standard port.
  const locations = await indexer.getNodeLocations() as unknown as Record<string, unknown>;
  const ips = Object.keys(locations);
  if (ips.length === 0) throw new Error("No storage nodes returned by indexer_getNodeLocations");

  const { StorageNode } = await import("@0gfoundation/0g-ts-sdk");
  const nodes = ips.map((ip) => new StorageNode(`http://${ip}:5678`));
  const downloader = new Downloader(nodes);
  const [blob, err] = await downloader.downloadToBlob(rootHash, false);
  if (err) throw err;

  return JSON.parse(await blob.text()) as T;
}
