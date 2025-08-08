// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(
        uint amountIn,
        address[] calldata path
    ) external view returns (uint[] memory amounts);

    function getAmountsIn(
        uint amountOut,
        address[] calldata path
    ) external view returns (uint[] memory amounts);
}

contract TokenSwapContract is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    IUniswapV2Router public immutable uniswapRouter;

    uint256 public feePercentage = 30; // 0.3% fee (30 basis points)
    uint256 public constant FEE_DENOMINATOR = 10000;

    struct LimitOrder {
        address user;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 expiry;
        bool executed;
        bool cancelled;
    }

    mapping(uint256 => LimitOrder) public limitOrders;
    mapping(address => uint256[]) public userOrders;
    mapping(address => bool) public authorizedExecutors; // Off-chain service addresses
    uint256 public nextOrderId;

    event MarketSwap(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );

    event LimitOrderCreated(
        uint256 indexed orderId,
        address indexed user,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 expiry
    );

    event LimitOrderExecuted(
        uint256 indexed orderId,
        address indexed user,
        address indexed executor,
        uint256 amountOut
    );

    event LimitOrderCancelled(uint256 indexed orderId, address indexed user);

    modifier onlyAuthorizedExecutor() {
        require(authorizedExecutors[msg.sender], "Not authorized executor");
        _;
    }

    constructor(address _uniswapRouter) Ownable(msg.sender) {
        uniswapRouter = IUniswapV2Router(_uniswapRouter);
    }

    // Market Order Functions
    function marketSwapExactTokensForTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external nonReentrant whenNotPaused {
        require(amountIn > 0, "Amount must be greater than 0");
        require(deadline >= block.timestamp, "Deadline exceeded");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Calculate fee
        uint256 fee = (amountIn * feePercentage) / FEE_DENOMINATOR;
        uint256 swapAmount = amountIn - fee;

        // Approve router
        IERC20(tokenIn).approve(address(uniswapRouter), swapAmount);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory amounts = uniswapRouter.swapExactTokensForTokens(
            swapAmount,
            minAmountOut,
            path,
            msg.sender,
            deadline
        );

        emit MarketSwap(
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            amounts[1],
            fee
        );
    }

    function marketSwapTokensForExactTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint256 maxAmountIn,
        uint256 deadline
    ) external nonReentrant whenNotPaused {
        require(amountOut > 0, "Amount must be greater than 0");
        require(deadline >= block.timestamp, "Deadline exceeded");

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        // Get required input amount
        uint256[] memory amounts = uniswapRouter.getAmountsIn(amountOut, path);
        uint256 requiredAmountIn = amounts[0];

        // Add fee
        uint256 totalAmountIn = (requiredAmountIn * FEE_DENOMINATOR) /
            (FEE_DENOMINATOR - feePercentage);
        require(totalAmountIn <= maxAmountIn, "Excessive input amount");

        IERC20(tokenIn).safeTransferFrom(
            msg.sender,
            address(this),
            totalAmountIn
        );

        uint256 fee = totalAmountIn - requiredAmountIn;

        // Approve router
        IERC20(tokenIn).approve(address(uniswapRouter), requiredAmountIn);

        uint256[] memory swapAmounts = uniswapRouter.swapTokensForExactTokens(
            amountOut,
            requiredAmountIn,
            path,
            msg.sender,
            deadline
        );

        emit MarketSwap(
            msg.sender,
            tokenIn,
            tokenOut,
            totalAmountIn,
            amountOut,
            fee
        );
    }

    // Limit Order Functions (for off-chain service to trigger)
    function createLimitOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 expiry
    ) external nonReentrant whenNotPaused returns (uint256 orderId) {
        require(amountIn > 0, "Amount must be greater than 0");
        require(expiry > block.timestamp, "Invalid expiry");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        orderId = nextOrderId++;

        limitOrders[orderId] = LimitOrder({
            user: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            expiry: expiry,
            executed: false,
            cancelled: false
        });

        userOrders[msg.sender].push(orderId);

        emit LimitOrderCreated(
            orderId,
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            expiry
        );
    }

    // This function will be called by your off-chain service when price conditions are met
    function executeLimitOrder(
        uint256 orderId
    ) external nonReentrant onlyAuthorizedExecutor {
        LimitOrder storage order = limitOrders[orderId];
        require(!order.executed && !order.cancelled, "Order not executable");
        require(order.expiry > block.timestamp, "Order expired");

        // Calculate fee
        uint256 fee = (order.amountIn * feePercentage) / FEE_DENOMINATOR;
        uint256 swapAmount = order.amountIn - fee;

        // Approve router
        IERC20(order.tokenIn).approve(address(uniswapRouter), swapAmount);

        address[] memory path = new address[](2);
        path[0] = order.tokenIn;
        path[1] = order.tokenOut;

        uint256[] memory amounts = uniswapRouter.swapExactTokensForTokens(
            swapAmount,
            order.minAmountOut,
            path,
            order.user,
            block.timestamp + 300 // 5 minute deadline
        );

        order.executed = true;

        emit LimitOrderExecuted(orderId, order.user, msg.sender, amounts[1]);
    }

    // Batch execution for efficiency
    function executeBatchLimitOrders(
        uint256[] calldata orderIds
    ) external nonReentrant onlyAuthorizedExecutor {
        for (uint256 i = 0; i < orderIds.length; i++) {
            uint256 orderId = orderIds[i];
            LimitOrder storage order = limitOrders[orderId];

            if (
                order.executed ||
                order.cancelled ||
                order.expiry <= block.timestamp
            ) {
                continue; // Skip invalid orders
            }

            // Calculate fee
            uint256 fee = (order.amountIn * feePercentage) / FEE_DENOMINATOR;
            uint256 swapAmount = order.amountIn - fee;

            // Approve router
            IERC20(order.tokenIn).approve(address(uniswapRouter), swapAmount);

            address[] memory path = new address[](2);
            path[0] = order.tokenIn;
            path[1] = order.tokenOut;

            try
                uniswapRouter.swapExactTokensForTokens(
                    swapAmount,
                    order.minAmountOut,
                    path,
                    order.user,
                    block.timestamp + 300
                )
            returns (uint256[] memory amounts) {
                order.executed = true;
                emit LimitOrderExecuted(
                    orderId,
                    order.user,
                    msg.sender,
                    amounts[1]
                );
            } catch {
                // If swap fails (e.g., slippage), continue to next order
                continue;
            }
        }
    }

    function cancelLimitOrder(uint256 orderId) external nonReentrant {
        LimitOrder storage order = limitOrders[orderId];
        require(order.user == msg.sender, "Not order owner");
        require(!order.executed && !order.cancelled, "Order not cancellable");

        // Return tokens to user
        IERC20(order.tokenIn).safeTransfer(order.user, order.amountIn);

        order.cancelled = true;

        emit LimitOrderCancelled(orderId, msg.sender);
    }

    // View Functions
    function getQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 fee) {
        fee = (amountIn * feePercentage) / FEE_DENOMINATOR;
        uint256 swapAmount = amountIn - fee;

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory amounts = uniswapRouter.getAmountsOut(
            swapAmount,
            path
        );
        amountOut = amounts[1];
    }

    function getUserOrders(
        address user
    ) external view returns (uint256[] memory) {
        return userOrders[user];
    }

    function getOrderDetails(
        uint256 orderId
    ) external view returns (LimitOrder memory) {
        return limitOrders[orderId];
    }

    function getActiveOrdersByUser(
        address user
    ) external view returns (uint256[] memory activeOrders) {
        uint256[] memory allOrders = userOrders[user];
        uint256 activeCount = 0;

        // Count active orders
        for (uint256 i = 0; i < allOrders.length; i++) {
            LimitOrder memory order = limitOrders[allOrders[i]];
            if (
                !order.executed &&
                !order.cancelled &&
                order.expiry > block.timestamp
            ) {
                activeCount++;
            }
        }

        // Build active orders array
        activeOrders = new uint256[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < allOrders.length; i++) {
            LimitOrder memory order = limitOrders[allOrders[i]];
            if (
                !order.executed &&
                !order.cancelled &&
                order.expiry > block.timestamp
            ) {
                activeOrders[index] = allOrders[i];
                index++;
            }
        }
    }

    // Admin Functions
    function addAuthorizedExecutor(address executor) external onlyOwner {
        authorizedExecutors[executor] = true;
    }

    function removeAuthorizedExecutor(address executor) external onlyOwner {
        authorizedExecutors[executor] = false;
    }

    function setFeePercentage(uint256 _feePercentage) external onlyOwner {
        require(_feePercentage <= 500, "Fee too high"); // Max 5%
        feePercentage = _feePercentage;
    }

    function withdrawFees(address token, address to) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        // Calculate approximate fees (this is imprecise but gives an estimate)
        IERC20(token).safeTransfer(to, balance);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Emergency function to recover stuck tokens or cancel expired orders
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    function cleanupExpiredOrder(uint256 orderId) external {
        LimitOrder storage order = limitOrders[orderId];
        require(order.expiry <= block.timestamp, "Order not expired");
        require(!order.executed && !order.cancelled, "Order already processed");

        // Return tokens to user
        IERC20(order.tokenIn).safeTransfer(order.user, order.amountIn);
        order.cancelled = true;

        emit LimitOrderCancelled(orderId, order.user);
    }
}
