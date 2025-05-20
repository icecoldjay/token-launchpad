const { ethers } = require("ethers");
const crypto = require("crypto");
const dotenv = require("dotenv");
const launchManagerAbi = require("../constants/launchManagerAbi");
const tokenAbi = require("../constants/tokenTemplateAbi");
const {
  initialHolder1,
  initialHolder2,
  initialHolder3,
} = require("../helper-hardhat-config");
dotenv.config();

console.log("LaunchManager Test Script - initializing...");

// Function to generate random salt
function generateRandomSalt(prefix = "") {
  // Create random bytes
  const randomBytes = crypto.randomBytes(16);
  // Convert to hex string
  const randomHex = randomBytes.toString("hex");
  // Create unique identifier with timestamp
  const timestamp = Date.now().toString();
  // Combine prefix, timestamp and random hex
  const saltString = `${prefix}-${timestamp}-${randomHex}`;
  // Return keccak256 hash of the string
  return ethers.keccak256(ethers.toUtf8Bytes(saltString));
}

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

const launchManagerAddress = "0x0A4688365aC0Fb39A6d7478db4f6c82778ee8138";
console.log("Using launch manager at:", launchManagerAddress);

if (!launchManagerAbi.abi) {
  console.error("ERROR: launchManagerAbi does not have the expected format");
  process.exit(1);
}

const launchManager = new ethers.Contract(
  launchManagerAddress,
  launchManagerAbi.abi,
  wallet
);

// Get factory creation fee (we need to add this to our transactions)
async function getFactoryCreationFee() {
  // First, get the token factory address from launch manager
  const tokenFactoryAddress = await launchManager.tokenFactory();
  console.log("Token factory address:", tokenFactoryAddress);

  // Create contract instance for token factory (using minimal ABI for getting fee)
  const tokenFactoryAbi = ["function creationFee() view returns (uint256)"];
  const tokenFactory = new ethers.Contract(
    tokenFactoryAddress,
    tokenFactoryAbi,
    provider
  );

  // Get the creation fee
  const factoryFee = await tokenFactory.creationFee();
  console.log(
    "Token factory creation fee:",
    ethers.formatEther(factoryFee),
    "ETH"
  );
  return factoryFee;
}

