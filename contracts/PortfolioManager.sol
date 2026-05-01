// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// SwapRouter02 interface — no `deadline` field (differs from SwapRouter V1)
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IiNFT {
    struct Intelligence {
        string personalityHash;
        string memoryHash;
        address portfolioManager;
        uint8 riskLevel;
        bool isActive;
    }
    function getIntelligence(uint256 tokenId) external view returns (Intelligence memory);
}

contract PortfolioManager {
    using SafeERC20 for IERC20;

    ISwapRouter02 public immutable swapRouter;
    IiNFT public immutable iNFTContract;

    address public owner;
    address public keeperAdapter;

    // balances[nftId][token] = amount in token's native decimals
    mapping(uint256 => mapping(address => uint256)) public balances;

    event TradeExecuted(
        uint256 indexed nftId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event Deposited(uint256 indexed nftId, address token, uint256 amount);
    event Withdrawn(uint256 indexed nftId, address token, uint256 amount);
    event KeeperAdapterSet(address keeperAdapter);

    modifier onlyAuthorized() {
        require(
            msg.sender == owner || msg.sender == keeperAdapter,
            "PM: not authorized"
        );
        _;
    }

    constructor(address _swapRouter, address _iNFTContract) {
        swapRouter = ISwapRouter02(_swapRouter);
        iNFTContract = IiNFT(_iNFTContract);
        owner = msg.sender;
    }

    function setKeeperAdapter(address _keeper) external {
        require(msg.sender == owner, "PM: not owner");
        keeperAdapter = _keeper;
        emit KeeperAdapterSet(_keeper);
    }

    function deposit(uint256 nftId, address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[nftId][token] += amount;
        emit Deposited(nftId, token, amount);
    }

    function executeTrade(
        uint256 nftId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint24 poolFee
    ) external onlyAuthorized returns (uint256 amountOut) {
        require(amountOutMin > 0, "PM: amountOutMin must be > 0");
        require(balances[nftId][tokenIn] >= amountIn, "PM: insufficient balance");

        // enforce maxPositionPct: amountIn <= (riskLevel * 10)% of tokenIn balance
        // riskLevel 7 → 70%, riskLevel 10 → 100% (max aggressive)
        IiNFT.Intelligence memory intel = iNFTContract.getIntelligence(nftId);
        uint256 maxPct = uint256(intel.riskLevel) * 10;
        require(
            amountIn * 100 <= balances[nftId][tokenIn] * maxPct,
            "PM: exceeds maxPositionPct"
        );

        balances[nftId][tokenIn] -= amountIn;

        IERC20(tokenIn).forceApprove(address(swapRouter), amountIn);

        ISwapRouter02.ExactInputSingleParams memory params = ISwapRouter02.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: poolFee,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        });

        amountOut = swapRouter.exactInputSingle(params);
        balances[nftId][tokenOut] += amountOut;

        emit TradeExecuted(nftId, tokenIn, tokenOut, amountIn, amountOut);
    }

    function getBalance(uint256 nftId, address token) external view returns (uint256) {
        return balances[nftId][token];
    }

    function withdraw(uint256 nftId, address token, uint256 amount) external {
        require(msg.sender == owner, "PM: not owner");
        require(balances[nftId][token] >= amount, "PM: insufficient balance");
        balances[nftId][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(nftId, token, amount);
    }
}
