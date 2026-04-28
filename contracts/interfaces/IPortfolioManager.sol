// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPortfolioManager {
    event TradeExecuted(
        uint256 indexed nftId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event Deposited(uint256 indexed nftId, address token, uint256 amount);
    event Withdrawn(uint256 indexed nftId, address token, uint256 amount);

    function executeTrade(
        uint256 nftId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint24 poolFee
    ) external returns (uint256 amountOut);

    function getBalance(uint256 nftId, address token) external view returns (uint256);

    function deposit(uint256 nftId, address token, uint256 amount) external;

    function withdraw(uint256 nftId, address token, uint256 amount) external;
}
