import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const SESSION_FILE = join(process.cwd(), ".neros-session");

interface Session {
  nftId?: number;
}

function read(): Session {
  if (!existsSync(SESSION_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf-8")) as Session;
  } catch {
    return {};
  }
}

export function getActiveNftId(): number | undefined {
  return read().nftId;
}

export function setActiveNftId(nftId: number): void {
  writeFileSync(SESSION_FILE, JSON.stringify({ nftId }, null, 2));
}

/**
 * Resolves NFT ID from --nft-id flag or persisted session.
 * If flag is provided, saves it as the new active NFT.
 */
export function resolveNftId(flag?: number): number {
  const id = flag ?? getActiveNftId();
  if (id === undefined) {
    throw new Error(
      "No active NFT. Pass --nft-id <n> (e.g. npm run agent -- --nft-id 1)"
    );
  }
  if (flag !== undefined) setActiveNftId(flag);
  return id;
}
