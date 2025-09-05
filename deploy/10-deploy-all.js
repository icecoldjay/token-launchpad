const { network, ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const {
  feeCollectorAddress,
  tokenCreationFeeConfig,
  launchFeeConfig,
} = require("../helper-hardhat-config");

// Uniswap/DEX Router addresses for different networks
const ROUTER_ADDRESSES = {
  // Mainnets
  1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Ethereum Mainnet (Uniswap V2)
  42161: "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Arbitrum One (Uniswap V3)
  137: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // Polygon Mainnet (QuickSwap)
  8453: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86", // Base (BaseSwap)
  56: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // BNB Chain (PancakeSwap)
  43114: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4", // Avalanche C-Chain (TraderJoe)

  // Testnets
  11155111: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3", // Sepolia Testnet
  421614: "0x8e568937e65Fa99A21D06AeF46A5387F9F9A620D", // Arbitrum Sepolia
  80002: "0x8954AfA98594b838bda56FE4C12a09D7739D179b", // Polygon Amoy
  84532: "0x0F61B24272d9726077bD0e5953D1b42416dB5319", // Base Sepolia
  97: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1", // BNB Testnet
  43113: "0xd7f655E3376cE2D7A2b08fF01Eb3B1023191A901", // Avalanche Fuji

  // Local
  31337: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3", // Hardhat local (using Sepolia address as placeholder)
};

// Network specific fee configurations
const NETWORK_SPECIFIC_CONFIGS = {
  // Mainnets - Network ID: { tokenCreationFee, launchFee }
  1: { tokenCreationFee: "0.05", launchFee: "0.1" }, // Ethereum - higher fees
  42161: { tokenCreationFee: "0.0005", launchFee: "0.005" }, // Arbitrum - lower fees due to L2
  137: { tokenCreationFee: "0.5", launchFee: "5.0" }, // Polygon - higher MATIC count, lower value
  8453: { tokenCreationFee: "0.0005", launchFee: "0.005" }, // Base - lower fees due to L2
  56: { tokenCreationFee: "0.005", launchFee: "0.05" }, // BNB Chain - moderate fees
  43114: { tokenCreationFee: "0.05", launchFee: "0.5" }, // Avalanche - moderate fees

  // Testnets - lower fees for testing
  11155111: { tokenCreationFee: "0.00001", launchFee: "0.0001" }, // Sepolia
  421614: { tokenCreationFee: "0.00001", launchFee: "0.0001" }, // Arbitrum Sepolia
  80002: { tokenCreationFee: "0.0001", launchFee: "0.001" }, // Polygon Amoy
  84532: { tokenCreationFee: "0.00001", launchFee: "0.0001" }, // Base Sepolia
  97: { tokenCreationFee: "0.00001", launchFee: "0.0001" }, // BNB Testnet
  43113: { tokenCreationFee: "0.00001", launchFee: "0.0001" }, // Avalanche Fuji

  // Local development
  31337: { tokenCreationFee: "0.00001", launchFee: "0.0001" }, // Local hardhat - low fees
};

// Network display names for prettier logging
const NETWORK_NAMES = {
  1: "Ethereum Mainnet",
  42161: "Arbitrum One",
  137: "Polygon Mainnet",
  8453: "Base Mainnet",
  56: "BNB Chain",
  43114: "Avalanche C-Chain",
  11155111: "Sepolia Testnet",
  421614: "Arbitrum Sepolia",
  80002: "Polygon Amoy",
  84532: "Base Sepolia",
  97: "BNB Testnet",
  43113: "Avalanche Fuji",
  31337: "Hardhat Local",
};

// Function to log deployment info to a file
async function logDeployment(networkName, contractName, contractAddress) {
  const deploymentsDir = path.join(__dirname, "../deployments-log");

  // Create directory if it doesn't exist
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filePath = path.join(deploymentsDir, `${networkName}.json`);
  let deployments = {};

  // Read existing file if it exists
  if (fs.existsSync(filePath)) {
    deployments = JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  // Update with new deployment
  deployments[contractName] = contractAddress;

  // Write back to file
  fs.writeFileSync(filePath, JSON.stringify(deployments, null, 2));
}

// Main deployment function
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;
  const networkName = network.name;
  const friendlyNetworkName = NETWORK_NAMES[chainId] || networkName;

  // Get network-specific configuration or use defaults
  const networkConfig = NETWORK_SPECIFIC_CONFIGS[chainId] || {
    tokenCreationFee: "0.00001",
    launchFee: "0.0001",
  };

  // Determine fees (prioritize environment variables, then network-specific, then defaults)
  const creationFee = tokenCreationFeeConfig
    ? ethers.parseEther(tokenCreationFeeConfig)
    : ethers.parseEther(networkConfig.tokenCreationFee);

  const launchFee = launchFeeConfig
    ? ethers.parseEther(launchFeeConfig)
    : ethers.parseEther(networkConfig.launchFee);

  log("====================================================");
  log(
    `Deploying contracts to ${friendlyNetworkName} (${networkName}, chainId: ${chainId})`
  );
  log("====================================================");

  try {
    // 1. Deploy TokenFactory
    log("----------------------------------------------------");
    log("Deploying TokenFactory contract...");

    const tokenFactory = await deploy("TokenFactory", {
      from: deployer,
      args: [
        feeCollectorAddress || deployer, // Fee collector address with fallback
        creationFee,
      ],
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });

    log(`TokenFactory deployed at: ${tokenFactory.address}`);
    await logDeployment(networkName, "TokenFactory", tokenFactory.address);

    // 2. Deploy LiquidityManager
    log("----------------------------------------------------");
    log("Deploying LiquidityManager contract...");

    // Determine the Uniswap Router address
    const routerAddress = ROUTER_ADDRESSES[chainId] || ROUTER_ADDRESSES[1]; // Fallback to Ethereum Mainnet address

    log(`Using DEX Router address: ${routerAddress}`);

    const liquidityManager = await deploy("LiquidityManager", {
      from: deployer,
      args: [routerAddress],
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });

    log(`LiquidityManager deployed at: ${liquidityManager.address}`);
    await logDeployment(
      networkName,
      "LiquidityManager",
      liquidityManager.address
    );

    // 3. Deploy LaunchManager
    log("----------------------------------------------------");
    log("Deploying LaunchManager contract...");

    const launchManager = await deploy("LaunchManager", {
      from: deployer,
      args: [
        tokenFactory.address,
        liquidityManager.address,
        feeCollectorAddress || deployer,
        launchFee,
      ],
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });

    log(`LaunchManager deployed at: ${launchManager.address}`);
    await logDeployment(networkName, "LaunchManager", launchManager.address);

    log("====================================================");
    log(`All contracts deployed successfully on ${friendlyNetworkName}`);
    log(`TokenFactory: ${tokenFactory.address}`);
    log(`LiquidityManager: ${liquidityManager.address}`);
    log(`LaunchManager: ${launchManager.address}`);
    log("====================================================");

    // If not on a local network, wait for verification
    if (chainId !== 31337 && chainId !== 1337) {
      log("Verification command examples:");
      log("----------------------------------------------------");
      log(
        `npx hardhat verify --network ${networkName} ${tokenFactory.address} ${
          feeCollectorAddress || deployer
        } ${creationFee}`
      );
      log(
        `npx hardhat verify --network ${networkName} ${liquidityManager.address} ${routerAddress}`
      );
      log(
        `npx hardhat verify --network ${networkName} ${launchManager.address} ${
          tokenFactory.address
        } ${liquidityManager.address} ${
          feeCollectorAddress || deployer
        } ${launchFee}`
      );
    }
  } catch (error) {
    log("Error during deployment:", error);
    throw error;
  }
};

module.exports.tags = ["all", "multi-network"];
