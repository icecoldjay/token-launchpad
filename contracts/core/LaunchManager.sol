// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TokenFactory.sol";
import "../extensions/LiquidityManager.sol";
import "../interfaces/IToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LaunchManager {
    TokenFactory public tokenFactory;
    address payable public liquidityManagerAddress;

    uint256 public launchFee;
    address public feeCollector;

    mapping(address => bytes32) public launchCommits;

    // Base token parameters (common for both launch types)
    struct TokenParams {
        string name;
        string symbol;
        uint8 decimals;
        uint256 totalSupply;
        address[] initialHolders;
        uint256[] initialAmounts;
        bool enableAntiBot;
    }

    // Parameters for ETH pair liquidity
    struct EthPairParams {
        uint256 tokenAmount; // Amount of our token for liquidity
        uint256 ethAmount; // Amount of ETH for liquidity
        uint256 tokenAmountMin; // Min amount of our token for slippage
        uint256 ethAmountMin; // Min amount of ETH for slippage
        uint256 lockDuration; // How long to lock liquidity for
    }

    // Parameters for custom token pair liquidity
    struct TokenPairParams {
        address pairToken; // The token to pair with (USDC, USDT, etc.)
        uint256 tokenAmount; // Amount of our token for liquidity
        uint256 pairAmount; // Amount of pair token for liquidity
        uint256 tokenAmountMin; // Min amount of our token for slippage
        uint256 pairAmountMin; // Min amount of pair token for slippage
        uint256 lockDuration; // How long to lock liquidity for
    }

    event LaunchCompleted(
        address indexed tokenAddress,
        uint256 indexed liquidityTokenId
    );
    event TokenDistributed(
        address indexed token,
        address indexed holder,
        uint256 amount
    );

    constructor(
        address _tokenFactory,
        address payable _liquidityManager,
        address _feeCollector,
        uint256 _launchFee
    ) {
        tokenFactory = TokenFactory(_tokenFactory);
        liquidityManagerAddress = _liquidityManager;
        feeCollector = _feeCollector;
        launchFee = _launchFee;
    }

    // Launch with ETH pair
    function instantLaunchWithEth(
        TokenParams calldata tokenParams,
        EthPairParams calldata ethParams
    ) external payable {
        // Get the token creation fee
        uint256 tokenCreationFee = tokenFactory.creationFee();

        // Check if enough ETH was sent (fee + token creation fee + amount for liquidity)
        require(
            msg.value >= launchFee + tokenCreationFee + ethParams.ethAmount,
            "Insufficient ETH"
        );

        // Deduct fee
        (bool sent, ) = feeCollector.call{value: launchFee}("");
        require(sent, "Fee transfer failed");

        // Create token - the token factory will mint all tokens to msg.sender and pre-approve
        address tokenAddress = _createToken(tokenParams);

        // Distribute tokens to initial holders
        _distributeTokens(tokenAddress, tokenParams);

        // Transfer tokens for liquidity from msg.sender to this contract
        IERC20 token = IERC20(tokenAddress);
        require(
            token.transferFrom(
                msg.sender,
                address(this),
                ethParams.tokenAmount
            ),
            "Liquidity token transfer failed"
        );

        // Approve the liquidity manager to spend these tokens
        token.approve(liquidityManagerAddress, ethParams.tokenAmount);

        // Create ETH liquidity
        uint256 ethForLiquidity = msg.value - launchFee - tokenCreationFee;
        (
            uint amountToken,
            uint amountETH,
            uint liquidity
        ) = _createLiquidityWithEth(tokenAddress, ethParams, ethForLiquidity);

        // Mark initial distribution as complete
        _completeInitialDistribution(tokenAddress);

        // Refund any excess ETH
        if (address(this).balance > 0) {
            (bool refunded, ) = msg.sender.call{value: address(this).balance}(
                ""
            );
            require(refunded, "Refund failed");
        }

        emit LaunchCompleted(tokenAddress, liquidity);
    }

    // Launch with custom token pair
    function instantLaunchWithToken(
        TokenParams calldata tokenParams,
        TokenPairParams calldata pairParams
    ) external payable {
        // Get the token creation fee
        uint256 tokenCreationFee = tokenFactory.creationFee();

        // Check if enough ETH was sent for both fees
        require(msg.value >= launchFee + tokenCreationFee, "Insufficient fee");

        // Deduct fee
        (bool sent, ) = feeCollector.call{value: launchFee}("");
        require(sent, "Fee transfer failed");

        // Create token - the token factory will mint all tokens to msg.sender and pre-approve
        address tokenAddress = _createToken(tokenParams);

        // Distribute tokens to initial holders
        _distributeTokens(tokenAddress, tokenParams);

        // Create token pair liquidity
        (
            uint amountA,
            uint amountB,
            uint liquidity
        ) = _createLiquidityWithToken(tokenAddress, pairParams);

        // Mark initial distribution as complete
        _completeInitialDistribution(tokenAddress);

        // Refund any excess ETH
        if (address(this).balance > 0) {
            (bool refunded, ) = msg.sender.call{value: address(this).balance}(
                ""
            );
            require(refunded, "Refund failed");
        }

        emit LaunchCompleted(tokenAddress, liquidity);
    }

    function _createToken(
        TokenParams calldata params
    ) private returns (address) {
        return
            tokenFactory.createToken{value: tokenFactory.creationFee()}(
                params.name,
                params.symbol,
                params.totalSupply,
                params.initialHolders,
                params.initialAmounts,
                liquidityManagerAddress, // Pass the liquidity manager address
                address(this), // Pass this contract as the launch manager
                true,
                msg.sender
            );
    }

    function _distributeTokens(
        address tokenAddress,
        TokenParams calldata params
    ) private {
        IERC20 token = IERC20(tokenAddress);

        // Transfer tokens from the token creator to initial holders
        // The token has already pre-approved this contract to spend tokens from msg.sender
        for (uint i = 0; i < params.initialHolders.length; i++) {
            if (
                params.initialHolders[i] != address(0) &&
                params.initialAmounts[i] > 0
            ) {
                require(
                    token.transferFrom(
                        msg.sender,
                        params.initialHolders[i],
                        params.initialAmounts[i]
                    ),
                    "Token transfer failed"
                );
                emit TokenDistributed(
                    tokenAddress,
                    params.initialHolders[i],
                    params.initialAmounts[i]
                );
            }
        }
    }

    function _completeInitialDistribution(address tokenAddress) private {
        IToken(tokenAddress).completeInitialDistribution();
    }

    function _createLiquidityWithEth(
        address tokenAddress,
        EthPairParams calldata params,
        uint256 ethAmount
    ) private returns (uint amountToken, uint amountETH, uint liquidity) {
        LiquidityManager liquidityManager = LiquidityManager(
            liquidityManagerAddress
        );

        // The liquidity manager is already pre-approved in the token contract
        // to spend tokens from msg.sender, so no need to transfer or approve again

        return
            liquidityManager.addLiquidityETH{value: ethAmount}(
                tokenAddress, // token address (our newly created token)
                params.tokenAmount, // amount of our token
                params.tokenAmountMin, // min amount of our token (for slippage)
                params.ethAmountMin, // min ETH amount (for slippage)
                params.lockDuration // how long to lock liquidity
            );
    }

    function _createLiquidityWithToken(
        address tokenAddress,
        TokenPairParams calldata params
    ) private returns (uint amountA, uint amountB, uint liquidity) {
        LiquidityManager liquidityManager = LiquidityManager(
            liquidityManagerAddress
        );

        // The liquidity manager is already pre-approved in the token contract
        // to spend tokens from msg.sender, so no need to transfer or approve again

        // For the pair token, we need to transfer it from sender to liquidity manager
        IERC20 pairToken = IERC20(params.pairToken);
        require(
            pairToken.transferFrom(
                msg.sender,
                address(this),
                params.pairAmount
            ),
            "Pair token transfer failed"
        );

        // Approve the liquidity manager to spend the pair token
        pairToken.approve(liquidityManagerAddress, params.pairAmount);

        return
            liquidityManager.addLiquidity(
                tokenAddress, // token A (our newly created token)
                params.pairToken, // token B (the pair token)
                params.tokenAmount, // amount of token A
                params.pairAmount, // amount of token B
                params.tokenAmountMin, // min amount of token A (for slippage)
                params.pairAmountMin, // min amount of token B (for slippage)
                params.lockDuration // how long to lock liquidity
            );
    }
}
