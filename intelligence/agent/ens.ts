import "dotenv/config";
import { ethers } from "ethers";

const ENS_KEY = "inft.instruction";

const RESOLVER_ABI = [
  "function text(bytes32 node, string key) view returns (string)",
  "function setText(bytes32 node, string key, string value)",
];

// When ENS_RESOLVER is set, the name lives on Sepolia ENS testnet — call it directly.
// When not set, fall back to mainnet provider.getResolver() for real .eth names.
function getProvider(): ethers.JsonRpcProvider {
  if (process.env.ENS_RESOLVER) {
    if (!process.env.RPC_URL) throw new Error("RPC_URL not set");
    return new ethers.JsonRpcProvider(process.env.RPC_URL);
  }
  const rpc = process.env.MAINNET_RPC_URL ?? process.env.RPC_URL;
  if (!rpc) throw new Error("MAINNET_RPC_URL not set");
  return new ethers.JsonRpcProvider(rpc);
}

export async function readInstruction(ensName: string): Promise<string | null> {
  const provider = getProvider();
  const node = ethers.namehash(ensName);

  if (process.env.ENS_RESOLVER) {
    const resolver = new ethers.Contract(process.env.ENS_RESOLVER, RESOLVER_ABI, provider);
    const text: string = await resolver.text(node, ENS_KEY);
    return text || null;
  }

  // mainnet fallback via ethers ENS resolution
  const resolver = await provider.getResolver(ensName);
  if (!resolver) return null;
  return (await resolver.getText(ENS_KEY)) || null;
}

export async function setInstruction(ensName: string, instruction: string, privateKey: string): Promise<void> {
  const provider = getProvider();
  const wallet = new ethers.Wallet(privateKey, provider);
  const node = ethers.namehash(ensName);

  if (process.env.ENS_RESOLVER) {
    const resolver = new ethers.Contract(process.env.ENS_RESOLVER, RESOLVER_ABI, wallet);
    const tx = await resolver.setText(node, ENS_KEY, instruction);
    await tx.wait();
    return;
  }

  const resolver = await provider.getResolver(ensName);
  if (!resolver) throw new Error(`No ENS resolver found for ${ensName}`);
  const contract = new ethers.Contract(resolver.address, RESOLVER_ABI, wallet);
  const tx = await contract.setText(node, ENS_KEY, instruction);
  await tx.wait();
}

// Clears the instruction after the agent processes it (T-073)
export async function clearInstruction(ensName: string, privateKey: string): Promise<void> {
  await setInstruction(ensName, "", privateKey);
}
