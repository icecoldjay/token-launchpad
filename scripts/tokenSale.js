const { ethers } = require("ethers");
const dotenv = require("dotenv");
const tokenSaleManagerAbi = require("../constants/tokenSaleAbi");

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

const buyerPrivateKey = process.env.BUYER_PRIVATE_KEY;
if (!buyerPrivateKey) {
  console.error("ERROR: BUYER_PRIVATE_KEY is not defined in .env file");
  process.exit(1);
}

console.log("Connecting to provider at:", rpcUrl);
const provider = new ethers.JsonRpcProvider(rpcUrl);
const ownerWallet = new ethers.Wallet(privateKey, provider);
const buyerWallet = new ethers.Wallet(buyerPrivateKey, provider);

console.log("Owner wallet address:", ownerWallet.address);
console.log("Buyer wallet address:", buyerWallet.address);

const tokenSaleManagerAddress = "0x0E0C6677e4D5446adE7E3472ef15420C85Ef6ecf";
console.log("Using TokenSaleManager at:", tokenSaleManagerAddress);

if (!tokenSaleManagerAbi.abi) {
  console.error("ERROR: tokenSaleManagerAbi does not have the expected format");
  process.exit(1);
}

const tokenSaleManagerContract = new ethers.Contract(
  tokenSaleManagerAddress,
  tokenSaleManagerAbi.abi,
  ownerWallet
);

const tokenSaleManagerContractBuyer = new ethers.Contract(
  tokenSaleManagerAddress,
  tokenSaleManagerAbi.abi,
  buyerWallet
);

// Example token addresses (replace with actual tokens)
const SALE_TOKEN = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"; // Token being sold
const PAYMENT_TOKEN = "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357"; // Token used for payment (use address(0) for ETH)

// Standard ERC20 ABI (just the functions we need)
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external returns (bool)",
];

