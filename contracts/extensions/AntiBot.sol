// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AntiBot
 * @dev Simplified anti-bot measures for token launches
 */
library AntiBot {
    struct AntiBotConfig {
        bool enabled;
        uint256 maxTxAmount;
        uint256 maxWalletAmount;
        mapping(address => bool) blacklisted;
    }
    
    /**
     * @dev Initializes anti-bot configuration
     * @param config Anti-bot config storage pointer
     * @param _maxTxAmount Maximum transaction amount
     * @param _maxWalletAmount Maximum wallet balance
     */
    function initialize(
        AntiBotConfig storage config,
        uint256 _maxTxAmount,
        uint256 _maxWalletAmount
    ) internal {
        config.enabled = false; // Start disabled by default
        config.maxTxAmount = _maxTxAmount;
        config.maxWalletAmount = _maxWalletAmount;
    }
    
    /**
     * @dev Applies simplified anti-bot checks
     */
    function applyAntiBotLimits(
        AntiBotConfig storage config,
        address tokenAddress,
        address from,
        address to,
        uint256 amount,
        uint256 recipientBalance,
        uint256 launchTime,
        uint256 launchBlock
    ) internal view {
        // Only apply limits if enabled
        if (!config.enabled) {
            return;
        }
        
        // Basic transaction amount limit
        require(amount <= config.maxTxAmount, "Transfer exceeds transaction limit");
        
        // Basic wallet balance limit
        require(recipientBalance + amount <= config.maxWalletAmount, "Transfer exceeds wallet limit");
    }

    function blacklistAddress(AntiBotConfig storage config, address account) internal {
        config.blacklisted[account] = true;
    }
    
    function removeFromBlacklist(AntiBotConfig storage config, address account) internal {
        config.blacklisted[account] = false;
    }
}