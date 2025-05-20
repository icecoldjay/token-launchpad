// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TokenTemplate.sol";
import "../interfaces/IToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenFactory is Ownable {
    address public feeCollector;
    uint256 public creationFee;

    mapping(address => address[]) public creatorTokens;
    address[] public allTokens;

    event TokenCreated(address indexed creator, address tokenAddress);
    event FeeCollectorUpdated(
        address indexed oldCollector,
        address indexed newCollector
    );
    event CreationFeeUpdated(uint256 oldFee, uint256 newFee);

    constructor(
        address _feeCollector,
        uint256 _creationFee
    ) Ownable(msg.sender) {
        // Use OZ Ownable's constructor implicitly
        feeCollector = _feeCollector;
        creationFee = _creationFee;
    }

    function createToken(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address[] memory initialHolders,
        uint256[] memory initialAmounts,
        address liquidityManager,
        address launchManager,
        bool launchWithLiquidity,
        address initialTokenOwner // Add this parameter
    ) external payable returns (address) {
        require(msg.value >= creationFee, "Insufficient fee");
        require(
            initialHolders.length == initialAmounts.length,
            "Holders and amounts mismatch"
        );

        // Create new token contract
        TokenTemplate token = new TokenTemplate(
            name,
            symbol,
            totalSupply,
            initialTokenOwner,
            initialHolders,
            initialAmounts,
            liquidityManager,
            launchManager,
            launchWithLiquidity
        );

        // Record token creation
        creatorTokens[msg.sender].push(address(token));
        allTokens.push(address(token));

        // Pay fee to collector
        (bool sent, ) = payable(feeCollector).call{value: creationFee}("");
        require(sent, "Fee transfer failed");

        // Refund excess fee
        if (msg.value > creationFee) {
            (bool refundSent, ) = payable(msg.sender).call{
                value: msg.value - creationFee
            }("");
            require(refundSent, "Refund failed");
        }

        emit TokenCreated(msg.sender, address(token));
        return address(token);
    }

    function getCreatorTokens(
        address creator
    ) external view returns (address[] memory) {
        return creatorTokens[creator];
    }

    function getCreatorTokenCount(
        address creator
    ) external view returns (uint256) {
        return creatorTokens[creator].length;
    }

    function getTotalTokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function updateFeeCollector(address _newCollector) external onlyOwner {
        require(_newCollector != address(0), "Invalid collector address");
        address oldCollector = feeCollector;
        feeCollector = _newCollector;
        emit FeeCollectorUpdated(oldCollector, _newCollector);
    }

    function updateCreationFee(uint256 _newFee) external onlyOwner {
        uint256 oldFee = creationFee;
        creationFee = _newFee;
        emit CreationFeeUpdated(oldFee, _newFee);
    }
}