// Helper function to approve token spending
async function approveToken(tokenAddress, spenderAddress, amount, wallet) {
  console.log(
    `Approving ${ethers.formatEther(amount)} tokens for ${spenderAddress}...`
  );

  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  try {
    // Check current allowance
    const currentAllowance = await tokenContract.allowance(
      wallet.address,
      spenderAddress
    );
    console.log(`Current allowance: ${ethers.formatEther(currentAllowance)}`);

    // Only approve if we need more allowance
    if (currentAllowance < amount) {
      console.log("Sending approval transaction...");
      const approveTx = await tokenContract.approve(spenderAddress, amount);
      console.log("Approval transaction sent:", approveTx.hash);

      const approvalReceipt = await approveTx.wait();
      console.log("Approval confirmed in block:", approvalReceipt.blockNumber);

      // Verify approval
      const newAllowance = await tokenContract.allowance(
        wallet.address,
        spenderAddress
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
  if (tokenAddress === ethers.ZeroAddress) {
    // Check ETH balance
    const balance = await provider.getBalance(userAddress);
    console.log(`ETH balance: ${ethers.formatEther(balance)}`);
    return balance;
  } else {
    // Check token balance
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      provider
    );
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
}

// Helper function to mint tokens (if using a test token)
async function mintTokens(tokenAddress, to, amount) {
  console.log(`Minting ${ethers.formatEther(amount)} tokens to ${to}...`);

  const tokenContract = new ethers.Contract(
    tokenAddress,
    ERC20_ABI,
    ownerWallet
  );

  try {
    const mintTx = await tokenContract.mint(to, amount);
    console.log("Mint transaction sent:", mintTx.hash);

    const mintReceipt = await mintTx.wait();
    console.log("Mint confirmed in block:", mintReceipt.blockNumber);

    return true;
  } catch (error) {
    console.error("ERROR minting tokens:", error.message);
    return false;
  }
}

// Create a new token sale
async function createTokenSale() {
  console.log("Creating new token sale...");

  const saleParams = {
    token: SALE_TOKEN,
    paymentToken: ethers.ZeroAddress, // Use ETH (set to token address for ERC20 payment)
    rate: ethers.parseEther("1000"), // 1000 tokens per 1 ETH
    hardCap: ethers.parseEther("10000"), // 10,000 tokens max
    softCap: ethers.parseEther("1000"), // 1,000 tokens min
    minContribution: ethers.parseEther("0.01"), // 0.01 ETH minimum
    maxContribution: ethers.parseEther("1"), // 1 ETH maximum per user
    startTime: Math.floor(Date.now() / 1000) + 300, // Start in 5 minutes
    endTime: Math.floor(Date.now() / 1000) + 86400, // End in 24 hours
    whitelistEnabled: false,
    vestingEnabled: true,
    vestingDuration: 86400, // 24 hours vesting
    vestingStart: 0, // Set when sale is finalized
  };

  console.log("Sale parameters:", {
    token: saleParams.token,
    paymentToken:
      saleParams.paymentToken === ethers.ZeroAddress
        ? "ETH"
        : saleParams.paymentToken,
    rate: saleParams.rate.toString(),
    hardCap: ethers.formatEther(saleParams.hardCap),
    softCap: ethers.formatEther(saleParams.softCap),
    minContribution: ethers.formatEther(saleParams.minContribution),
    maxContribution: ethers.formatEther(saleParams.maxContribution),
    startTime: new Date(saleParams.startTime * 1000).toISOString(),
    endTime: new Date(saleParams.endTime * 1000).toISOString(),
    whitelistEnabled: saleParams.whitelistEnabled,
    vestingEnabled: saleParams.vestingEnabled,
  });

  try {
    // First, approve the sale tokens to be transferred to the contract
    const approvalSuccess = await approveToken(
      saleParams.token,
      tokenSaleManagerAddress,
      saleParams.hardCap,
      ownerWallet
    );
    if (!approvalSuccess) {
      console.error("ERROR: Token approval failed");
      return;
    }

    // Get the sale fee
    const saleFee = await tokenSaleManagerContract.saleFee();
    console.log(`Sale fee: ${ethers.formatEther(saleFee)} ETH`);

    console.log("Sending create sale transaction...");
    const tx = await tokenSaleManagerContract.createSale(
      saleParams.token,
      saleParams.paymentToken,
      saleParams.rate,
      saleParams.hardCap,
      saleParams.softCap,
      saleParams.minContribution,
      saleParams.maxContribution,
      saleParams.startTime,
      saleParams.endTime,
      saleParams.whitelistEnabled,
      saleParams.vestingEnabled,
      saleParams.vestingDuration,
      saleParams.vestingStart,
      { value: saleFee }
    );

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Sale creation confirmed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSaleManagerContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "SaleCreated");

    if (events.length > 0) {
      const event = events[0];
      console.log("Sale created successfully:", {
        saleId: event.args.saleId.toString(),
        token: event.args.token,
        creator: event.args.creator,
        hardCap: ethers.formatEther(event.args.hardCap),
        startTime: new Date(Number(event.args.startTime) * 1000).toISOString(),
        endTime: new Date(Number(event.args.endTime) * 1000).toISOString(),
      });
      return Number(event.args.saleId);
    }
  } catch (error) {
    console.error("ERROR creating sale:", error.message);
  }
}

// Buy tokens with ETH
async function buyTokensWithETH(saleId, contributionAmount) {
  console.log(
    `Buying tokens for sale ${saleId} with ${ethers.formatEther(
      contributionAmount
    )} ETH...`
  );

  try {
    // Get sale info first
    const saleInfo = await tokenSaleManagerContract.getSaleInfo(saleId);
    console.log("Sale info:", {
      token: saleInfo.token,
      paymentToken: saleInfo.paymentToken,
      rate: saleInfo.rate.toString(),
      startTime: new Date(Number(saleInfo.startTime) * 1000).toISOString(),
      endTime: new Date(Number(saleInfo.endTime) * 1000).toISOString(),
      isActive: saleInfo.isActive,
      tokensSold: ethers.formatEther(saleInfo.tokensSold),
      amountRaised: ethers.formatEther(saleInfo.amountRaised),
    });

    if (saleInfo.paymentToken !== ethers.ZeroAddress) {
      console.error("ERROR: This sale doesn't accept ETH");
      return;
    }

    // Check if sale has started
    if (block.timestamp < saleInfo.startTime) {
      console.error("ERROR: Sale hasn't started yet");
      return;
    }

    console.log("Sending buy transaction...");
    const tx = await tokenSaleManagerContractBuyer.buyWithETH(saleId, {
      value: contributionAmount,
    });

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Token purchase confirmed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSaleManagerContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "TokensPurchased");

    if (events.length > 0) {
      const event = events[0];
      console.log("Tokens purchased successfully:", {
        saleId: event.args.saleId.toString(),
        buyer: event.args.buyer,
        contribution: ethers.formatEther(event.args.contribution),
        tokensReceived: ethers.formatEther(event.args.tokensReceived),
      });
    }
  } catch (error) {
    console.error("ERROR buying tokens:", error.message);
  }
}

// Buy tokens with ERC20 token
async function buyTokensWithToken(saleId, tokenAmount) {
  console.log(
    `Buying tokens for sale ${saleId} with ${ethers.formatEther(
      tokenAmount
    )} tokens...`
  );

  try {
    // Get sale info first
    const saleInfo = await tokenSaleManagerContract.getSaleInfo(saleId);

    if (saleInfo.paymentToken === ethers.ZeroAddress) {
      console.error("ERROR: This sale doesn't accept tokens");
      return;
    }

    // Approve payment tokens
    const approvalSuccess = await approveToken(
      saleInfo.paymentToken,
      tokenSaleManagerAddress,
      tokenAmount,
      buyerWallet
    );
    if (!approvalSuccess) {
      console.error("ERROR: Token approval failed");
      return;
    }

    console.log("Sending buy transaction...");
    const tx = await tokenSaleManagerContractBuyer.buyWithToken(
      saleId,
      tokenAmount
    );

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Token purchase confirmed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSaleManagerContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "TokensPurchased");

    if (events.length > 0) {
      const event = events[0];
      console.log("Tokens purchased successfully:", {
        saleId: event.args.saleId.toString(),
        buyer: event.args.buyer,
        contribution: ethers.formatEther(event.args.contribution),
        tokensReceived: ethers.formatEther(event.args.tokensReceived),
      });
    }
  } catch (error) {
    console.error("ERROR buying tokens:", error.message);
  }
}

