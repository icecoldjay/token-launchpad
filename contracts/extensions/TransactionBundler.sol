// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TransactionBundler is Ownable {

    struct Transaction {
        address target;
        uint256 value;
        bytes data;
    }
    
    event BundleExecuted(uint256 indexed bundleId, address indexed executor, uint256 transactionCount);
    event TransactionFailed(uint256 indexed bundleId, uint256 indexed transactionIndex, bytes reason);
   
    constructor(address _initialOwner) Ownable(_initialOwner) {}
   
    // Execute multiple transactions atomically
    function executeBundle(Transaction[] calldata transactions) external payable returns (bool) {
        uint256 bundleId = uint256(keccak256(abi.encode(transactions, block.timestamp)));
       
        for (uint256 i = 0; i < transactions.length; i++) {
            Transaction calldata txn = transactions[i];
            (bool success, bytes memory returnData) = txn.target.call{value: txn.value}(txn.data);
            
            if (!success) {
                // Emit detailed error information
                emit TransactionFailed(bundleId, i, returnData);
                revert(string(returnData));
            }
        }
       
        // Refund any remaining ETH
        if (address(this).balance > 0) {
            (bool sent, ) = msg.sender.call{value: address(this).balance}("");
            require(sent, "ETH refund failed");
        }
       
        emit BundleExecuted(bundleId, msg.sender, transactions.length);
        return true;
    }
}