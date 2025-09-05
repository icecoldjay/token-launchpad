// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract UniswapV2FactoryMock {
    mapping(address => mapping(address => address)) public getPair;
    address public createPairResponse;

    constructor() {}

    function createPair(
        address tokenA,
        address tokenB
    ) external returns (address pair) {
        require(tokenA != tokenB, "UniswapV2: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2: ZERO_ADDRESS");

        // Mock response from pair creation
        pair = createPairResponse;
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        return pair;
    }

    // Helper function for testing to set pair mapping
    function setPair(address tokenA, address tokenB, address pair) external {
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
    }

    // Helper function for testing to set createPair response
    function setCreatePairResponse(address pairAddress) external {
        createPairResponse = pairAddress;
    }
}
