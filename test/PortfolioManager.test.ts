import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { getAddress, parseUnits, erc20Abi } from "viem";
import { getContract } from "viem";

// ─── Mainnet addresses (used in fork tests) ───────────────────────────────────
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const SWAP_ROUTER_V3 = "0xE592427A0AEce92De3Edee1F18E0157C05861564" as const;
// Binance hot wallet — large USDC holder on mainnet
const USDC_WHALE = "0x28C6c06298d514Db089934071355E5743bf21d60" as const;

// ─── Unit tests (simulated network, no real Uniswap) ──────────────────────────
describe("PortfolioManager (unit)", async function () {
  const { viem } = await network.create();
  const [deployer, agent, stranger] = await viem.getWalletClients();

  // Deploy a minimal mock SwapRouter that just returns 1 wei (enough for unit tests)
  // We test pre-swap reverts only — the router is never called successfully.
  const mockRouterAddr = "0x0000000000000000000000000000000000000001" as `0x${string}`;

  async function setup() {
    const inft = await viem.deployContract("iNFT");
    // mint token #1 with riskLevel 10 (maxPositionPct = 100%)
    await inft.write.mint(["bafk-personality", 10]);

    const pm = await viem.deployContract("PortfolioManager", [
      mockRouterAddr,
      inft.address,
    ]);
    return { inft, pm };
  }

  it("reverts executeTrade when amountOutMin == 0", async function () {
    const { pm } = await setup();
    await assert.rejects(
      pm.write.executeTrade([1n, USDC, WETH, 1n, 0n, 3000]),
      /amountOutMin/,
    );
  });

  it("reverts executeTrade for unauthorized caller", async function () {
    const { pm } = await setup();
    await assert.rejects(
      pm.write.executeTrade([1n, USDC, WETH, 1n, 1n, 3000], {
        account: stranger.account,
      }),
      /not authorized/,
    );
  });

  it("reverts executeTrade when insufficient balance", async function () {
    const { pm } = await setup();
    // balance is 0 — any amountIn > 0 should revert
    await assert.rejects(
      pm.write.executeTrade([1n, USDC, WETH, 1n, 1n, 3000]),
      /insufficient balance/,
    );
  });

  it("deposit increases balance", async function () {
    const { inft, pm } = await setup();
    // Deploy a mock ERC20 to test deposit
    const mockToken = await viem.deployContract("MockERC20");
    const tokenAddr = mockToken.address;

    await mockToken.write.mint([deployer.account.address, parseUnits("1000", 18)]);
    await mockToken.write.approve([pm.address, parseUnits("500", 18)]);
    await pm.write.deposit([1n, tokenAddr, parseUnits("500", 18)]);

    const bal = await pm.read.getBalance([1n, tokenAddr]);
    assert.equal(bal, parseUnits("500", 18));
  });

  it("keeperAdapter is authorized to call executeTrade", async function () {
    const { pm } = await setup();
    // Set agent as keeperAdapter
    await pm.write.setKeeperAdapter([agent.account.address]);
    // Should revert on "insufficient balance" (not "not authorized") → confirming authorization passes
    await assert.rejects(
      pm.write.executeTrade([1n, USDC, WETH, 1n, 1n, 3000], {
        account: agent.account,
      }),
      /insufficient balance/,
    );
  });

  it("getBalance returns 0 for unfunded nftId", async function () {
    const { pm } = await setup();
    const bal = await pm.read.getBalance([99n, USDC]);
    assert.equal(bal, 0n);
  });

  it("setKeeperAdapter reverts for non-owner", async function () {
    const { pm } = await setup();
    await assert.rejects(
      pm.write.setKeeperAdapter([stranger.account.address], {
        account: stranger.account,
      }),
      /not owner/,
    );
  });
});

// ─── Mainnet fork tests (requires MAINNET_RPC_URL) ───────────────────────────
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL;

