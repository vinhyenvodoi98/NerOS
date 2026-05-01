// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract KeeperAdapter {
    uint256 public constant INTERVAL = 300; // 5 minutes

    address public immutable owner;
    uint256 public lastRunTimestamp;

    event UpkeepTriggered(uint256 timestamp);

    constructor() {
        owner = msg.sender;
    }

    /// @notice Called off-chain by KeeperHub to check whether upkeep is due.
    function checkUpkeep(bytes calldata)
        external
        view
        returns (bool upkeepNeeded, bytes memory performData)
    {
        upkeepNeeded = (block.timestamp - lastRunTimestamp) >= INTERVAL;
        performData = "";
    }

    /// @notice Called on-chain by KeeperHub when upkeep is needed.
    /// Time-gated: reverts if INTERVAL has not elapsed. Idempotent: safe to call
    /// again once another INTERVAL elapses.
    function performUpkeep(bytes calldata) external {
        require(
            block.timestamp - lastRunTimestamp >= INTERVAL,
            "KA: too soon"
        );
        lastRunTimestamp = block.timestamp;
        emit UpkeepTriggered(block.timestamp);
    }

    /// @notice Owner-only force trigger — skips the interval check for demos.
    function forceUpkeep() external {
        require(msg.sender == owner, "KA: not owner");
        lastRunTimestamp = block.timestamp;
        emit UpkeepTriggered(block.timestamp);
    }
}
