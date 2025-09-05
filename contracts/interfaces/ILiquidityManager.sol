// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title ILiquidityManager
 * @dev Interface for liquidity pool creation and management
 */
interface ILiquidityManager {
    /**
     * @dev Struct to track liquidity lock information
     */
    struct LockInfo {
        uint256 amount;      // Amount of LP tokens locked
        uint256 unlockTime;  // Timestamp when tokens can be unlocked
    }
    
    /**
     * @dev Creates a liquidity pool for a token
     * @param tokenAddress Address of the token contract
     * @param pairWith Address of the token to pair with (0x0 for ETH)
     * @param tokenAmount Amount of tokens to add to liquidity
     * @param lockDuration Duration of liquidity lock in seconds (0 for no lock)
     * @return address Address of the created liquidity pair
     */
    function createLiquidityPool(
        address tokenAddress,
        address pairWith,
        uint256 tokenAmount,
        uint256 lockDuration
    ) external payable returns (address);
    
    /**
     * @dev Unlocks liquidity after lock period
     * @param pair Address of the liquidity pair
     */
    function unlockLiquidity(address pair) external;
    
    /**
     * @dev Gets information about a locked liquidity pair
     * @param pair Address of the liquidity pair
     * @return LockInfo Struct containing lock information
     */
    function getLockInfo(address pair) external view returns (LockInfo memory);
    
    /**
     * @dev Extends the lock duration for a liquidity pair
     * @param pair Address of the liquidity pair
     * @param additionalTime Additional time to lock in seconds
     */
    function extendLockDuration(address pair, uint256 additionalTime) external;
    
    /**
     * @dev Adds more liquidity to an existing pair
     * @param tokenAddress Address of the token contract
     * @param pairWith Address of the paired token (0x0 for ETH)
     * @param tokenAmount Amount of tokens to add
     * @return uint256 Amount of LP tokens received
     */
    function addLiquidity(
        address tokenAddress,
        address pairWith,
        uint256 tokenAmount
    ) external payable returns (uint256);
    
    /**
     * @dev Emergency withdraw function (only for owner)
     * @param token Address of the token to withdraw
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external;
}