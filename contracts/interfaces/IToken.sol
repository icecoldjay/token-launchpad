// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IToken {
    function enableTrading() external;
    function setAntiBotEnabled(bool enabled) external;
    function setMaxTxAmount(uint256 amount) external;
    function setMaxWalletAmount(uint256 amount) external;
    function excludeFromLimits(address account, bool excluded) external;
    function completeInitialDistribution() external;
}