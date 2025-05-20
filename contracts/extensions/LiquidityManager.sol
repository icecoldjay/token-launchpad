// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IUniswapV2Router02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
    
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
}

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint value) external returns (bool);
}

contract LiquidityManager is Ownable {
    // State variables
    IUniswapV2Router02 public immutable router;
    address public immutable weth;
    
    // Structs for organizing data
    struct LockInfo {
        address pair;
        uint256 unlockTime;
    }
    
    struct LiquidityParams {
        address tokenA;
        address tokenB;
        uint256 amountA;
        uint256 amountB;
        uint256 amountAMin;
        uint256 amountBMin;
        uint256 lockDuration;
        bool isEthPair;
        address recipient;
    }
    
    struct TokenPair {
        address token0;
        address token1;
        bool isToken0Weth;
        bool isToken1Weth;
    }
    
    // Mappings
    mapping(address => LockInfo) public liquidityLocks;
    
    // Events
    event LiquidityAdded(
        address indexed tokenA, 
        address indexed tokenB, 
        address pair, 
        uint amountA, 
        uint amountB, 
        uint liquidity
    );
    event LiquidityLocked(address indexed pair, uint256 unlockTime);
    event LiquidityUnlocked(address indexed pair, address recipient);
    event PairCreated(address indexed tokenA, address indexed tokenB, address pair);
    event TokensApproved(address token, uint256 amount);
    event TokensTransferred(address token, address from, address to, uint256 amount);
    event RefundSent(address token, address recipient, uint256 amount);
    
    constructor(address _router) Ownable(msg.sender) {
        router = IUniswapV2Router02(_router);
        weth = router.WETH();
    }
    
    // Main entry point for adding liquidity with two ERC20 tokens
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 lockDuration
    ) external payable returns (uint amountTokenA, uint amountTokenB, uint liquidity) {
        require(!(_isWETH(tokenA) && _isWETH(tokenB)), "Cannot create WETH/WETH pair");
        // Create the params struct
        LiquidityParams memory params = LiquidityParams({
            tokenA: tokenA,
            tokenB: tokenB,
            amountA: amountA,
            amountB: amountB,
            amountAMin: amountAMin,
            amountBMin: amountBMin,
            lockDuration: lockDuration,
            isEthPair: false,
            recipient: lockDuration > 0 ? address(this) : msg.sender
        });
        
        // Step 1: Transfer tokens from user to this contract
        _transferTokensToContract(params);
        
        // Step 2: Approve router to spend tokens
        _approveTokensForRouter(params);
        
        // Step 3: Add liquidity through router
        (amountTokenA, amountTokenB, liquidity) = _addLiquidityViaRouter(params);
        
        // Step 4: Refund excess tokens
        _refundExcessTokens(params, amountTokenA, amountTokenB);
        
        // Step 5: Handle locking if needed
        _handleLiquidityLocking(params, tokenA, tokenB);
        
        return (amountTokenA, amountTokenB, liquidity);
    }
    
    // Main entry point for adding liquidity with ETH and an ERC20 token
    function addLiquidityETH(
        address token,
        uint256 amountToken,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        uint256 lockDuration
    ) external payable returns (uint amountTokenOut, uint amountETH, uint liquidity) {
        require(!_isWETH(token), "Use addLiquidity for WETH pairs");
        // Create the params struct
        LiquidityParams memory params = LiquidityParams({
            tokenA: token,
            tokenB: weth,
            amountA: amountToken,
            amountB: msg.value,
            amountAMin: amountTokenMin,
            amountBMin: amountETHMin,
            lockDuration: lockDuration,
            isEthPair: true,
            recipient: lockDuration > 0 ? address(this) : msg.sender
        });
        
        // Step 1: Transfer token from user to this contract (ETH is already here)
        _transferTokenToContract(token, amountToken);
        
        // Step 2: Approve router to spend token
        _approveTokenForRouter(token, amountToken);
        
        // Step 3: Add liquidity through router
        (amountTokenOut, amountETH, liquidity) = _addLiquidityETHViaRouter(params);
        
        // Step 4: Refund excess tokens and ETH
        _refundExcessTokenAndETH(params, amountTokenOut, amountETH);
        
        // Step 5: Handle locking if needed
        _handleLiquidityLocking(params, token, weth);
        
        return (amountTokenOut, amountETH, liquidity);
    }

    function _isWETH(address token) private view returns (bool) {
        return token == weth;
    }
    
    // Helper function 1: Transfer tokens from user to contract
    function _transferTokensToContract(LiquidityParams memory params) private {
        if (!_isWETH(params.tokenA)) {
            _transferTokenToContract(params.tokenA, params.amountA);
        }
        
        if (!params.isEthPair && !_isWETH(params.tokenB)) {
            _transferTokenToContract(params.tokenB, params.amountB);
        }
    }
    
    // Helper function for transferring a single token
    function _transferTokenToContract(address token, uint256 amount) private {
        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Transfer of token failed");
        emit TokensTransferred(token, msg.sender, address(this), amount);
    }
    
    // Helper function 2: Approve router to spend tokens
    function _approveTokensForRouter(LiquidityParams memory params) private {
        if (!_isWETH(params.tokenA)) {
            _approveTokenForRouter(params.tokenA, params.amountA);
        }
        
        if (!params.isEthPair && !_isWETH(params.tokenB)) {
            _approveTokenForRouter(params.tokenB, params.amountB);
        }
    }
    
    // Helper function for approving a single token
    function _approveTokenForRouter(address token, uint256 amount) private {
        IERC20(token).approve(address(router), amount);
        emit TokensApproved(token, amount);
    }
    
    // Helper function 3A: Add liquidity through router for token pairs
    function _addLiquidityViaRouter(LiquidityParams memory params) 
        private 
        returns (uint amountA, uint amountB, uint liquidity) 
    {
        return router.addLiquidity(
            params.tokenA,
            params.tokenB,
            params.amountA,
            params.amountB,
            params.amountAMin,
            params.amountBMin,
            params.recipient,
            block.timestamp + 300
        );
    }
    
    // Helper function 3B: Add liquidity through router for ETH pairs
    function _addLiquidityETHViaRouter(LiquidityParams memory params) 
        private 
        returns (uint amountToken, uint amountETH, uint liquidity) 
    {
        return router.addLiquidityETH{value: params.amountB}(
            params.tokenA,
            params.amountA,
            params.amountAMin,
            params.amountBMin,
            params.recipient,
            block.timestamp + 300
        );
    }
    
    // Helper function 4A: Refund excess tokens
    function _refundExcessTokens(
        LiquidityParams memory params,
        uint256 amountAUsed,
        uint256 amountBUsed
    ) private {
        if (params.amountA > amountAUsed) {
            uint256 refundAmount = params.amountA - amountAUsed;
            IERC20(params.tokenA).transfer(msg.sender, refundAmount);
            emit RefundSent(params.tokenA, msg.sender, refundAmount);
        }
        
        if (!params.isEthPair && params.amountB > amountBUsed) {
            uint256 refundAmount = params.amountB - amountBUsed;
            IERC20(params.tokenB).transfer(msg.sender, refundAmount);
            emit RefundSent(params.tokenB, msg.sender, refundAmount);
        }
    }
    
    // Helper function 4B: Refund excess token and ETH
    function _refundExcessTokenAndETH(
        LiquidityParams memory params,
        uint256 amountTokenUsed,
        uint256 amountETHUsed
    ) private {
        if (params.amountA > amountTokenUsed) {
            uint256 refundAmount = params.amountA - amountTokenUsed;
            IERC20(params.tokenA).transfer(msg.sender, refundAmount);
            emit RefundSent(params.tokenA, msg.sender, refundAmount);
        }
        
        if (params.amountB > amountETHUsed) {
            uint256 refundAmount = params.amountB - amountETHUsed;
            (bool success, ) = msg.sender.call{value: refundAmount}("");
            require(success, "ETH refund failed");
            emit RefundSent(address(0), msg.sender, refundAmount); // address(0) represents ETH
        }
    }
    
    // Helper function 5: Handle liquidity locking if needed
    function _handleLiquidityLocking(
        LiquidityParams memory params,
        address tokenA,
        address tokenB
    ) private {
        if (params.lockDuration > 0) {
            // Get pair address
            address pair = IUniswapV2Factory(router.factory()).getPair(tokenA, tokenB);
            require(pair != address(0), "Pair does not exist");
            
            // Set up lock info
            liquidityLocks[pair] = LockInfo({
                pair: pair,
                unlockTime: block.timestamp + params.lockDuration
            });
            
            emit LiquidityLocked(pair, block.timestamp + params.lockDuration);
        }
    }
    
    // Function to unlock liquidity after the lock duration
    function unlockLiquidity(address pair) external {
        LockInfo storage lockInfo = liquidityLocks[pair];
        require(lockInfo.pair == pair, "Liquidity not locked");
        require(block.timestamp >= lockInfo.unlockTime, "Liquidity still locked");
        require(msg.sender == owner(), "Not authorized");
        
        // Get liquidity amount
        uint256 liquidity = IERC20(pair).balanceOf(address(this));
        require(liquidity > 0, "No liquidity to unlock");
        
        // Transfer LP tokens back to sender
        IERC20(pair).transfer(msg.sender, liquidity);
        
        // Clear lock info
        delete liquidityLocks[pair];
        
        emit LiquidityUnlocked(pair, msg.sender);
    }
    
    // Function to create a pair if it doesn't exist
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        IUniswapV2Factory factory = IUniswapV2Factory(router.factory());
        pair = factory.getPair(tokenA, tokenB);
        
        if (pair == address(0)) {
            pair = factory.createPair(tokenA, tokenB);
            emit PairCreated(tokenA, tokenB, pair);
        }
        
        return pair;
    }
    
    // Debug function to check token allowances
    function checkAllowance(address token, address spender) external view returns (uint256) {
        return IERC20(token).allowance(address(this), spender);
    }
    
    // Debug function to check token balances
    function checkBalance(address token, address account) external view returns (uint256) {
        return IERC20(token).balanceOf(account);
    }
    
    // Debug function to transfer tokens directly
    function debugTransferToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }
    
    // Debug function to approve tokens directly
    function debugApproveToken(address token, address spender, uint256 amount) external onlyOwner {
        IERC20(token).approve(spender, amount);
    }
    
    // Handle received ETH
    receive() external payable {}
}