import "dotenv/config";
import { ethers } from "ethers";

const ENS_KEY = "inft.instruction";

// Canonical Sepolia ENS registry (same address on all networks)
const SEPOLIA_ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

const RESOLVER_ABI = [
  "function text(bytes32 node, string key) view returns (string)",
  "function setText(bytes32 node, string key, string value)",
  "function setAddr(bytes32 node, address a)",
  "function addr(bytes32 node) view returns (address)",
];

const REGISTRY_ABI = [
  "function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl)",
  "function resolver(bytes32 node) view returns (address)",
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

function getRootName(): string {
  return process.env.ENS_NAME ?? "nerosbot.eth";
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

// T-183: Create subdomain {tokenId}.{root} in the ENS Registry
export async function createSubdomain(tokenId: number, ownerAddress: string, privateKey: string): Promise<void> {
  if (!process.env.RPC_URL) throw new Error("RPC_URL not set");
  if (!process.env.ENS_RESOLVER) throw new Error("ENS_RESOLVER not set");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const registryAddress = process.env.ENS_REGISTRY ?? SEPOLIA_ENS_REGISTRY;
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, wallet);

  const rootName = getRootName();
  const parentNode = ethers.namehash(rootName);
  const label = ethers.keccak256(ethers.toUtf8Bytes(tokenId.toString()));

  const tx = await registry.setSubnodeRecord(
    parentNode,
    label,
    ownerAddress,
    process.env.ENS_RESOLVER,
    0,
  );
  await tx.wait();
}

// T-184: Set addr record on subdomain {tokenId}.{root} → portfolioManagerAddress
export async function setSubdomainAddr(tokenId: number, portfolioManagerAddress: string, privateKey: string): Promise<void> {
  if (!process.env.RPC_URL) throw new Error("RPC_URL not set");
  if (!process.env.ENS_RESOLVER) throw new Error("ENS_RESOLVER not set");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const resolver = new ethers.Contract(process.env.ENS_RESOLVER, RESOLVER_ABI, wallet);

  const rootName = getRootName();
  const node = ethers.namehash(`${tokenId}.${rootName}`);
  const tx = await resolver.setAddr(node, portfolioManagerAddress);
  await tx.wait();
}

// T-185: Set avatar text record on subdomain {tokenId}.{root} → ERC-721 NFT URI
export async function setSubdomainAvatar(tokenId: number, iNFTAddress: string, privateKey: string): Promise<void> {
  if (!process.env.RPC_URL) throw new Error("RPC_URL not set");
  if (!process.env.ENS_RESOLVER) throw new Error("ENS_RESOLVER not set");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const resolver = new ethers.Contract(process.env.ENS_RESOLVER, RESOLVER_ABI, wallet);

  const rootName = getRootName();
  const node = ethers.namehash(`${tokenId}.${rootName}`);
  const avatarUri = `eip155:11155111/erc721:${iNFTAddress}/${tokenId}`;
  const tx = await resolver.setText(node, "avatar", avatarUri);
  await tx.wait();
}
