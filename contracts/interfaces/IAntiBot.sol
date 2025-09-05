// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title IAntiBot
 * @dev Interface for anti-bot protection mechanisms
 */
interface IAntiBot {
    /**
     * @dev Initializes anti-bot protection mechanisms
     * @param maxTxAmount Maximum transaction amount
     * @param maxWalletAmount Maximum wallet holding amount
     */
    function initialize(uint256 maxTxAmount, uint256 maxWalletAmount) external;
    
    /**
     * @dev Checks if a transfer is allowed based on anti-bot rules
     * @param from Sender address
     * @param to Recipient address
     * @param amount Transfer amount
     * @return bool Whether the transfer is allowed
     */
    function checkTransfer(address from, address to, uint256 amount) external view returns (bool);
    
    /**
     * @dev Adds an address to the blacklist
     * @param account Address to blacklist
     */
    function blacklistAddress(address account) external;
    
    /**
     * @dev Removes an address from the blacklist
     * @param account Address to remove from blacklist
     */
    function removeFromBlacklist(address account) external;
    
    /**
     * @dev Sets the maximum transaction amount
     * @param amount Maximum transaction amount
     */
    function setMaxTxAmount(uint256 amount) external;
    
    /**
     * @dev Sets the maximum wallet amount
     * @param amount Maximum wallet amount
     */
    function setMaxWalletAmount(uint256 amount) external;
    
    /**
     * @dev Excludes an address from transaction limits
     * @param account Address to exclude
     * @param excluded Whether the address should be excluded
     */
    function excludeFromLimits(address account, bool excluded) external;
    
    /**
     * @dev Enables or disables anti-bot protection
     * @param enabled Whether anti-bot protection should be enabled
     */
    function setEnabled(bool enabled) external;
    
    /**
     * @dev Gets the current trading status
     * @return bool Whether trading is enabled
     */
    function tradingEnabled() external view returns (bool);
}