describe(
  "PortfolioManager (mainnet fork — real Uniswap V3)",
  { skip: !MAINNET_RPC_URL ? "MAINNET_RPC_URL not set — skipping fork tests" : false },
  async function () {
    const { viem } = await network.create("mainnet-fork");
    const [deployer] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const testClient = await viem.getTestClient();

    // ── Deploy contracts ──────────────────────────────────────────────────────
    const inft = await viem.deployContract("iNFT");
    await inft.write.mint(["bafk-fork-personality", 10]); // riskLevel 10 = 100% maxPositionPct

    const pm = await viem.deployContract("PortfolioManager", [
      SWAP_ROUTER_V3,
      inft.address,
    ]);

    // ── Fund with USDC via whale impersonation ─────────────────────────────────
    const DEPOSIT_USDC = parseUnits("100", 6); // 100 USDC

    await testClient.impersonateAccount({ address: USDC_WHALE });
    await testClient.setBalance({
      address: USDC_WHALE,
      value: parseUnits("10", 18),
    });
    const whaleClient = await viem.getWalletClient(USDC_WHALE);

    const usdcWhale = getContract({
      address: USDC,
      abi: erc20Abi,
      client: { wallet: whaleClient, public: publicClient },
    });

    // Transfer USDC to deployer
    await usdcWhale.write.transfer([deployer.account.address, DEPOSIT_USDC]);

    await testClient.stopImpersonatingAccount({ address: USDC_WHALE });

    // ── Deposit USDC into PortfolioManager for nftId 1 ────────────────────────
    const usdcDeployer = getContract({
      address: USDC,
      abi: erc20Abi,
      client: { wallet: deployer, public: publicClient },
    });
    await usdcDeployer.write.approve([pm.address, DEPOSIT_USDC]);
    await pm.write.deposit([1n, USDC, DEPOSIT_USDC]);

    it("deposit records USDC balance for nftId 1", async function () {
      const bal = await pm.read.getBalance([1n, USDC]);
      assert.equal(bal, DEPOSIT_USDC);
    });

    it("executeTrade reverts when amountOutMin == 0", async function () {
      await assert.rejects(
        pm.write.executeTrade([1n, USDC, WETH, parseUnits("10", 6), 0n, 3000]),
        /amountOutMin/,
      );
    });

    it("executeTrade swaps USDC → WETH via Uniswap V3", async function () {
      const tradeAmount = parseUnits("50", 6); // 50 USDC
      const amountOutMin = 1n; // just verify no revert

      const wethBefore = await pm.read.getBalance([1n, WETH]);
      const usdcBefore = await pm.read.getBalance([1n, USDC]);

      await pm.write.executeTrade([
        1n,
        USDC,
        WETH,
        tradeAmount,
        amountOutMin,
        3000,
      ]);

      const wethAfter = await pm.read.getBalance([1n, WETH]);
      const usdcAfter = await pm.read.getBalance([1n, USDC]);

      // USDC balance decreases by exactly tradeAmount
      assert.equal(usdcAfter, usdcBefore - tradeAmount);
      // WETH balance increases (swap succeeded)
      assert.ok(wethAfter > wethBefore, "WETH balance should increase after swap");
    });

    it("TradeExecuted event is emitted with correct nftId", async function () {
      const tradeAmount = parseUnits("10", 6);
      await viem.assertions.emitWithArgs(
        pm.write.executeTrade([1n, USDC, WETH, tradeAmount, 1n, 3000]),
        pm,
        "TradeExecuted",
        [1n, getAddress(USDC), getAddress(WETH)],
        { partialArgs: true },
      );
    });

    it("exceeds maxPositionPct reverts for riskLevel 1 NFT", async function () {
      const inftConservative = await viem.deployContract("iNFT");
      // riskLevel 1 → maxPositionPct = 10%
      await inftConservative.write.mint(["bafk-conservative", 1]);
      const pmConservative = await viem.deployContract("PortfolioManager", [
        SWAP_ROUTER_V3,
        inftConservative.address,
      ]);

      // Deposit 100 USDC
      await usdcDeployer.write.approve([pmConservative.address, DEPOSIT_USDC]);
      await pmConservative.write.deposit([1n, USDC, DEPOSIT_USDC]);

      // Try to trade 50 USDC (50% of balance) — should exceed 10% maxPositionPct
      await assert.rejects(
        pmConservative.write.executeTrade([
          1n,
          USDC,
          WETH,
          parseUnits("50", 6),
          1n,
          3000,
        ]),
        /maxPositionPct/,
      );
    });
  },
);
