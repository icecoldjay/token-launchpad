// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title SecurityUtils
 * @dev Simplified security utility functions for token contracts
 */
library SecurityUtils {
    using Address for address;

    /**
     * @dev Struct to store contract security settings
     */
    struct SecuritySettings {
        bool pausable;
        bool paused;
        bool blockContractsByDefault;
        mapping(address => bool) blockedContracts;
        mapping(address => bool) trustedContracts;
    }
    
    /**
     * @dev Initializes security settings with minimal defaults
     * @param settings Security settings storage pointer
     */
    function initialize(SecuritySettings storage settings) internal {
        settings.pausable = true;
        settings.paused = false; // Start unpaused by default
        settings.blockContractsByDefault = false;
    }
    
    /**
     * @dev Simplified security check that only blocks explicitly blacklisted contracts
     * @param settings Security settings storage pointer
     * @param from Sender address
     * @param to Recipient address
     * @return bool Whether the transfer passes security checks
     */
    function isSecureTransfer(
        SecuritySettings storage settings,
        address from,
        address to
    ) internal view returns (bool) {
        // Only block if explicitly paused
        if (settings.pausable && settings.paused) {
            return false;
        }
        
        // Only block explicitly blacklisted contracts
        if (isContract(from) && settings.blockedContracts[from]) {
            return false;
        }
        
        // Allow all other transfers
        return true;
    }
    
    /**
     * @dev Checks if an address is a contract
     * @param addr Address to check
     * @return bool Whether the address is a contract
     */
    function isContract(address addr) internal view returns (bool) {
        return addr.code.length > 0;
    }

    /**
     * @dev Validates an address is not zero address
     * @param addr Address to validate
     * @return bool Whether the address is valid
     */
    function isValidAddress(address addr) internal pure returns (bool) {
        return addr != address(0);
    }
    
    /**
     * @dev Sets a contract as trusted or blocked
     * @param settings Security settings storage pointer
     * @param contractAddr Contract address
     * @param trusted Whether the contract should be trusted
     * @param blocked Whether the contract should be blocked
     */
    function setContractStatus(
        SecuritySettings storage settings,
        address contractAddr,
        bool trusted,
        bool blocked
    ) internal {
        require(isContract(contractAddr), "Address is not a contract");
        settings.trustedContracts[contractAddr] = trusted;
        settings.blockedContracts[contractAddr] = blocked;
    }
    
    /**
     * @dev Toggles the paused state
     * @param settings Security settings storage pointer
     * @param paused Whether the contract should be paused
     */
    function setPaused(SecuritySettings storage settings, bool paused) internal {
        require(settings.pausable, "Contract is not pausable");
        settings.paused = paused;
    }

    function setBlockContractsByDefault(
        SecuritySettings storage settings,
        bool blocked
    ) internal {
        settings.blockContractsByDefault = blocked;
    }
}