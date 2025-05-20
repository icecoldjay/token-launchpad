const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Networks configuration
const NETWORKS = {
  mainnet: {
    name: "Ethereum Mainnet",
    rpcEnvVar: "MAINNET_RPC_URL",
    chainId: 1,
    nativeTokenSymbol: "ETH",
  },
  arbitrum: {
    name: "Arbitrum",
    rpcEnvVar: "ARBITRUM_RPC_URL",
    chainId: 42161,
    nativeTokenSymbol: "ETH",
  },
  polygon: {
    name: "Polygon",
    rpcEnvVar: "POLYGON_RPC_URL",
    chainId: 137,
    nativeTokenSymbol: "MATIC",
  },
  base: {
    name: "Base",
    rpcEnvVar: "BASE_RPC_URL",
    chainId: 8453,
    nativeTokenSymbol: "ETH",
  },
  bnb: {
    name: "BNB Chain",
    rpcEnvVar: "BNB_RPC_URL",
    chainId: 56,
    nativeTokenSymbol: "BNB",
  },
  avalanche: {
    name: "Avalanche",
    rpcEnvVar: "AVALANCHE_RPC_URL",
    chainId: 43114,
    nativeTokenSymbol: "AVAX",
  },
};

// Uniswap router addresses for different networks
const ROUTER_ADDRESSES = {
  1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Ethereum Mainnet
  42161: "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Arbitrum
  137: "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Polygon
  8453: "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Base
  56: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // BNB Chain
  43114: "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106", // Avalanche
  11155111: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3", // Sepolia Testnet
};

// Helper function to read contract artifacts
async function readArtifact(contractName, folder = "core") {
  // Define the potential folder paths based on contract name
  let artifactPath;

  if (contractName === "LiquidityManager") {
    artifactPath = path.join(
      __dirname,
      "..",
      "artifacts",
      "contracts",
      "extensions",
      `${contractName}.sol`,
      `${contractName}.json`
    );
  } else {
    artifactPath = path.join(
      __dirname,
      "..",
      "artifacts",
      "contracts",
      "core",
      `${contractName}.sol`,
      `${contractName}.json`
    );
  }

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Artifact not found: ${artifactPath}\nMake sure you've compiled your contracts with 'npx hardhat compile'`
    );
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

// Helper function to read project config
function readHelperConfig() {
  try {
    return require(path.join(__dirname, "..", "helper-hardhat-config"));
  } catch (error) {
    console.warn(
      "Warning: helper-hardhat-config.js not found or error reading it. Using default values."
    );
    return {
      feeCollectorAddress: "0x0000000000000000000000000000000000000000",
      tokenCreationFeeConfig: 0.0001,
      launchFeeConfig: 0.0001,
    };
  }
}

