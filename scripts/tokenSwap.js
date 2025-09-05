const { ethers } = require("ethers");
const dotenv = require("dotenv");
const tokenSwapAbi = require("../constants/tokenSwapAbi");

dotenv.config();

// Initialize provider and signer
console.log("Script started - initializing...");

const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) {
  console.error("ERROR: SEPOLIA_RPC_URL is not defined in .env file");
  process.exit(1);
}

const privateKey = process.env.OWNER_PRIVATE_KEY;
if (!privateKey) {
  console.error("ERROR: OWNER_PRIVATE_KEY is not defined in .env file");
  process.exit(1);
}

console.log("Connecting to provider at:", rpcUrl);
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
console.log("Wallet address:", wallet.address);

const tokenSwapAddress = "0x31376bF5283038EF880D4967066Bc33D81F93B59";
console.log("Using TokenSwapContract at:", tokenSwapAddress);

if (!tokenSwapAbi.abi) {
  console.error("ERROR: tokenSwapAbi does not have the expected format");
  process.exit(1);
}

const tokenSwapContract = new ethers.Contract(
  tokenSwapAddress,
  tokenSwapAbi.abi,
  wallet
);

// Example token addresses (replace with actual tokens)
const TOKEN_A = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"; // WETH sepolia address
const TOKEN_B = "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357"; // DAI sepolia address
const TOKEN_C = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a"; // AAVE sepolia address

// Standard ERC20 ABI (just the functions we need)
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

// Helper function to approve token spending
async function approveToken(tokenAddress, amount) {
  console.log(
    `Approving ${ethers.formatEther(amount)} tokens for ${tokenAddress}...`
  );

  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  try {
    // Check current allowance
    const currentAllowance = await tokenContract.allowance(
      wallet.address,
      tokenSwapAddress
    );
    console.log(`Current allowance: ${ethers.formatEther(currentAllowance)}`);

    // Only approve if we need more allowance
    if (currentAllowance < amount) {
      console.log("Sending approval transaction...");
      const approveTx = await tokenContract.approve(tokenSwapAddress, amount);
      console.log("Approval transaction sent:", approveTx.hash);

      const approvalReceipt = await approveTx.wait();
      console.log("Approval confirmed in block:", approvalReceipt.blockNumber);

      // Verify approval
      const newAllowance = await tokenContract.allowance(
        wallet.address,
        tokenSwapAddress
      );
      console.log(`New allowance: ${ethers.formatEther(newAllowance)}`);

      return true;
    } else {
      console.log("Sufficient allowance already exists");
      return true;
    }
  } catch (error) {
    console.error("ERROR approving token:", error.message);
    return false;
  }
}

// Helper function to check token balance
async function checkBalance(tokenAddress, userAddress) {
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  try {
    const balance = await tokenContract.balanceOf(userAddress);
    const symbol = await tokenContract.symbol();
    console.log(`${symbol} balance: ${ethers.formatEther(balance)}`);
    return balance;
  } catch (error) {
    console.error("ERROR checking balance:", error.message);
    return 0n;
  }
}

