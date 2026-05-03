import "dotenv/config";
import chalk from "chalk";
import { program } from "commander";
import { loadPersonality } from "../../intelligence/agent/personality.js";
import { setInstruction, subdomainName } from "../../intelligence/agent/ens.js";
import { resolveNftId } from "../session.js";
import { C, SEP } from "../theme.js";

program
  .option("--nft-id <n>", "NFT token ID", parseInt)
  .argument("<instruction>", "instruction text to store in ENS")
  .parse(process.argv);

const opts = program.opts<{ nftId?: number }>();
const instruction = program.args[0];
const nftId = resolveNftId(opts.nftId);

if (!instruction) {
  process.stderr.write(chalk.hex(C.error)('  Usage: npm run send-instruction -- --nft-id 1 "be more conservative"\n'));
  process.exit(1);
}

if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");

const personality = await loadPersonality(nftId);
const ensName = subdomainName(nftId);

// Header
console.log();
console.log(`  ${chalk.hex(C.brand).bold('◈ NerOS')}  ${chalk.dim('Send Instruction')}`);
console.log(`  ${chalk.dim(SEP)}`);
console.log(`  ${chalk.bold(personality.name)}  ${chalk.dim(ensName)}`);
console.log();

// Action
process.stdout.write(`  ${chalk.dim('·')}  Writing to ENS ${chalk.hex(C.accent)(ensName)}…  `);
await setInstruction(ensName, instruction, process.env.PRIVATE_KEY);
process.stdout.write(chalk.hex(C.success)('✓') + '\n');

// Result
console.log();
console.log(`  ${chalk.hex(C.success)('✓')}  ENS text record updated`);
console.log(`     ${chalk.dim('Key    ')}  inft.instruction`);
console.log(`     ${chalk.dim('Value  ')}  ${chalk.italic(`"${instruction}"`)}`);
console.log();
