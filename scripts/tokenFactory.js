const { ethers } = require("ethers");
const dotenv = require("dotenv");
const tokenFactoryAbi = require("../constants/tokenFactoryAbi");
const tokenTemplateAbi = require("../constants/tokenTemplateAbi");
const {
  initialHolder1,
  initialHolder2,
  initialHolder3,
  initialHolder4,
} = require("../helper-hardhat-config");

dotenv.config();

// Initialize provider and signer
console.log("Script started - initializing...");

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

const tokenFactoryAddress = "0x0CBc9B63D6A03d450E5d5aB87CC610e9cfa12D6B";
console.log("Using token factory at:", tokenFactoryAddress);

// Check if we have the correct ABI format
if (!tokenFactoryAbi.abi) {
  console.error("ERROR: tokenFactoryAbi does not have the expected format");
  console.log(
    "Actual format:",
    JSON.stringify(tokenFactoryAbi).substring(0, 100) + "..."
  );
  process.exit(1);
}

const tokenFactory = new ethers.Contract(
  tokenFactoryAddress,
  tokenFactoryAbi.abi,
  wallet
);

async function createNewToken() {
  console.log("Starting token creation process...");

  const tokenParams = {
    name: "MyNewToken",
    symbol: "MNT",
    decimals: 18,
    totalSupply: ethers.parseEther("1000000"), // 1M tokens
    initialHolders: [
      initialHolder1,
      initialHolder2,
      initialHolder3,
      initialHolder4,
    ],
    initialAmounts: [
      ethers.parseEther("100"),
      ethers.parseEther("200"),
      ethers.parseEther("500"),
      ethers.parseEther("1000"),
    ],
    enableAntiBot: true,
    maxTxAmount: ethers.parseEther("10000"), // 10K max tx
    maxWalletAmount: ethers.parseEther("50000"), // 50K max wallet
    liquidityManager: "0xebc9642aD5A355D3D4183243A870F71d4fA9564E",
    launchManager: "0x0A4688365aC0Fb39A6d7478db4f6c82778ee8138",
    launchWithLiquidity: false,
    initialTokenOwner: wallet.address,
  };

  console.log("Token parameters:", {
    name: tokenParams.name,
    symbol: tokenParams.symbol,
    initialHolders: tokenParams.initialHolders,
    totalSupply: tokenParams.totalSupply.toString(),
  });

  // Estimate creation fee
  const creationFee = ethers.parseEther("0.0001"); // Example 0.1 ETH
  console.log("Creation fee:", ethers.formatEther(creationFee), "ETH");

  try {
    console.log("Sending transaction to create token...");
    const tx = await tokenFactory.createToken(
      tokenParams.name,
      tokenParams.symbol,
      tokenParams.totalSupply,
      tokenParams.initialHolders,
      tokenParams.initialAmounts,
      tokenParams.liquidityManager,
      tokenParams.launchManager,
      tokenParams.launchWithLiquidity,
      tokenParams.initialTokenOwner,
      { value: creationFee }
    );

    console.log("Transaction sent! Hash:", tx.hash);
    console.log("Waiting for transaction confirmation...");

    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Find TokenCreated event in receipt
    const event = receipt.logs
      .map((log) => {
        try {
          return tokenFactory.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((parsed) => parsed && parsed.name === "TokenCreated")[0];

    if (event) {
      const newTokenAddress = event.args.tokenAddress;
      console.log(`SUCCESS: New token created at address: ${newTokenAddress}`);

      // Perform post-creation configuration
      console.log("Starting token configuration...");
      await configureNewToken(newTokenAddress);
    } else {
      console.error(
        "ERROR: Token created but couldn't find TokenCreated event in logs"
      );
      console.log(
        "Available events:",
        receipt.logs.map((log) => {
          try {
            const parsed = tokenFactory.interface.parseLog(log);
            return parsed ? parsed.name : "unknown";
          } catch (e) {
            return "unparseable";
          }
        })
      );
    }
  } catch (error) {
    console.error("ERROR creating token:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
    if (error.transaction) {
      console.error("Transaction hash:", error.transaction.hash);
    }
  }
}

async function configureNewToken(tokenAddress) {
  console.log("Configuring new token at address:", tokenAddress);

  if (!tokenTemplateAbi.tokenAbi) {
    console.error("ERROR: tokenTemplateAbi does not have the expected format");
    return;
  }

  const tokenContract = new ethers.Contract(
    tokenAddress,
    tokenTemplateAbi.tokenAbi,
    wallet
  );

  try {
    // 1. Enable Trading
    console.log("Enabling trading...");
    const enableTradingTx = await tokenContract.enableTrading();
    console.log("Enable trading transaction hash:", enableTradingTx.hash);

    const enableReceipt = await enableTradingTx.wait();
    console.log(
      "Trading enabled successfully in block:",
      enableReceipt.blockNumber
    );

    console.log("Token configuration completed successfully!");
  } catch (error) {
    console.error("ERROR configuring token:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
}

async function getMyTokens() {
  try {
    console.log("Fetching tokens created by address:", wallet.address);
    const myTokens = await tokenFactory.getCreatorTokens(wallet.address);
    console.log("Tokens created by me:", myTokens);
  } catch (error) {
    console.error("ERROR fetching tokens:", error.message);
  }
}

// Main execution
(async () => {
  try {
    console.log("Starting main script execution...");
    await createNewToken();
    console.log("Script completed successfully!");
  } catch (error) {
    console.error("FATAL ERROR in main execution:", error);
  }
})();