async function performMarketSwapExact() {
  console.log("Starting exact tokens for tokens market swap...");

  const swapParams = {
    tokenIn: TOKEN_A,
    tokenOut: TOKEN_B,
    amountIn: ethers.parseEther("0.001"), // 0.001 tokens
    minAmountOut: ethers.parseEther("0.0008"), // Minimum 0.0008 tokens out
    deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes from now
  };

  console.log("Swap parameters:", {
    tokenIn: swapParams.tokenIn,
    tokenOut: swapParams.tokenOut,
    amountIn: swapParams.amountIn.toString(),
    minAmountOut: swapParams.minAmountOut.toString(),
  });

  try {
    // Check balance first
    const balance = await checkBalance(swapParams.tokenIn, wallet.address);
    if (balance < swapParams.amountIn) {
      console.error("ERROR: Insufficient token balance");
      return;
    }

    // Approve tokens before swap
    const approvalSuccess = await approveToken(
      swapParams.tokenIn,
      swapParams.amountIn
    );
    if (!approvalSuccess) {
      console.error("ERROR: Token approval failed");
      return;
    }

    // Get quote first
    console.log("Getting quote...");
    const [amountOut, fee] = await tokenSwapContract.getQuote(
      swapParams.tokenIn,
      swapParams.tokenOut,
      swapParams.amountIn
    );
    console.log("Quote - Amount out:", ethers.formatEther(amountOut));
    console.log("Quote - Fee:", ethers.formatEther(fee));

    console.log("Sending market swap transaction...");
    const tx = await tokenSwapContract.marketSwapExactTokensForTokens(
      swapParams.tokenIn,
      swapParams.tokenOut,
      swapParams.amountIn,
      swapParams.minAmountOut,
      swapParams.deadline
    );

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Market swap confirmed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSwapContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "MarketSwap");

    if (events.length > 0) {
      const event = events[0];
      console.log("Market swap successful:", {
        user: event.args.user,
        amountIn: ethers.formatEther(event.args.amountIn),
        amountOut: ethers.formatEther(event.args.amountOut),
        fee: ethers.formatEther(event.args.fee),
      });
    }
  } catch (error) {
    console.error("ERROR performing market swap:", error.message);
  }
}

async function performMarketSwapForExact() {
  console.log("Starting tokens for exact tokens market swap...");

  const swapParams = {
    tokenIn: TOKEN_A,
    tokenOut: TOKEN_B,
    amountOut: ethers.parseEther("0.001"), // Want exactly 0.001 tokens out
    maxAmountIn: ethers.parseEther("0.002"), // Maximum 0.002 tokens in
    deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes from now
  };

  console.log("Swap parameters:", {
    tokenIn: swapParams.tokenIn,
    tokenOut: swapParams.tokenOut,
    amountOut: swapParams.amountOut.toString(),
    maxAmountIn: swapParams.maxAmountIn.toString(),
  });

  try {
    // Check balance first
    const balance = await checkBalance(swapParams.tokenIn, wallet.address);
    if (balance < swapParams.maxAmountIn) {
      console.error("ERROR: Insufficient token balance");
      return;
    }

    // Approve maximum amount tokens before swap
    const approvalSuccess = await approveToken(
      swapParams.tokenIn,
      swapParams.maxAmountIn
    );
    if (!approvalSuccess) {
      console.error("ERROR: Token approval failed");
      return;
    }

    console.log("Sending market swap for exact tokens transaction...");
    const tx = await tokenSwapContract.marketSwapTokensForExactTokens(
      swapParams.tokenIn,
      swapParams.tokenOut,
      swapParams.amountOut,
      swapParams.maxAmountIn,
      swapParams.deadline
    );

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log(
      "Market swap for exact tokens confirmed in block:",
      receipt.blockNumber
    );

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSwapContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "MarketSwap");

    if (events.length > 0) {
      const event = events[0];
      console.log("Market swap for exact tokens successful:", {
        user: event.args.user,
        amountIn: ethers.formatEther(event.args.amountIn),
        amountOut: ethers.formatEther(event.args.amountOut),
        fee: ethers.formatEther(event.args.fee),
      });
    }
  } catch (error) {
    console.error(
      "ERROR performing market swap for exact tokens:",
      error.message
    );
  }
}