async function main() {
  console.log("======================================================");
  console.log("MULTI-NETWORK DEPLOYMENT WITH COST ESTIMATION");
  console.log("======================================================");

  try {
    // Read contract artifacts to calculate bytecode size
    const TokenFactoryArtifact = await readArtifact("TokenFactory");
    const LiquidityManagerArtifact = await readArtifact("LiquidityManager");
    const LaunchManagerArtifact = await readArtifact("LaunchManager");

    // Calculate bytecode sizes in bytes (using deployment bytecode)
    const CONTRACT_SIZES = {
      TokenFactory: (TokenFactoryArtifact.bytecode.length - 2) / 2, // Convert from hex string to bytes
      LiquidityManager: (LiquidityManagerArtifact.bytecode.length - 2) / 2,
      LaunchManager: (LaunchManagerArtifact.bytecode.length - 2) / 2,
    };

    console.log("Contract bytecode sizes (bytes):");
    console.log(`- TokenFactory: ${CONTRACT_SIZES.TokenFactory}`);
    console.log(`- LiquidityManager: ${CONTRACT_SIZES.LiquidityManager}`);
    console.log(`- LaunchManager: ${CONTRACT_SIZES.LaunchManager}`);
    console.log("------------------------------------------------------");

    // Import helper config
    const { feeCollectorAddress, tokenCreationFeeConfig, launchFeeConfig } =
      readHelperConfig();

    // Loop through each configured network
    for (const [networkKey, networkConfig] of Object.entries(NETWORKS)) {
      console.log(`\n======================================================`);
      console.log(`NETWORK: ${networkConfig.name} (${networkKey})`);
      console.log(`======================================================`);

      const rpcUrl = process.env[networkConfig.rpcEnvVar];

      if (!rpcUrl) {
        console.log(
          `⚠️ Missing RPC URL for ${networkConfig.name}. Skipping...`
        );
        continue;
      }

      try {
        // Create provider for the network
        const provider = new ethers.JsonRpcProvider(rpcUrl);

        // Check connection
        console.log(`Connecting to ${networkConfig.name}...`);
        try {
          await provider.getBlockNumber();
          console.log(`✅ Connected successfully!`);
        } catch (error) {
          console.log(
            `❌ Failed to connect to ${networkConfig.name}: ${error.message}`
          );
          continue;
        }

        // Get current gas price
        const gasPrice = await provider.getFeeData();
        const effectiveGasPrice = gasPrice.gasPrice || gasPrice.maxFeePerGas;
        console.log(
          `Current gas price: ${ethers.formatUnits(
            effectiveGasPrice,
            "gwei"
          )} gwei`
        );

        // Set up deployment signer - using null address since we're only estimating
        const deployerAddress = "0x0000000000000000000000000000000000000000";

        // Define contract parameters
        const routerAddress =
          ROUTER_ADDRESSES[networkConfig.chainId] || ROUTER_ADDRESSES[1]; // Fallback to Mainnet
        const creationFee = tokenCreationFeeConfig
          ? ethers.parseEther(tokenCreationFeeConfig)
          : ethers.parseEther("0.00001");
        const launchFee = launchFeeConfig
          ? ethers.parseEther(launchFeeConfig)
          : ethers.parseEther("0.1");
        const feeCollector = feeCollectorAddress || deployerAddress;

        // Estimate gas costs
        console.log(`\nEstimating deployment costs for ${networkConfig.name}:`);

        // Gas estimates based on bytecode size
        // We're using a formula that approximates gas costs, including constructor execution
        // Base gas + 68 gas per bytecode byte + constructor overhead
        const tokenFactoryGas =
          21000 + CONTRACT_SIZES.TokenFactory * 68 + 30000;
        const liquidityManagerGas =
          21000 + CONTRACT_SIZES.LiquidityManager * 68 + 40000;
        const launchManagerGas =
          21000 + CONTRACT_SIZES.LaunchManager * 68 + 50000;

        // Calculate costs
        const tokenFactoryCost = effectiveGasPrice * BigInt(tokenFactoryGas);
        const liquidityManagerCost =
          effectiveGasPrice * BigInt(liquidityManagerGas);
        const launchManagerCost = effectiveGasPrice * BigInt(launchManagerGas);
        const totalCost =
          tokenFactoryCost + liquidityManagerCost + launchManagerCost;

        console.log(
          `TokenFactory:      ${ethers.formatEther(tokenFactoryCost)} ${
            networkConfig.nativeTokenSymbol
          }`
        );
        console.log(
          `LiquidityManager:  ${ethers.formatEther(liquidityManagerCost)} ${
            networkConfig.nativeTokenSymbol
          }`
        );
        console.log(
          `LaunchManager:     ${ethers.formatEther(launchManagerCost)} ${
            networkConfig.nativeTokenSymbol
          }`
        );
        console.log(`------------------------------------------------------`);
        console.log(
          `TOTAL ESTIMATED:   ${ethers.formatEther(totalCost)} ${
            networkConfig.nativeTokenSymbol
          }`
        );
        console.log(`------------------------------------------------------`);

        // Simulate deployment
        console.log(`\nSimulation of deployment sequence:`);
        console.log(
          `1. TokenFactory would deploy with args: [${feeCollector}, ${creationFee}]`
        );
        console.log(
          `2. LiquidityManager would deploy with args: [${routerAddress}]`
        );
        console.log(
          `3. LaunchManager would deploy with args: [TokenFactory.address, LiquidityManager.address, ${feeCollector}, ${launchFee}]`
        );
      } catch (error) {
        console.log(`❌ Error estimating deployment on ${networkConfig.name}:`);
        console.log(error);
      }
    }

    console.log("\n======================================================");
    console.log("DEPLOYMENT ESTIMATION COMPLETED");
    console.log("======================================================");
    console.log(
      "NOTE: To proceed with actual deployment, ensure you have sufficient funds in your wallet"
    );
    console.log(
      "and update your hardhat.config.js to include all target networks."
    );
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
