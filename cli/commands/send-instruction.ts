import "dotenv/config";
import { program } from "commander";
import { loadPersonality } from "../../intelligence/agent/personality.js";
import { setInstruction } from "../../intelligence/agent/ens.js";
import { resolveNftId } from "../session.js";

program
  .option("--nft-id <n>", "NFT token ID", parseInt)
  .argument("<instruction>", "instruction text to store in ENS")
  .parse(process.argv);

const opts = program.opts<{ nftId?: number }>();
const instruction = program.args[0];
const nftId = resolveNftId(opts.nftId);

if (!instruction) {
  console.error('Usage: npm run send-instruction -- --nft-id 1 "be more conservative"');
  process.exit(1);
}

if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");

const personality = await loadPersonality(nftId);
const ensName = process.env.ENS_NAME ?? personality.ensName;

console.log(`  Writing ENS instruction to ${ensName}...`);
await setInstruction(ensName, instruction, process.env.PRIVATE_KEY);

console.log(`✓ ENS text record updated for ${ensName}`);
console.log(`  Key: inft.instruction`);
console.log(`  Value: "${instruction}"`);