// Test launching with ETH pair
async function testLaunchWithEth() {
  console.log("\n=== TESTING LAUNCH WITH ETH PAIR ===");
  console.log("Starting token launch with ETH liquidity process...");

  // Get both fees
  const launchFee = await launchManager.launchFee();
  console.log("Launch manager fee:", ethers.formatEther(launchFee), "ETH");
  const factoryFee = await getFactoryCreationFee();

  // Define token parameters according to the contract's TokenParams struct
  const tokenParams = {
    name: "EthLaunchedToken",
    symbol: "ELT",
    decimals: 18,
    totalSupply: ethers.parseEther("1000000"), // 1M tokens
    initialHolders: [
      wallet.address, // Creator
      initialHolder1, // Holder1
      initialHolder2, // Holder2
      initialHolder3, // Holder3
    ],
    initialAmounts: [
      ethers.parseEther("100000"), // 100K to creator
      ethers.parseEther("100000"), // 100K to holder1
      ethers.parseEther("150000"), // 150K to holder2
      ethers.parseEther("150000"), // 150K to holder3
    ],
    enableAntiBot: true,
  };

  // Define ETH pair parameters according to the contract's EthPairParams struct
  const ethParams = {
    tokenAmount: ethers.parseEther("100000"), // 400K tokens for liquidity
    ethAmount: ethers.parseEther("0.0001"), // 5 ETH for liquidity
    tokenAmountMin: ethers.parseEther("96000"), // 1% slippage
    ethAmountMin: ethers.parseEther("0.000045"), // 1% slippage
    lockDuration: 60 * 60 * 24 * 90, // 90 days
  };

  const salt = generateRandomSalt("eth-launch");
  console.log("Using salt:", salt);

  // Calculate total ETH needed (launch fee + factory fee + ETH for liquidity)
  const totalValue =
    launchFee +
    factoryFee +
    ethParams.ethAmount +
    ethers.parseEther("0.000005");
  console.log("Total ETH required:", ethers.formatEther(totalValue), "ETH");

  try {
    // First commit the launch with ETH
    console.log("Committing launch with ETH...");

    // Fixed: Use proper array encoding for structs
    const commitHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        [
          "tuple(string,string,uint8,uint256,address[],uint256[],bool)",
          "tuple(uint256,uint256,uint256,uint256,uint256)",
          "bytes32",
        ],
        [
          [
            tokenParams.name,
            tokenParams.symbol,
            tokenParams.decimals,
            tokenParams.totalSupply,
            tokenParams.initialHolders,
            tokenParams.initialAmounts,
            tokenParams.enableAntiBot,
          ],
          [
            ethParams.tokenAmount,
            ethParams.ethAmount,
            ethParams.tokenAmountMin,
            ethParams.ethAmountMin,
            ethParams.lockDuration,
          ],
          salt,
        ]
      )
    );

    // const commitTx = await launchManager.commitLaunchWithEth(commitHash);
    // console.log("Commit transaction sent! Hash:", commitTx.hash);
    // await commitTx.wait();
    // console.log("Launch committed!");

    // Then execute the launch with ETH including all fees
    console.log("Executing launch with ETH liquidity...");
    const tx = await launchManager.instantLaunchWithEth(
      tokenParams,
      ethParams,
      {
        value: totalValue,
        gasLimit: 5000000,
      }
    );

    console.log("Transaction sent! Hash:", tx.hash);
    console.log("Waiting for transaction confirmation...");
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    console.log("Token launched with ETH liquidity!");

    // Find LaunchCompleted event
    const launchEvent = receipt.logs
      .map((log) => {
        try {
          return launchManager.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "LaunchCompleted")[0];

    if (launchEvent) {
      console.log(`Token deployed at: ${launchEvent.args.tokenAddress}`);
      console.log(`Liquidity token ID: ${launchEvent.args.liquidityTokenId}`);
      return launchEvent.args.tokenAddress;
    } else {
      console.warn("Couldn't find LaunchCompleted event in logs");
      return null;
    }
  } catch (error) {
    console.error("\n=== ERROR DECODING ===");
    console.error("ERROR during ETH token launch:", error.message);

    // First, let's properly extract the error data
    let errorData;
    if (error.data) {
      errorData = error.data;
    } else if (error.error && error.error.data) {
      errorData = error.error.data;
    } else if (error.reason) {
      // If it's a simple revert message
      console.error("Revert reason:", error.reason);
      errorData = null;
    } else {
      console.error("No error data available in the error object");
      errorData = null;
    }

    if (errorData) {
      // Load all contract ABIs and create interfaces
      const tokenFactoryAbi = require("../constants/tokenFactoryAbi");
      const tokenTemplateAbi = require("../constants/tokenTemplateAbi");
      const liquidityManagerAbi = require("../constants/liquidityManagerAbi");

      // Create interfaces for all contracts
      const contracts = [
        {
          name: "LaunchManager",
          interface: launchManager.interface,
        },
        {
          name: "TokenFactory",
          interface: new ethers.Interface(tokenFactoryAbi.abi),
        },
        {
          name: "TokenTemplate",
          interface: new ethers.Interface(tokenTemplateAbi.abi),
        },
        {
          name: "LiquidityManager",
          interface: new ethers.Interface(liquidityManagerAbi.abi),
        },
      ];

      // Try to decode with each interface
      let decoded = null;
      for (const contract of contracts) {
        try {
          decoded = contract.interface.parseError(errorData);
          if (decoded) {
            console.error(`✅ Decoded ${contract.name} error:`);
            console.error(`   Error Name: ${decoded.name}`);
            console.error(`   Signature: ${decoded.signature}`);
            console.error(`   Args:`, decoded.args);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!decoded) {
        console.error("❌ Could not decode error with any known interface");
        console.error("Raw error data:", errorData);

        // Only try to analyze if we have a string that looks like hex data
        if (typeof errorData === "string" && errorData.startsWith("0x")) {
          // Extract selector (first 4 bytes) and parameters
          const selector = errorData.slice(0, 10); // 0x + 4 bytes
          const errorParams = errorData.slice(10);

          console.error("\n🔍 Error Analysis:");
          console.error("Selector:", selector);
          console.error("Parameters:", errorParams);

          // Known custom error selectors (add more as needed)
          const knownSelectors = {
            // LaunchManager
            "0xfb8f41b2": {
              contract: "TokenTemplate",
              description:
                "Possible initialization error (check totalSupply vs distribution amounts)",
            },
            "0x5c975abb": {
              contract: "LaunchManager",
              description: "Pausable: operation paused",
            },
            "0xf851a440": {
              contract: "LiquidityManager",
              description: "Insufficient liquidity amount",
            },
            "0x08c379a0": {
              contract: "Any",
              description: "Standard Error(string) revert",
            },
          };

          if (knownSelectors[selector]) {
            const info = knownSelectors[selector];
            console.error(
              `\n⚠️  Likely ${info.contract} Error: ${info.description}`
            );

            // Special handling for common errors
            if (selector === "0x08c379a0") {
              // Standard Error(string) - try to decode
              try {
                const reason = ethers.AbiCoder.defaultAbiCoder().decode(
                  ["string"],
                  "0x" + errorData.slice(10)
                );
                console.error("   Revert reason:", reason[0]);
              } catch (e) {
                console.error("   Could not decode revert reason");
              }
            }
          } else {
            console.error("Unknown error selector - not in our known list");
          }
        }
      }
    }

    // Additional diagnostic info
    if (error.info && error.info.error) {
      console.error("\nAdditional error info:", error.info.error);
    }
    if (error.transaction) {
      console.error("Transaction:", error.transaction);
    }

    console.error("\n💡 Suggested next steps:");
    console.error("- Check token distribution amounts vs totalSupply");
    console.error("- Verify sufficient ETH was sent (including fees)");
    console.error("- Review contract approvals in TokenTemplate");
    console.error(
      "- Increase liquidity amounts (current ETH amount may be too small)"
    );

    return null;
  }
}

// Test launching with custom token pair
async function testLaunchWithToken(pairTokenAddress) {
  console.log("\n=== TESTING LAUNCH WITH TOKEN PAIR ===");
  console.log(
    "Starting token launch with custom token pair liquidity process..."
  );

  // Get both fees
  const launchFee = await launchManager.launchFee();
  console.log("Launch manager fee:", ethers.formatEther(launchFee), "ETH");
  const factoryFee = await getFactoryCreationFee();

  // Define token parameters according to the contract's TokenParams struct
  const tokenParams = {
    name: "TokenLaunchedToken",
    symbol: "TLT",
    decimals: 18,
    totalSupply: ethers.parseEther("5000000"), // 5M tokens
    initialHolders: [
      wallet.address, // Creator
      initialHolder1, // Holder1
      initialHolder2, // Holder2
      initialHolder3, // Holder3
    ],
    initialAmounts: [
      ethers.parseEther("1000000"), // 1M to creator
      ethers.parseEther("500000"), // 500K to holder1
      ethers.parseEther("500000"), // 500K to holder2
      ethers.parseEther("500000"), // 500K to holder3
    ],
    enableAntiBot: true,
  };

  // Define token pair parameters according to the contract's TokenPairParams struct
  const tokenPairParams = {
    pairToken: pairTokenAddress, // Address of the token to pair with (e.g., USDC)
    tokenAmount: ethers.parseEther("200000"), // 200K tokens for liquidity
    pairAmount: ethers.parseUnits("1000", 18), // 1000 Tokens
    tokenAmountMin: ethers.parseEther("195000"),
    pairAmountMin: ethers.parseUnits("990", 18),
    lockDuration: 60 * 60 * 24 * 180, // 180 days
  };

  const salt = generateRandomSalt("token-launch");
  console.log("Using salt:", salt);

  // Calculate total ETH needed (launch fee + factory fee)
  const totalValue = launchFee + factoryFee;
  console.log("Total ETH required:", ethers.formatEther(totalValue), "ETH");

  try {
    // First approve the LaunchManager to spend our pair tokens
    console.log("Approving LaunchManager to spend pair tokens...");
    const pairToken = new ethers.Contract(
      pairTokenAddress,
      tokenAbi.abi,
      wallet
    );
    const approveTx = await pairToken.approve(
      launchManagerAddress,
      tokenPairParams.pairAmount
    );
    console.log("Approval transaction sent! Hash:", approveTx.hash);
    await approveTx.wait();
    console.log("Approval completed!");

    // Then commit the launch with token
    console.log("Committing launch with token pair...");

    // Fixed: Use proper array encoding for structs with named parameters
    const commitHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        [
          "tuple(string,string,uint8,uint256,address[],uint256[],bool)",
          "tuple(address,uint256,uint256,uint256,uint256,uint256)",
          "bytes32",
        ],
        [
          [
            tokenParams.name,
            tokenParams.symbol,
            tokenParams.decimals,
            tokenParams.totalSupply,
            tokenParams.initialHolders,
            tokenParams.initialAmounts,
            tokenParams.enableAntiBot,
          ],
          [
            tokenPairParams.pairToken,
            tokenPairParams.tokenAmount,
            tokenPairParams.pairAmount,
            tokenPairParams.tokenAmountMin,
            tokenPairParams.pairAmountMin,
            tokenPairParams.lockDuration,
          ],
          salt,
        ]
      )
    );

    const commitTx = await launchManager.commitLaunchWithToken(commitHash);
    console.log("Commit transaction sent! Hash:", commitTx.hash);
    await commitTx.wait();
    console.log("Launch committed!");

    // Then execute the launch with token pair and include both fees
    console.log("Executing launch with token pair liquidity...");
    const tx = await launchManager.instantLaunchWithToken(
      tokenParams,
      tokenPairParams,
      salt,
      {
        value: totalValue,
        gasLimit: 5000000,
      }
    );

    console.log("Transaction sent! Hash:", tx.hash);
    console.log("Waiting for transaction confirmation...");
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    console.log("Token launched with token pair liquidity!");

    // Find LaunchCompleted event
    const launchEvent = receipt.logs
      .map((log) => {
        try {
          return launchManager.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "LaunchCompleted")[0];

    if (launchEvent) {
      console.log(`Token deployed at: ${launchEvent.args.tokenAddress}`);
      console.log(`Liquidity token ID: ${launchEvent.args.liquidityTokenId}`);
      return launchEvent.args.tokenAddress;
    } else {
      console.warn("Couldn't find LaunchCompleted event in logs");
      return null;
    }
  } catch (error) {
    console.error("ERROR during token pair launch:", error.message);
    if (error.transaction) {
      console.error("Transaction hash:", error.transaction.hash);
    }
    if (error.receipt) {
      console.error("Transaction failed in block:", error.receipt.blockNumber);
    }
    return null;
  }
}

// Execute both test cases
(async () => {
  try {
    console.log("Starting test script execution...");

    // Get pair token address from env or use default USDC on Sepolia
    const pairTokenAddress = "0x32E8942025af67CbC4386601Be028d45cdBe6f61";
    console.log("Using pair token address:", pairTokenAddress);

    // First test: Launch with ETH
    await testLaunchWithEth();

    // Second test: Launch with token pair
    // await testLaunchWithToken(pairTokenAddress);

    console.log("\nAll tests completed!");
  } catch (error) {
    console.error("FATAL ERROR in script execution:", error);
  }
})();
