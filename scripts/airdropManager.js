const { ethers } = require("ethers");
const dotenv = require("dotenv");
const airdropManagerAbi = require("../constants/airdropManagerAbi");
const tokenAbi = require("../constants/tokenTemplateAbi");

dotenv.config();

// Initialize provider and signer
console.log("AirdropManager Script started - initializing...");

// Add validation for environment variables
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

// AirdropManager contract address (update with deployed address)
const airdropManagerAddress = "0xb56752a940A69750a10bE6920C8153dc6c12225f"; // Replace with actual deployed address
console.log("Using AirdropManager at:", airdropManagerAddress);

// Check if we have the correct ABI format
if (!airdropManagerAbi.abi) {
  console.error("ERROR: airdropManagerAbi does not have the expected format");
  console.log(
    "Actual format:",
    JSON.stringify(airdropManagerAbi).substring(0, 100) + "..."
  );
  process.exit(1);
}

const airdropManager = new ethers.Contract(
  airdropManagerAddress,
  airdropManagerAbi.abi,
  wallet
);

async function executeAirdrop() {
  console.log("Starting airdrop execution process...");

  // Token to airdrop (replace with actual token address)
  const tokenAddress = "0x232d3DD003823141F58dddb77eFd80E708A4e5F7";

  // Airdrop recipients and amounts
  const airdropParams = {
    token: tokenAddress,
    recipients: [
      "0xc822C365660fFAcaC53487c00a3c7f0793d6f891",
      "0x047fEEDa1Aa0C1d59177b04F369169a3A349f2e8",
      "0xe63A56cb6c753D05129d6F29980Df566A74E4d24",
      "0xaF9B1c61763aB8748FA35c67b80C5C370811Ebfc",
    ],
    amounts: [
      ethers.parseEther("100"), // 100 tokens
      ethers.parseEther("250"), // 250 tokens
      ethers.parseEther("500"), // 500 tokens
      ethers.parseEther("150"), // 150 tokens
    ],
  };

  console.log("Airdrop parameters:", {
    token: airdropParams.token,
    recipientCount: airdropParams.recipients.length,
    totalTokens: airdropParams.amounts
      .reduce((sum, amount) => sum + amount, 0n)
      .toString(),
  });

  try {
    // Get current airdrop fee
    const airdropFee = await airdropManager.airdropFee();
    console.log("Current airdrop fee:", ethers.formatEther(airdropFee), "ETH");

    // Check token allowance before executing airdrop
    await checkAndApproveTokens(tokenAddress, airdropParams.amounts);

    console.log("Sending transaction to execute airdrop...");
    const tx = await airdropManager.executeAirdrop(
      airdropParams.token,
      airdropParams.recipients,
      airdropParams.amounts,
      {
        value: airdropFee,
        gasLimit: 500000, // Set appropriate gas limit
      }
    );

    console.log("Transaction sent! Hash:", tx.hash);
    console.log("Waiting for transaction confirmation...");

    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Find AirdropExecuted event in receipt
    const executedEvent = receipt.logs
      .map((log) => {
        try {
          return airdropManager.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "AirdropExecuted")[0];

    if (executedEvent) {
      console.log(
        `SUCCESS: Airdrop executed for token: ${executedEvent.args.token}`
      );
      console.log(`Airdrop Index: ${executedEvent.args.airdropIndex}`);
      console.log(
        `Total Amount: ${ethers.formatEther(
          executedEvent.args.totalAmount
        )} tokens`
      );
      console.log(`Recipients: ${executedEvent.args.recipientCount}`);

      // Check if airdrop was completed
      await checkAirdropCompletion(
        tokenAddress,
        executedEvent.args.airdropIndex
      );
    } else {
      console.error(
        "ERROR: Airdrop executed but couldn't find AirdropExecuted event in logs"
      );
    }
  } catch (error) {
    console.error("ERROR executing airdrop:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
    if (error.transaction) {
      console.error("Transaction hash:", error.transaction.hash);
    }
  }
}

async function checkAndApproveTokens(tokenAddress, amounts) {
  console.log("Checking token allowance and approval...");

  const tokenContract = new ethers.Contract(tokenAddress, tokenAbi.abi, wallet);

  // Calculate total amount needed
  const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
  console.log(
    "Total tokens needed for airdrop:",
    ethers.formatEther(totalAmount)
  );

  try {
    // Check current allowance
    const currentAllowance = await tokenContract.allowance(
      wallet.address,
      airdropManagerAddress
    );
    console.log("Current allowance:", ethers.formatEther(currentAllowance));

    if (currentAllowance < totalAmount) {
      console.log("Insufficient allowance. Approving tokens...");

      // Approve tokens for airdrop
      const approveTx = await tokenContract.approve(
        airdropManagerAddress,
        totalAmount
      );
      console.log("Approval transaction hash:", approveTx.hash);

      const approveReceipt = await approveTx.wait();
      console.log(
        "Token approval confirmed in block:",
        approveReceipt.blockNumber
      );
    } else {
      console.log("Sufficient allowance already exists");
    }

    // Check token balance
    const balance = await tokenContract.balanceOf(wallet.address);
    console.log("Token balance:", ethers.formatEther(balance));

    if (balance < totalAmount) {
      throw new Error(
        `Insufficient token balance. Need: ${ethers.formatEther(
          totalAmount
        )}, Have: ${ethers.formatEther(balance)}`
      );
    }
  } catch (error) {
    console.error("ERROR checking/approving tokens:", error.message);
    throw error;
  }
}

async function checkAirdropCompletion(tokenAddress, airdropIndex) {
  console.log(
    `Checking airdrop completion for token ${tokenAddress}, index ${airdropIndex}...`
  );

  try {
    const airdropInfo = await airdropManager.getAirdropInfo(
      tokenAddress,
      airdropIndex
    );

    console.log("Airdrop Details:");
    console.log("- Token:", airdropInfo.token);
    console.log("- Total Amount:", ethers.formatEther(airdropInfo.totalAmount));
    console.log(
      "- Distributed Amount:",
      ethers.formatEther(airdropInfo.distributedAmount)
    );
    console.log("- Recipient Count:", airdropInfo.recipientCount.toString());
    console.log(
      "- Timestamp:",
      new Date(Number(airdropInfo.timestamp) * 1000).toISOString()
    );
    console.log("- Completed:", airdropInfo.completed);

    if (airdropInfo.completed) {
      console.log("✅ Airdrop completed successfully!");
    } else {
      console.log("⏳ Airdrop still in progress...");
    }
  } catch (error) {
    console.error("ERROR checking airdrop completion:", error.message);
  }
}

async function getAirdropHistory(tokenAddress) {
  console.log(`Fetching airdrop history for token: ${tokenAddress}`);

  try {
    const airdropCount = await airdropManager.getAirdropCount(tokenAddress);
    console.log(`Total airdrops for this token: ${airdropCount}`);

    if (airdropCount > 0) {
      console.log("\nAirdrop History:");
      console.log("================");

      for (let i = 0; i < airdropCount; i++) {
        const airdropInfo = await airdropManager.getAirdropInfo(
          tokenAddress,
          i
        );

        console.log(`\nAirdrop ${i}:`);
        console.log(
          `- Total Amount: ${ethers.formatEther(
            airdropInfo.totalAmount
          )} tokens`
        );
        console.log(
          `- Distributed: ${ethers.formatEther(
            airdropInfo.distributedAmount
          )} tokens`
        );
        console.log(`- Recipients: ${airdropInfo.recipientCount}`);
        console.log(
          `- Date: ${new Date(
            Number(airdropInfo.timestamp) * 1000
          ).toLocaleDateString()}`
        );
        console.log(
          `- Status: ${airdropInfo.completed ? "Completed" : "In Progress"}`
        );
      }
    } else {
      console.log("No airdrops found for this token");
    }
  } catch (error) {
    console.error("ERROR fetching airdrop history:", error.message);
  }
}

async function getContractInfo() {
  console.log("Fetching AirdropManager contract information...");

  try {
    const feeCollector = await airdropManager.feeCollector();
    const airdropFee = await airdropManager.airdropFee();
    const owner = await airdropManager.owner();

    console.log("\nContract Information:");
    console.log("====================");
    console.log("- Contract Address:", airdropManagerAddress);
    console.log("- Owner:", owner);
    console.log("- Fee Collector:", feeCollector);
    console.log("- Airdrop Fee:", ethers.formatEther(airdropFee), "ETH");
    console.log("- Connected Wallet:", wallet.address);
    console.log(
      "- Is Owner:",
      wallet.address.toLowerCase() === owner.toLowerCase()
    );
  } catch (error) {
    console.error("ERROR fetching contract info:", error.message);
  }
}

async function updateAirdropFee(newFeeInEth) {
  console.log(`Updating airdrop fee to ${newFeeInEth} ETH...`);

  try {
    const newFee = ethers.parseEther(newFeeInEth.toString());

    const tx = await airdropManager.updateAirdropFee(newFee);
    console.log("Update fee transaction hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Fee update confirmed in block:", receipt.blockNumber);

    console.log(`✅ Airdrop fee updated to ${newFeeInEth} ETH`);
  } catch (error) {
    console.error("ERROR updating airdrop fee:", error.message);
    if (error.message.includes("Ownable: caller is not the owner")) {
      console.error("Only the contract owner can update the fee");
    }
  }
}

async function updateFeeCollector(newCollectorAddress) {
  console.log(`Updating fee collector to: ${newCollectorAddress}`);

  try {
    const tx = await airdropManager.updateFeeCollector(newCollectorAddress);
    console.log("Update collector transaction hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Collector update confirmed in block:", receipt.blockNumber);

    console.log(`✅ Fee collector updated to: ${newCollectorAddress}`);
  } catch (error) {
    console.error("ERROR updating fee collector:", error.message);
    if (error.message.includes("Ownable: caller is not the owner")) {
      console.error("Only the contract owner can update the fee collector");
    }
  }
}

async function rescueTokens(tokenAddress, recipientAddress, amount) {
  console.log(`Rescuing ${ethers.formatEther(amount)} tokens from contract...`);

  try {
    const tx = await airdropManager.rescueTokens(
      tokenAddress,
      recipientAddress,
      amount
    );
    console.log("Rescue tokens transaction hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Token rescue confirmed in block:", receipt.blockNumber);

    console.log(`✅ Tokens rescued successfully`);
  } catch (error) {
    console.error("ERROR rescuing tokens:", error.message);
    if (error.message.includes("Ownable: caller is not the owner")) {
      console.error("Only the contract owner can rescue tokens");
    }
  }
}

// Command line argument handling
const command = process.argv[2];
const args = process.argv.slice(3);

// Main execution
(async () => {
  try {
    console.log("Starting AirdropManager script execution...");

    switch (command) {
      case "execute":
        await executeAirdrop();
        break;

      case "history":
        if (args.length === 0) {
          console.error(
            "Please provide token address: node airdropScript.js history <tokenAddress>"
          );
          process.exit(1);
        }
        await getAirdropHistory(args[0]);
        break;

      case "info":
        await getContractInfo();
        break;

      case "update-fee":
        if (args.length === 0) {
          console.error(
            "Please provide new fee in ETH: node airdropScript.js update-fee <feeInEth>"
          );
          process.exit(1);
        }
        await updateAirdropFee(parseFloat(args[0]));
        break;

      case "update-collector":
        if (args.length === 0) {
          console.error(
            "Please provide new collector address: node airdropScript.js update-collector <address>"
          );
          process.exit(1);
        }
        await updateFeeCollector(args[0]);
        break;

      case "rescue-tokens":
        if (args.length < 3) {
          console.error(
            "Usage: node airdropScript.js rescue-tokens <tokenAddress> <recipientAddress> <amountInEth>"
          );
          process.exit(1);
        }
        await rescueTokens(args[0], args[1], ethers.parseEther(args[2]));
        break;

      default:
        console.log("Available commands:");
        console.log("- execute: Execute an airdrop");
        console.log(
          "- history <tokenAddress>: Get airdrop history for a token"
        );
        console.log("- info: Get contract information");
        console.log("- update-fee <feeInEth>: Update airdrop fee (owner only)");
        console.log(
          "- update-collector <address>: Update fee collector (owner only)"
        );
        console.log(
          "- rescue-tokens <tokenAddress> <recipientAddress> <amountInEth>: Rescue tokens (owner only)"
        );
        console.log("");
        console.log("Example usage:");
        console.log("node airdropScript.js execute");
        console.log("node airdropScript.js history 0x1234...");
        console.log("node airdropScript.js info");
        break;
    }

    console.log("Script completed successfully!");
  } catch (error) {
    console.error("FATAL ERROR in main execution:", error);
  }
})();
