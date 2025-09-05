const { network, ethers } = require("hardhat");

// Uniswap V3  router addresses for different networks
const ROUTER_ADDRESSES = {
  1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",     // Ethereum Mainnet
  11155111: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3"  // Sepolia Testnet
};

// const WETH_SEPOLIA = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH address on Sepolia

// Address: 0xebc9642aD5A355D3D4183243A870F71d4fA9564E
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  try {
    // Determine the Uniswap V3 Position Manager address
    const routerAddress = ROUTER_ADDRESSES[chainId] || 
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Fallback to Mainnet address

    log("----------------------------------------------------");
    log("Deploying LiquidityManager contract...");
    log(`Using Uniswap V3, Router at: ${routerAddress}`);

    const liquidityManager = await deploy("LiquidityManager", {
      from: deployer,
      args: [
        routerAddress  //  Router address
      ],
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });

    log("LiquidityManager contract deployed at:", liquidityManager.address);
    log("----------------------------------------------------");
    log("LiquidityManager is ready to manage Uniswap V3 liquidity.");
  } catch (error) {
    log("Deployment error:", error);
    throw error;
  }
};

module.exports.tags = ["all", "liquiditymanager"];