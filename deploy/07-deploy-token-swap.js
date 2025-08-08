const { network, ethers } = require("hardhat");

// Uniswap V2 router addresses for different networks
const ROUTER_ADDRESSES = {
  1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Ethereum Mainnet
  11155111: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3", // Sepolia Testnet
  137: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // Polygon Mainnet
  80001: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // Polygon Mumbai
  56: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // BSC Mainnet
  97: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1", // BSC Testnet
  42161: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // Arbitrum One
  421614: "0x2766784994e503d2bae3bd9adf628e8fdc51d5ae", // Arbitrum Sepolia
  10: "0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2", // Optimism Mainnet
  420: "0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2", // Optimism Goerli
  8453: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24", // Base Mainnet
  84531: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24", // Base Goerli
};

// Initial configuration parameters
const INITIAL_CONFIG = {
  feePercentage: 30, // 0.3% (30 basis points)
  maxFeePercentage: 500, // 5% maximum fee limit
};

// Address: 0x31376bF5283038EF880D4967066Bc33D81F93B59
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  try {
    // Determine the Uniswap V2 Router address
    const routerAddress = ROUTER_ADDRESSES[chainId];

    if (!routerAddress) {
      throw new Error(
        `Uniswap V2 Router address not configured for chain ID: ${chainId}`
      );
    }

    log("----------------------------------------------------");
    log("Deploying TokenSwapContract...");
    log(`Network: ${network.name} (Chain ID: ${chainId})`);
    log(`Deployer: ${deployer}`);
    log(`Using Uniswap V2 Router at: ${routerAddress}`);
    log(
      `Initial fee percentage: ${INITIAL_CONFIG.feePercentage} basis points (${
        INITIAL_CONFIG.feePercentage / 100
      }%)`
    );

    // Deploy the TokenSwapContract
    const tokenSwapContract = await deploy("TokenSwapContract", {
      from: deployer,
      args: [routerAddress],
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });

    log("----------------------------------------------------");
    log("TokenSwapContract deployed successfully!");
    log(`Contract address: ${tokenSwapContract.address}`);

    // Get the deployed contract instance for post-deployment setup
    const contractInstance = await ethers.getContractAt(
      "TokenSwapContract",
      tokenSwapContract.address
    );

    log("----------------------------------------------------");
    log("Setting up initial configuration...");

    // Verify initial fee percentage (should already be set to 30 in constructor)
    const currentFee = await contractInstance.feePercentage();
    log(`Current fee percentage: ${currentFee} basis points`);

    // Add deployer as initial authorized executor (optional - you might want to add your off-chain service address)
    const isAuthorizedExecutor = await contractInstance.authorizedExecutors(
      deployer
    );
    if (!isAuthorizedExecutor) {
      log("Adding deployer as authorized executor...");
      const tx = await contractInstance.addAuthorizedExecutor(deployer);
      await tx.wait();
      log("Deployer added as authorized executor");
    } else {
      log("Deployer is already an authorized executor");
    }

    log("----------------------------------------------------");
    log("Deployment and setup completed successfully!");
    log("");
    log("Contract Information:");
    log(`- Address: ${tokenSwapContract.address}`);
    log(`- Router: ${routerAddress}`);
    log(`- Fee: ${currentFee} basis points (${currentFee / 100}%)`);
    log(`- Owner: ${deployer}`);
    log("");
    log("Next Steps:");
    log("1. Add your off-chain service addresses as authorized executors");
    log("2. Test market swaps and limit orders on testnet");
    log("3. Consider verifying the contract on Etherscan");
    log("4. Set up monitoring for limit orders");

    // Return deployment info for potential use by other scripts
    return {
      address: tokenSwapContract.address,
      router: routerAddress,
      deployer: deployer,
      chainId: chainId,
      network: network.name,
    };
  } catch (error) {
    log("❌ Deployment failed:");
    log(error.message);
    throw error;
  }
};

module.exports.tags = ["all", "tokenswap", "swap"];
module.exports.dependencies = []; // Add dependencies if needed
