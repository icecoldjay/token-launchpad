// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenTemplate is ERC20, Ownable {
    bool public tradingEnabled;
    uint256 public launchTime;
    uint256 public launchBlock;

    // Flag to track initial distribution status
    bool private _initialDistributionComplete;

    // Store total tokens to be distributed
    uint256 public tokensToDistribute;

    // Simple whitelist for liquidity manager
    mapping(address => bool) public isWhitelisted;
    event TradingEnabled(uint256 timestamp);
    event InitialDistributionComplete();
    event AddressWhitelisted(address indexed account, bool status);
    event LiquidityApproved(address indexed liquidityManager, uint256 amount);
    event LaunchManagerApproved(address indexed launchManager, uint256 amount);

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address _initialOwner,
        address[] memory initialHolders,
        uint256[] memory initialAmounts,
        address liquidityManager,
        address launchManager,
        bool launchWithLiquidity 
    ) ERC20(name, symbol) Ownable(_initialOwner) {
        require(
            initialHolders.length == initialAmounts.length,
            "Arrays length mismatch"
        );
        require(
            initialHolders.length <= 10,
            "Maximum 10 initial holders allowed"
        );

        // Calculate tokens to be distributed
        tokensToDistribute = 0;
        for (uint i = 0; i < initialHolders.length; i++) {
            if (initialHolders[i] != address(0) && initialAmounts[i] > 0) {
                tokensToDistribute += initialAmounts[i];
            }
        }

        // Make sure we don't exceed total supply
        require(
            tokensToDistribute <= totalSupply,
            "Distribution exceeds total supply"
        );

        // Mint all tokens to the initial owner
        _mint(_initialOwner, totalSupply);

        // Whitelist the owner by default
        isWhitelisted[owner()] = true;

        // Pre-approve the launch manager to spend tokens for distribution
        // Approval strategy based on the launch type
        if (launchManager != address(0)) {
            if (launchWithLiquidity) {
                // For launches that include liquidity: approve all tokens
                _approve(_initialOwner, launchManager, totalSupply);
                emit LaunchManagerApproved(launchManager, totalSupply);
            } else {
                // For distribution-only launches: approve only tokens to distribute
                _approve(_initialOwner, launchManager, tokensToDistribute);
                emit LaunchManagerApproved(launchManager, tokensToDistribute);
            }
        }

        // Approve liquidity manager for liquidity provision with remaining tokens
        if (liquidityManager != address(0)) {
            // Calculate remaining tokens for liquidity
            uint256 remainingTokens = totalSupply - tokensToDistribute;

            // Approve for liquidity provision with remaining tokens
            _approve(_initialOwner, liquidityManager, remainingTokens);
            emit LiquidityApproved(liquidityManager, remainingTokens);

            // Whitelist the liquidity manager
            isWhitelisted[liquidityManager] = true;
            emit AddressWhitelisted(liquidityManager, true);
        }

        // Whitelist the launch manager if provided and not already whitelisted
        if (launchManager != address(0) && launchManager != liquidityManager) {
            isWhitelisted[launchManager] = true;
            emit AddressWhitelisted(launchManager, true);
        }
    }

    function completeInitialDistribution() external {
        require(
            msg.sender == owner() || isWhitelisted[msg.sender],
            "Not authorized"
        );
        require(
            !_initialDistributionComplete,
            "Initial distribution already completed"
        );
        _initialDistributionComplete = true;
        emit InitialDistributionComplete();
    }

    function enableTrading() external onlyOwner {
        require(!tradingEnabled, "Trading already enabled");
        tradingEnabled = true;
        launchTime = block.timestamp;
        launchBlock = block.number;
        emit TradingEnabled(launchTime);
    }

    function whitelistAddress(address account, bool status) public onlyOwner {
        isWhitelisted[account] = status;
        emit AddressWhitelisted(account, status);
    }

    function approveLiquidityManager(
        address liquidityManager,
        uint256 amount
    ) external onlyOwner {
        require(
            liquidityManager != address(0),
            "Invalid liquidityManager address"
        );
        _approve(msg.sender, liquidityManager, amount);
        emit LiquidityApproved(liquidityManager, amount);
    }

    function approveLaunchManager(
        address launchManager,
        uint256 amount
    ) external onlyOwner {
        require(launchManager != address(0), "Invalid launchManager address");
        _approve(msg.sender, launchManager, amount);
        emit LaunchManagerApproved(launchManager, amount);
    }
}
