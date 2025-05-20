// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract TokenAccessControl is AccessControl {
    // Predefined roles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // Events for role management
    event AdminRoleGranted(address indexed account, address indexed sender);
    event OperatorRoleGranted(address indexed account, address indexed sender);

    constructor() {
        // Grant DEFAULT_ADMIN_ROLE and ADMIN_ROLE to contract deployer
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // Modifiers for role-based access control
    modifier onlyAdmin() {
        _checkRole(ADMIN_ROLE, msg.sender);
        _;
    }

    modifier onlyOperator() {
        _checkRole(ADMIN_ROLE, msg.sender);
        _checkRole(OPERATOR_ROLE, msg.sender);
        _;
    }

    // Enhanced role management functions
    function grantAdminRole(address account) external onlyAdmin {
        grantRole(ADMIN_ROLE, account);
        emit AdminRoleGranted(account, msg.sender);
    }

    function grantOperatorRole(address account) external onlyAdmin {
        grantRole(OPERATOR_ROLE, account);
        emit OperatorRoleGranted(account, msg.sender);
    }

    function revokeRole(bytes32 role, address account) public virtual override onlyAdmin {
        super.revokeRole(role, account);
        emit RoleRevoked(role, account, msg.sender);
    }

    // Optional renounce role with admin approval
    function renounceRole(bytes32 role, address account) public virtual override {
        require(
            account == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Cannot renounce role for another account"
        );
        super.renounceRole(role, account);
    }
}