async function createLimitOrder() {
  console.log("Creating limit order...");

  const orderParams = {
    tokenIn: TOKEN_A,
    tokenOut: TOKEN_B,
    amountIn: ethers.parseEther("0.001"), // 0.001 tokens
    minAmountOut: ethers.parseEther("0.0012"), // Want at least 0.0012 tokens out
    expiry: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
  };

  console.log("Order parameters:", {
    tokenIn: orderParams.tokenIn,
    tokenOut: orderParams.tokenOut,
    amountIn: orderParams.amountIn.toString(),
    minAmountOut: orderParams.minAmountOut.toString(),
  });

  try {
    // Check balance first
    const balance = await checkBalance(orderParams.tokenIn, wallet.address);
    if (balance < orderParams.amountIn) {
      console.error("ERROR: Insufficient token balance");
      return;
    }

    // Approve tokens before creating limit order
    const approvalSuccess = await approveToken(
      orderParams.tokenIn,
      orderParams.amountIn
    );
    if (!approvalSuccess) {
      console.error("ERROR: Token approval failed");
      return;
    }

    console.log("Sending limit order transaction...");
    const tx = await tokenSwapContract.createLimitOrder(
      orderParams.tokenIn,
      orderParams.tokenOut,
      orderParams.amountIn,
      orderParams.minAmountOut,
      orderParams.expiry
    );

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Limit order created in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSwapContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "LimitOrderCreated");

    if (events.length > 0) {
      const event = events[0];
      console.log("Limit order created successfully:", {
        orderId: event.args.orderId.toString(),
        user: event.args.user,
        amountIn: ethers.formatEther(event.args.amountIn),
        minAmountOut: ethers.formatEther(event.args.minAmountOut),
      });
      return event.args.orderId;
    }
  } catch (error) {
    console.error("ERROR creating limit order:", error.message);
  }
}

async function getMyOrders() {
  try {
    console.log("Fetching orders for address:", wallet.address);
    const myOrders = await tokenSwapContract.getUserOrders(wallet.address);
    console.log(
      "My order IDs:",
      myOrders.map((id) => id.toString())
    );

    // Get active orders
    const activeOrders = await tokenSwapContract.getActiveOrdersByUser(
      wallet.address
    );
    console.log(
      "Active order IDs:",
      activeOrders.map((id) => id.toString())
    );

    // Get details for each active order
    for (const orderId of activeOrders) {
      const orderDetails = await tokenSwapContract.getOrderDetails(orderId);
      console.log(`Order ${orderId}:`, {
        tokenIn: orderDetails.tokenIn,
        tokenOut: orderDetails.tokenOut,
        amountIn: ethers.formatEther(orderDetails.amountIn),
        minAmountOut: ethers.formatEther(orderDetails.minAmountOut),
        expiry: new Date(Number(orderDetails.expiry) * 1000).toISOString(),
        executed: orderDetails.executed,
        cancelled: orderDetails.cancelled,
      });
    }
  } catch (error) {
    console.error("ERROR fetching orders:", error.message);
  }
}