// Update whitelist
async function updateWhitelist(saleId, users, status) {
  console.log(`Updating whitelist for sale ${saleId}...`);

  try {
    console.log("Sending whitelist update transaction...");
    const tx = await tokenSaleManagerContract.updateWhitelist(
      saleId,
      users,
      status
    );

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Whitelist update confirmed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSaleManagerContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "WhitelistUpdated");

    console.log(`Whitelist updated for ${events.length} users`);
    events.forEach((event) => {
      console.log(`- ${event.args.user}: ${event.args.status}`);
    });
  } catch (error) {
    console.error("ERROR updating whitelist:", error.message);
  }
}

// Finalize sale
async function finalizeSale(saleId) {
  console.log(`Finalizing sale ${saleId}...`);

  try {
    // Get sale info first
    const saleInfo = await tokenSaleManagerContract.getSaleInfo(saleId);
    console.log("Sale info before finalization:", {
      tokensSold: ethers.formatEther(saleInfo.tokensSold),
      amountRaised: ethers.formatEther(saleInfo.amountRaised),
      softCap: ethers.formatEther(saleInfo.softCap),
      isActive: saleInfo.isActive,
      isFinalized: saleInfo.isFinalized,
      isCancelled: saleInfo.isCancelled,
    });

    console.log("Sending finalize transaction...");
    const tx = await tokenSaleManagerContract.finalizeSale(saleId);

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Sale finalization confirmed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSaleManagerContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter(
        (parsed) =>
          parsed &&
          (parsed.name === "SaleFinalized" || parsed.name === "SaleCancelled")
      );

    if (events.length > 0) {
      const event = events[0];
      if (event.name === "SaleFinalized") {
        console.log("Sale finalized successfully:", {
          saleId: event.args.saleId.toString(),
          tokensSold: ethers.formatEther(event.args.tokensSold),
          amountRaised: ethers.formatEther(event.args.amountRaised),
        });
      } else if (event.name === "SaleCancelled") {
        console.log("Sale was cancelled (soft cap not met):", {
          saleId: event.args.saleId.toString(),
        });
      }
    }
  } catch (error) {
    console.error("ERROR finalizing sale:", error.message);
  }
}

