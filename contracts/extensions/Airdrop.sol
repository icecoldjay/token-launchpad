// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IToken.sol";

/**
 * @title AirdropManager
 * @dev Manages token airdrops for newly created tokens
 */
contract AirdropManager is Ownable {
    address public feeCollector;
    uint256 public airdropFee;
    
    // Track airdrop information
    struct AirdropInfo {
        address token;
        uint256 totalAmount;
        uint256 distributedAmount;
        uint256 recipientCount;
        uint256 timestamp;
        bool completed;
    }
    
    // Mapping to track airdrop history by token address
    mapping(address => AirdropInfo[]) public airdropHistory;
    
    // Events
    event AirdropExecuted(
        address indexed token,
        uint256 indexed airdropIndex,
        uint256 totalAmount,
        uint256 recipientCount
    );
    event AirdropCompleted(
        address indexed token,
        uint256 indexed airdropIndex,
        uint256 totalAmount
    );
    event FeeCollectorUpdated(address indexed oldCollector, address indexed newCollector);
    event AirdropFeeUpdated(uint256 oldFee, uint256 newFee);
    
    constructor(address _feeCollector, uint256 _airdropFee) Ownable(msg.sender) {
        require(_feeCollector != address(0), "Invalid fee collector");
        feeCollector = _feeCollector;
        airdropFee = _airdropFee;
    }
    
    /**
     * @dev Execute an airdrop to multiple recipients
     * @param token The token address to airdrop
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to distribute to each recipient
     */
    function executeAirdrop(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external payable {
        require(msg.value >= airdropFee, "Insufficient fee");
        require(token != address(0), "Invalid token address");
        require(recipients.length == amounts.length, "Arrays length mismatch");
        require(recipients.length > 0, "Empty recipients list");
        require(recipients.length <= 500, "Too many recipients at once");
        
        IERC20 tokenContract = IERC20(token);
        
        // Calculate total amount to distribute
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        
        require(totalAmount > 0, "No tokens to distribute");
        
        // Transfer tokens from sender to this contract
        require(
            tokenContract.transferFrom(msg.sender, address(this), totalAmount),
            "Token transfer failed"
        );
        
        // Create airdrop record
        uint256 airdropIndex = airdropHistory[token].length;
        airdropHistory[token].push(
            AirdropInfo({
                token: token,
                totalAmount: totalAmount,
                distributedAmount: 0,
                recipientCount: recipients.length,
                timestamp: block.timestamp,
                completed: false
            })
        );
        
        // Distribute tokens batch by batch
        _distributeTokens(token, airdropIndex, recipients, amounts);
        
        // Pay fee to collector
        (bool sent, ) = payable(feeCollector).call{value: airdropFee}("");
        require(sent, "Fee transfer failed");
        
        // Refund excess fee
        if (msg.value > airdropFee) {
            (bool refundSent, ) = payable(msg.sender).call{value: msg.value - airdropFee}("");
            require(refundSent, "Refund failed");
        }
        
        emit AirdropExecuted(token, airdropIndex, totalAmount, recipients.length);
    }
    
    /**
     * @dev Internal function to distribute tokens in batches
     */
    function _distributeTokens(
        address token,
        uint256 airdropIndex,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) internal {
        IERC20 tokenContract = IERC20(token);
        AirdropInfo storage airdropInfo = airdropHistory[token][airdropIndex];
        
        // Distribute tokens to recipients
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] != address(0) && amounts[i] > 0) {
                require(
                    tokenContract.transfer(recipients[i], amounts[i]),
                    "Token transfer failed"
                );
                airdropInfo.distributedAmount += amounts[i];
            }
        }
        
        // Mark airdrop as completed
        airdropInfo.completed = true;
        
        emit AirdropCompleted(token, airdropIndex, airdropInfo.distributedAmount);
    }
    
    /**
     * @dev Get total number of airdrops for a token
     */
    function getAirdropCount(address token) external view returns (uint256) {
        return airdropHistory[token].length;
    }
    
    /**
     * @dev Get airdrop details by index
     */
    function getAirdropInfo(
        address token,
        uint256 index
    ) external view returns (AirdropInfo memory) {
        require(index < airdropHistory[token].length, "Invalid airdrop index");
        return airdropHistory[token][index];
    }
    
    /**
     * @dev Admin function to update the fee collector address
     */
    function updateFeeCollector(address _newCollector) external onlyOwner {
        require(_newCollector != address(0), "Invalid collector address");
        address oldCollector = feeCollector;
        feeCollector = _newCollector;
        emit FeeCollectorUpdated(oldCollector, _newCollector);
    }
    
    /**
     * @dev Admin function to update the airdrop fee
     */
    function updateAirdropFee(uint256 _newFee) external onlyOwner {
        uint256 oldFee = airdropFee;
        airdropFee = _newFee;
        emit AirdropFeeUpdated(oldFee, _newFee);
    }
    
    /**
     * @dev Emergency function to rescue ERC20 tokens sent to this contract by mistake
     */
    function rescueTokens(
        address tokenAddress,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        IERC20(tokenAddress).transfer(recipient, amount);
    }
    
    /**
     * @dev Emergency function to rescue ETH sent to this contract by mistake
     */
    function rescueETH(address payable recipient, uint256 amount) external onlyOwner {
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "ETH transfer failed");
    }
}