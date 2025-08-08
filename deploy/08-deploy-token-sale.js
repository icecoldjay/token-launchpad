const { network, ethers } = require("hardhat");
const {
  feeCollectorAddress,
  tokenSaleFeeConfig,
} = require("../helper-hardhat-config");

// Address: 0x0E0C6677e4D5446adE7E3472ef15420C85Ef6ecf
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  // Fee settings with configurable fallback
  const saleFee = tokenSaleFeeConfig
    ? ethers.parseEther(tokenSaleFeeConfig)
    : ethers.parseEther("0.001"); // Default 0.001 ETH fee for creating token sales

  log("----------------------------------------------------");
  log("Deploying TokenSaleManager contract...");
  log(`Network: ${network.name} (Chain ID: ${chainId})`);
  log(`Deployer: ${deployer}`);
  log(`Fee Collector: ${feeCollectorAddress || deployer}`);
  log(`Sale Creation Fee: ${ethers.formatEther(saleFee)} ETH`);

  try {
    const tokenSaleManager = await deploy("TokenSaleManager", {
      from: deployer,
      args: [
        feeCollectorAddress || deployer, // Fee collector address with fallback
        saleFee, // Sale creation fee
      ],
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });

    log("TokenSaleManager contract deployed at:", tokenSaleManager.address);
    log("TokenSaleManager is ready for managing token sales.");

    // Log deployment details
    log("Deployment Summary:");
    log(`- Contract: TokenSaleManager`);
    log(`- Address: ${tokenSaleManager.address}`);
    log(`- Fee Collector: ${feeCollectorAddress || deployer}`);
    log(`- Sale Creation Fee: ${ethers.formatEther(saleFee)} ETH`);
    log(`- Network: ${network.name}`);
    log(`- Chain ID: ${chainId}`);
    log(`- Deployer: ${deployer}`);
    log(`- Block Confirmations: ${network.config.blockConfirmations || 1}`);
  } catch (error) {
    log("Error deploying TokenSaleManager:", error);
    throw error;
  }

  log("----------------------------------------------------");
};

module.exports.tags = ["all", "core", "tokensalemanager", "sales"];