// Claim tokens (for vesting)
async function claimTokens(saleId) {
  console.log(`Claiming tokens for sale ${saleId}...`);

  try {
    // Check claimable tokens first
    const claimableTokens = await tokenSaleManagerContract.getClaimableTokens(
      saleId,
      buyerWallet.address
    );
    console.log(`Claimable tokens: ${ethers.formatEther(claimableTokens)}`);

    if (claimableTokens === 0n) {
      console.log("No tokens available to claim at this time");
      return;
    }

    console.log("Sending claim transaction...");
    const tx = await tokenSaleManagerContractBuyer.claimTokens(saleId);

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Token claim confirmed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSaleManagerContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "TokensClaimed");

    if (events.length > 0) {
      const event = events[0];
      console.log("Tokens claimed successfully:", {
        saleId: event.args.saleId.toString(),
        user: event.args.user,
        amount: ethers.formatEther(event.args.amount),
      });
    }
  } catch (error) {
    console.error("ERROR claiming tokens:", error.message);
  }
}

// Claim refund (if sale failed)
async function claimRefund(saleId) {
  console.log(`Claiming refund for sale ${saleId}...`);

  try {
    // Get participation info
    const participation = await tokenSaleManagerContract.getParticipation(
      saleId,
      buyerWallet.address
    );
    console.log("Participation info:", {
      contribution: ethers.formatEther(participation.contribution),
      tokensOwed: ethers.formatEther(participation.tokensOwed),
      tokensClaimed: ethers.formatEther(participation.tokensClaimed),
      refunded: participation.refunded,
    });

    if (participation.refunded) {
      console.log("Already refunded");
      return;
    }

    console.log("Sending refund claim transaction...");
    const tx = await tokenSaleManagerContractBuyer.claimRefund(saleId);

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Refund claim confirmed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSaleManagerContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "ContributionRefunded");

    if (events.length > 0) {
      const event = events[0];
      console.log("Refund claimed successfully:", {
        saleId: event.args.saleId.toString(),
        user: event.args.user,
        amount: ethers.formatEther(event.args.amount),
      });
    }
  } catch (error) {
    console.error("ERROR claiming refund:", error.message);
  }
}

