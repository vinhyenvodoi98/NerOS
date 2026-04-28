import "dotenv/config";
import { ethers } from "ethers";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } = _require("@0glabs/0g-serving-broker") as typeof import("@0glabs/0g-serving-broker");

const ZG_EVM_RPC = process.env.ZERO_G_EVM_RPC ?? "https://evmrpc-testnet.0g.ai";
const PROVIDER_ADDRESS = process.env.ZERO_G_PROVIDER_ADDRESS!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;

if (!PROVIDER_ADDRESS) throw new Error("ZERO_G_PROVIDER_ADDRESS not set");
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");

async function main() {
  const provider = new ethers.JsonRpcProvider(ZG_EVM_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Wallet:", wallet.address);

  const bal = await provider.getBalance(wallet.address);
  console.log("0G balance:", ethers.formatEther(bal), "0G");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broker = await createZGComputeNetworkBroker(wallet as any);

  // Check if ledger already exists
  let ledgerExists = false;
  try {
    const ledger = await broker.ledger.getLedger();
    if (ledger) {
      ledgerExists = true;
      console.log("Ledger already exists");
    }
  } catch {
    console.log("No ledger found — will create one");
  }

  if (!ledgerExists) {
    console.log("Creating ledger with 3 0G...");
    await broker.ledger.addLedger(3);
    console.log("✓ Ledger created");
  }

  // Check if inference sub-account already exists
  let accountExists = false;
  try {
    const account = await broker.inference.getAccount(PROVIDER_ADDRESS);
    if (account) {
      accountExists = true;
      console.log("Inference sub-account already exists");
    }
  } catch {
    console.log("No inference sub-account found — will create one");
  }

  if (!accountExists) {
    console.log("Transferring 2 0G to create inference sub-account...");
    // transferFund takes bigint in neuron (1 0G = 10^18 neuron)
    await broker.ledger.transferFund(PROVIDER_ADDRESS, "inference", BigInt(2) * BigInt(10 ** 18));
    console.log("✓ Inference sub-account created and funded with 2 0G");
  }

  console.log("\n✓ 0G Compute account setup complete. Run: npm run agent -- --nft-id 1");
}

main().catch((e) => { console.error(e); process.exit(1); });
