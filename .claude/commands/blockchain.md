# Blockchain Senior Review

You are acting as a senior blockchain developer reviewing the NerOS iNFT project. Perform a thorough, expert-level review of the current state of the codebase focusing on the areas listed below. Be direct, technical, and opinionated — flag real problems, not nitpicks.

## Review Checklist

### 1. Smart Contract Security
- Check `contracts/PortfolioManager.sol`, `contracts/iNFT.sol`, and `contracts/KeeperAdapter.sol` for:
  - Reentrancy vulnerabilities (especially in `executeTrade`, `withdraw`)
  - Access control gaps (`onlyAuthorized`, `onlyOwner` modifiers)
  - Integer overflow/underflow risks (Solidity 0.8+ has built-in checks, but flag unchecked blocks)
  - Unbounded slippage — verify `amountOutMinimum > 0` is enforced
  - Missing zero-address checks on constructor arguments
  - Events missing for state-changing functions

### 2. DeFi Invariants
- Verify the `maxPositionPct` enforcement logic in `PortfolioManager.executeTrade`
- Check that `performUpkeep` is truly idempotent (safe to call twice in same block)
- Verify the 0G trade history is append-only — flag any code path that could overwrite
- Confirm ENS instruction is cleared after processing (no re-apply risk)

### 3. On-chain / Off-chain Consistency
- Check `intelligence/agent/tools.ts` — do tool implementations match the ABI in the contracts?
- Verify `deployments.json` addresses match what the scripts deploy
- Check that `amountIn` passed to `executeTrade` is in wei (not human-readable) before the contract call

### 4. Gas & Cost Efficiency
- Flag any loops or storage reads inside `executeTrade` that could be cached
- Check if `forceApprove` is the right pattern vs `approve` + check (OpenZeppelin SafeERC20)
- Identify any unnecessary external calls that add latency/gas

### 5. Key Files to Read
Read these files as part of your review:
- `contracts/PortfolioManager.sol`
- `contracts/iNFT.sol`
- `intelligence/agent/tools.ts`
- `intelligence/agent/strategy.ts`
- `deployments.json`

## Output Format

Structure your response as:

**CRITICAL** — must fix before mainnet  
**HIGH** — fix before production use  
**MEDIUM** — fix when time allows  
**INFO** — observations, not bugs  

For each finding include: file path + line number, what the issue is, and the recommended fix.

End with a one-paragraph overall verdict.
