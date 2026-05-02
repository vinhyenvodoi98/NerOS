// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract KeeperAdapter {
    uint256 public constant INTERVAL = 300; // 5 minutes

    address public immutable owner;
    uint256 public lastRunTimestamp;
    bool    public isActive = true;

    event UpkeepTriggered(uint256 timestamp);
    event ActiveChanged(bool isActive);

    constructor() {
        owner = msg.sender;
    }

    /// @notice Owner-only pause/resume — stops performUpkeep and forceUpkeep.
    function setActive(bool active) external {
        require(msg.sender == owner, "KA: not owner");
        isActive = active;
        emit ActiveChanged(active);
    }

    /// @notice Called off-chain by KeeperHub to check whether upkeep is due.
    function checkUpkeep(bytes calldata)
        external
        view
        returns (bool upkeepNeeded, bytes memory performData)
    {
        upkeepNeeded = isActive && (block.timestamp - lastRunTimestamp) >= INTERVAL;
        performData = "";
    }

    /// @notice Called on-chain by KeeperHub when upkeep is needed.
    function performUpkeep(bytes calldata) external {
        require(isActive, "KA: paused");
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
        require(isActive, "KA: paused");
        lastRunTimestamp = block.timestamp;
        emit UpkeepTriggered(block.timestamp);
    }

    /// @notice Accept ETH for gas funding.
    receive() external payable {}

    /// @notice Withdraw all ETH back to owner.
    function withdraw() external {
        require(msg.sender == owner, "KA: not owner");
        (bool ok, ) = owner.call{ value: address(this).balance }("");
        require(ok, "KA: transfer failed");
    }
}
