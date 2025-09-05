// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.20;

// Mock contract for testing refund failures
contract MockReceiver {
    // Reject all incoming ETH transfers
    receive() external payable {
        revert();
    }
}
