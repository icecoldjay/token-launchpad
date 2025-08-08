const { network, ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Helper function to save deployment addresses
const saveDeploymentAddresses = (networkName, contractName, address) => {
  const deploymentsPath = path.join(__dirname, "../deployments");
  const networkPath = path.join(deploymentsPath, networkName);

  if (!fs.existsSync(deploymentsPath)) {
    fs.mkdirSync(deploymentsPath);
  }

  if (!fs.existsSync(networkPath)) {
    fs.mkdirSync(networkPath);
  }

  const filePath = path.join(networkPath, `${contractName}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ address }, null, 2));
};

// Main deployment function
const deployAll = async () => {
  const { deployments, getNamedAccounts } = require("hardhat");
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;
  const networkName = network.name;

  log(`\n\nStarting deployment on ${networkName} (ChainId: ${chainId})`);
  log(`Deployer address: ${deployer}`);
  log("----------------------------------------------------");

  try {
    // 1. Deploy TokenFactory
    log("\nDeploying TokenFactory...");
    const creationFee = ethers.parseEther("0.00001"); // Default fee
    const tokenFactory = await deploy("TokenFactory", {
      from: deployer,
      args: [deployer, creationFee], // Using deployer as fallback fee collector
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });
    saveDeploymentAddresses(networkName, "TokenFactory", tokenFactory.address);
    log(`TokenFactory deployed at: ${tokenFactory.address}`);

    // 2. Deploy LiquidityManager
    log("\nDeploying LiquidityManager...");
    const routerAddresses = {
      // Mainnets
      1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Ethereum Mainnet (Uniswap V2)
      56: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // BNB Chain (PancakeSwap)
      137: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // Polygon (QuickSwap)
      42161: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // Arbitrum (SushiSwap)
      43114: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4", // Avalanche (Pangolin)
      8453: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86", // Base (BaseSwap)

      // Testnets
      11155111: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3", // Sepolia
      97: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1", // BNB Testnet
      80002: "0x6E2dc0F9DB014aE19888F539E59285D2Ea04244C", // Polygon Amoy
      421614: "0x101F443B4d1b0592DfD4F51621361a7A5a704468", // Arbitrum Sepolia
      84532: "0x9C5d087f1373e220fB9B9F944a5A9c6F3B7aA8E8", // Base Sepolia
      43113: "0xd00ae08403B9bbb9124bB305C09058E32C39A48c", // Avalanche Fuji
    };

    const routerAddress = routerAddresses[chainId];
    if (!routerAddress) {
      throw new Error(`No router address configured for chainId ${chainId}`);
    }

    log(`Using router address: ${routerAddress}`);
    const liquidityManager = await deploy("LiquidityManager", {
      from: deployer,
      args: [routerAddress],
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });
    saveDeploymentAddresses(
      networkName,
      "LiquidityManager",
      liquidityManager.address
    );
    log(`LiquidityManager deployed at: ${liquidityManager.address}`);

    // 3. Deploy LaunchManager
    log("\nDeploying LaunchManager...");
    const launchFee = ethers.parseEther("0.1"); // Default launch fee

    const launchManager = await deploy("LaunchManager", {
      from: deployer,
      args: [
        tokenFactory.address,
        liquidityManager.address,
        deployer, // Using deployer as fallback fee collector
        launchFee,
      ],
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });
    saveDeploymentAddresses(
      networkName,
      "LaunchManager",
      launchManager.address
    );
    log(`LaunchManager deployed at: ${launchManager.address}`);

    log("\n----------------------------------------------------");
    log("All contracts deployed successfully!");
    log("----------------------------------------------------");

    return {
      tokenFactory: tokenFactory.address,
      liquidityManager: liquidityManager.address,
      launchManager: launchManager.address,
    };
  } catch (error) {
    log(`Deployment failed on ${networkName}:`, error);
    throw error;
  }
};

// Execute deployment when called directly
if (require.main === module) {
  deployAll()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = deployAll;
module.exports.tags = ["all", "core"];