async function executeLimitOrder(orderId) {
  console.log("Executing limit order:", orderId);

  try {
    // Check if caller is authorized executor
    const isAuthorized = await tokenSwapContract.authorizedExecutors(
      wallet.address
    );
    if (!isAuthorized) {
      console.error("ERROR: Wallet is not an authorized executor");
      return;
    }

    // Get order details first
    const orderDetails = await tokenSwapContract.getOrderDetails(orderId);
    console.log("Order details:", {
      user: orderDetails.user,
      tokenIn: orderDetails.tokenIn,
      tokenOut: orderDetails.tokenOut,
      amountIn: ethers.formatEther(orderDetails.amountIn),
      minAmountOut: ethers.formatEther(orderDetails.minAmountOut),
      executed: orderDetails.executed,
      cancelled: orderDetails.cancelled,
    });

    if (orderDetails.executed || orderDetails.cancelled) {
      console.error("ERROR: Order already executed or cancelled");
      return;
    }

    console.log("Sending execute limit order transaction...");
    const tx = await tokenSwapContract.executeLimitOrder(orderId);
    console.log("Transaction sent! Hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Limit order executed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSwapContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "LimitOrderExecuted");

    if (events.length > 0) {
      const event = events[0];
      console.log("Limit order executed successfully:", {
        orderId: event.args.orderId.toString(),
        user: event.args.user,
        executor: event.args.executor,
        amountOut: ethers.formatEther(event.args.amountOut),
      });
    }
  } catch (error) {
    console.error("ERROR executing limit order:", error.message);
  }
}

async function executeBatchLimitOrders(orderIds) {
  console.log("Executing batch limit orders:", orderIds);

  try {
    // Check if caller is authorized executor
    const isAuthorized = await tokenSwapContract.authorizedExecutors(
      wallet.address
    );
    if (!isAuthorized) {
      console.error("ERROR: Wallet is not an authorized executor");
      return;
    }

    console.log("Sending batch execute limit orders transaction...");
    const tx = await tokenSwapContract.executeBatchLimitOrders(orderIds);
    console.log("Transaction sent! Hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Batch limit orders executed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSwapContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "LimitOrderExecuted");

    console.log(`Successfully executed ${events.length} orders:`);
    events.forEach((event) => {
      console.log(
        `- Order ${event.args.orderId}: ${ethers.formatEther(
          event.args.amountOut
        )} tokens`
      );
    });
  } catch (error) {
    console.error("ERROR executing batch limit orders:", error.message);
  }
}

async function cancelLimitOrder(orderId) {
  console.log("Cancelling limit order:", orderId);

  try {
    // Get order details first
    const orderDetails = await tokenSwapContract.getOrderDetails(orderId);
    console.log("Order details:", {
      user: orderDetails.user,
      amountIn: ethers.formatEther(orderDetails.amountIn),
      executed: orderDetails.executed,
      cancelled: orderDetails.cancelled,
    });

    if (orderDetails.user.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error("ERROR: You are not the owner of this order");
      return;
    }

    if (orderDetails.executed || orderDetails.cancelled) {
      console.error("ERROR: Order already executed or cancelled");
      return;
    }

    console.log("Sending cancel limit order transaction...");
    const tx = await tokenSwapContract.cancelLimitOrder(orderId);
    console.log("Transaction sent! Hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Limit order cancelled in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSwapContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "LimitOrderCancelled");

    if (events.length > 0) {
      const event = events[0];
      console.log("Limit order cancelled successfully:", {
        orderId: event.args.orderId.toString(),
        user: event.args.user,
      });
    }
  } catch (error) {
    console.error("ERROR cancelling limit order:", error.message);
  }
}

async function getQuote(tokenIn, tokenOut, amountIn) {
  console.log("Getting swap quote...");
  console.log("Parameters:", {
    tokenIn,
    tokenOut,
    amountIn: ethers.formatEther(amountIn),
  });

  try {
    const [amountOut, fee] = await tokenSwapContract.getQuote(
      tokenIn,
      tokenOut,
      amountIn
    );

    const quote = {
      amountIn: ethers.formatEther(amountIn),
      amountOut: ethers.formatEther(amountOut),
      fee: ethers.formatEther(fee),
      feePercentage: ((fee * 10000n) / amountIn).toString() + " basis points",
      effectiveRate:
        ((amountOut * 10000n) / (amountIn - fee)).toString() + " per 10000",
    };

    console.log("Quote received:", quote);
    return quote;
  } catch (error) {
    console.error("ERROR getting quote:", error.message);
    return null;
  }
}

// Helper function to check and display balances
async function checkAllBalances() {
  console.log("\n=== Token Balances ===");
  await checkBalance(TOKEN_A, wallet.address);
  await checkBalance(TOKEN_B, wallet.address);
  await checkBalance(TOKEN_C, wallet.address);
  console.log("=====================\n");
}

// Main execution
(async () => {
  try {
    console.log("Starting TokenSwapContract interaction...");

    // Check balances first
    await checkAllBalances();

    // Uncomment the functions you want to test:

    // Market swaps
    await performMarketSwapExact();
    // await performMarketSwapForExact();

    // Limit orders
    await createLimitOrder();
    // await executeLimitOrder(1); // Replace with actual order ID
    // await executeBatchLimitOrders([1, 2, 3]); // Replace with actual order IDs
    // await cancelLimitOrder(1); // Replace with actual order ID

    // View functions
    // await getMyOrders();
    // await getQuote(TOKEN_A, TOKEN_B, ethers.parseEther("0.001"));

    console.log("Script completed successfully!");
  } catch (error) {
    console.error("FATAL ERROR in main execution:", error);
  }
})();
