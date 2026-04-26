import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { getAddress } from "viem";

describe("iNFT", async function () {
  const { viem } = await network.create();
  const [deployer, user1, user2] = await viem.getWalletClients();

  it("mints NFT with correct tokenId and emits Minted", async function () {
    const inft = await viem.deployContract("iNFT");

    const cid = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
    await viem.assertions.emitWithArgs(
      inft.write.mint([cid, 7]),
      inft,
      "Minted",
      [1n, getAddress(deployer.account.address), cid],
    );

    const owner = await inft.read.ownerOf([1n]);
    assert.equal(owner.toLowerCase(), deployer.account.address.toLowerCase());
  });

  it("getIntelligence returns correct struct after mint", async function () {
    const inft = await viem.deployContract("iNFT");
    const cid = "bafk-personality-cid";

    await inft.write.mint([cid, 5]);

    const intel = await inft.read.getIntelligence([1n]);
    assert.equal(intel.personalityHash, cid);
    assert.equal(intel.memoryHash, "");
    assert.equal(intel.riskLevel, 5);
    assert.equal(intel.isActive, true);
    assert.equal(intel.portfolioManager, "0x0000000000000000000000000000000000000000");
  });

  it("getIntelligence reverts for non-existent token", async function () {
    const inft = await viem.deployContract("iNFT");
    await assert.rejects(inft.read.getIntelligence([99n]));
  });

  it("updateMemory succeeds for token owner", async function () {
    const inft = await viem.deployContract("iNFT");
    await inft.write.mint(["bafk-cid", 7]);

    const newCID = "bafk-memory-cid-updated";
    await viem.assertions.emitWithArgs(
      inft.write.updateMemory([1n, newCID]),
      inft,
      "MemoryUpdated",
      [1n, newCID],
    );

    const intel = await inft.read.getIntelligence([1n]);
    assert.equal(intel.memoryHash, newCID);
  });

  it("updateMemory succeeds for contract owner (agent wallet)", async function () {
    const inft = await viem.deployContract("iNFT");
    // user1 mints — deployer is contract owner, not token owner
    await inft.write.mint(["bafk-cid", 7], { account: user1.account });

    // deployer (contract owner) can update memory
    await inft.write.updateMemory([1n, "bafk-new-memory"], {
      account: deployer.account,
    });

    const intel = await inft.read.getIntelligence([1n]);
    assert.equal(intel.memoryHash, "bafk-new-memory");
  });

  it("updateMemory succeeds for portfolio manager", async function () {
    const inft = await viem.deployContract("iNFT");
    await inft.write.mint(["bafk-cid", 7]);

    // Set user2 as portfolio manager
    await inft.write.setPortfolioManager([1n, user2.account.address]);

    // user2 (portfolio manager) can update memory
    await inft.write.updateMemory([1n, "bafk-pm-memory"], {
      account: user2.account,
    });

    const intel = await inft.read.getIntelligence([1n]);
    assert.equal(intel.memoryHash, "bafk-pm-memory");
  });

  it("updateMemory reverts for unauthorized caller", async function () {
    const inft = await viem.deployContract("iNFT");
    await inft.write.mint(["bafk-cid", 7]);

    await assert.rejects(
      inft.write.updateMemory([1n, "bafk-hack"], { account: user1.account }),
    );
  });

  it("setPortfolioManager succeeds for token owner and emits event", async function () {
    const inft = await viem.deployContract("iNFT");
    await inft.write.mint(["bafk-cid", 7]);

    await viem.assertions.emitWithArgs(
      inft.write.setPortfolioManager([1n, user1.account.address]),
      inft,
      "PortfolioManagerSet",
      [1n, getAddress(user1.account.address)],
    );

    const intel = await inft.read.getIntelligence([1n]);
    assert.equal(
      intel.portfolioManager.toLowerCase(),
      user1.account.address.toLowerCase(),
    );
  });

  it("setPortfolioManager reverts for non-token-owner", async function () {
    const inft = await viem.deployContract("iNFT");
    await inft.write.mint(["bafk-cid", 7]);

    await assert.rejects(
      inft.write.setPortfolioManager([1n, user2.account.address], {
        account: user1.account,
      }),
    );
  });

  it("mint validates riskLevel bounds", async function () {
    const inft = await viem.deployContract("iNFT");
    await assert.rejects(inft.write.mint(["bafk-cid", 0]));
    await assert.rejects(inft.write.mint(["bafk-cid", 11]));
    // boundary values succeed
    await inft.write.mint(["bafk-cid-1", 1]);
    await inft.write.mint(["bafk-cid-10", 10]);
  });

  it("sequential mints produce incrementing tokenIds", async function () {
    const inft = await viem.deployContract("iNFT");
    await inft.write.mint(["bafk-cid-a", 3]);
    await inft.write.mint(["bafk-cid-b", 8]);

    const owner1 = await inft.read.ownerOf([1n]);
    const owner2 = await inft.read.ownerOf([2n]);
    assert.equal(owner1.toLowerCase(), deployer.account.address.toLowerCase());
    assert.equal(owner2.toLowerCase(), deployer.account.address.toLowerCase());
  });
});