// Cancel sale (owner only)
async function cancelSale(saleId) {
  console.log(`Cancelling sale ${saleId}...`);

  try {
    console.log("Sending cancel transaction...");
    const tx = await tokenSaleManagerContract.cancelSale(saleId);

    console.log("Transaction sent! Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Sale cancellation confirmed in block:", receipt.blockNumber);

    // Parse events
    const events = receipt.logs
      .map((log) => {
        try {
          return tokenSaleManagerContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "SaleCancelled");

    if (events.length > 0) {
      const event = events[0];
      console.log("Sale cancelled successfully:", {
        saleId: event.args.saleId.toString(),
      });
    }
  } catch (error) {
    console.error("ERROR cancelling sale:", error.message);
  }
}

// Get sale information
async function getSaleInfo(saleId) {
  console.log(`Getting sale info for sale ${saleId}...`);

  try {
    const saleInfo = await tokenSaleManagerContract.getSaleInfo(saleId);

    console.log("Sale Information:", {
      token: saleInfo.token,
      paymentToken:
        saleInfo.paymentToken === ethers.ZeroAddress
          ? "ETH"
          : saleInfo.paymentToken,
      rate: saleInfo.rate.toString(),
      hardCap: ethers.formatEther(saleInfo.hardCap),
      softCap: ethers.formatEther(saleInfo.softCap),
      minContribution: ethers.formatEther(saleInfo.minContribution),
      maxContribution: ethers.formatEther(saleInfo.maxContribution),
      startTime: new Date(Number(saleInfo.startTime) * 1000).toISOString(),
      endTime: new Date(Number(saleInfo.endTime) * 1000).toISOString(),
      whitelistEnabled: saleInfo.whitelistEnabled,
      vestingEnabled: saleInfo.vestingEnabled,
      vestingDuration: saleInfo.vestingDuration.toString() + " seconds",
      vestingStart: saleInfo.vestingStart.toString(),
      isActive: saleInfo.isActive,
      isCancelled: saleInfo.isCancelled,
      isFinalized: saleInfo.isFinalized,
      tokensSold: ethers.formatEther(saleInfo.tokensSold),
      amountRaised: ethers.formatEther(saleInfo.amountRaised),
    });

    return saleInfo;
  } catch (error) {
    console.error("ERROR getting sale info:", error.message);
    return null;
  }
}

// Get participation information
async function getParticipationInfo(saleId, userAddress) {
  console.log(
    `Getting participation info for sale ${saleId}, user ${userAddress}...`
  );

  try {
    const participation = await tokenSaleManagerContract.getParticipation(
      saleId,
      userAddress
    );

    console.log("Participation Information:", {
      contribution: ethers.formatEther(participation.contribution),
      tokensOwed: ethers.formatEther(participation.tokensOwed),
      tokensClaimed: ethers.formatEther(participation.tokensClaimed),
      refunded: participation.refunded,
    });

    return participation;
  } catch (error) {
    console.error("ERROR getting participation info:", error.message);
    return null;
  }
}

// Helper function to check and display balances
async function checkAllBalances() {
  console.log("\n=== Token Balances ===");
  console.log("Owner balances:");
  await checkBalance(SALE_TOKEN, ownerWallet.address);
  await checkBalance(PAYMENT_TOKEN, ownerWallet.address);
  await checkBalance(ethers.ZeroAddress, ownerWallet.address);

  console.log("\nBuyer balances:");
  await checkBalance(SALE_TOKEN, buyerWallet.address);
  await checkBalance(PAYMENT_TOKEN, buyerWallet.address);
  await checkBalance(ethers.ZeroAddress, buyerWallet.address);
  console.log("=====================\n");
}

// Main execution
(async () => {
  try {
    console.log("Starting TokenSaleManager interaction...");

    // Check balances first
    await checkAllBalances();

    // Get sale count
    const saleCount = await tokenSaleManagerContract.getSaleCount();
    console.log(`Total sales created: ${saleCount}`);

    // Uncomment the functions you want to test:

    // Create a new sale
    const saleId = await createTokenSale();
    if (saleId !== undefined) {
      console.log(`Created sale with ID: ${saleId}`);

      // Wait for sale to start (if needed)
      // console.log("Waiting for sale to start...");
      // await new Promise(resolve => setTimeout(resolve, 300000)); // Wait 5 minutes

      // Add users to whitelist (if whitelist is enabled)
      // await updateWhitelist(saleId, [buyerWallet.address], true);

      // Buy tokens
      // await buyTokensWithETH(saleId, ethers.parseEther("0.1"));

      // Get sale info
      // await getSaleInfo(saleId);

      // Get participation info
      // await getParticipationInfo(saleId, buyerWallet.address);

      // Finalize sale (after it ends or reaches hard cap)
      // await finalizeSale(saleId);

      // Claim tokens (if vesting is enabled)
      // await claimTokens(saleId);

      // Cancel sale (owner only)
      // await cancelSale(saleId);

      // Claim refund (if sale failed)
      // await claimRefund(saleId);
    }

    // View existing sales
    // await getSaleInfo(0); // Get info for sale ID 0
    // await getParticipationInfo(0, buyerWallet.address); // Get participation for sale ID 0

    console.log("Script completed successfully!");
  } catch (error) {
    console.error("FATAL ERROR in main execution:", error);
  }
})();
