const { network, ethers } = require("hardhat");
const {
  feeCollectorAddress,
  airdropFeeConfig,
} = require("../helper-hardhat-config");

// AirdropManager deployment script
// Address: 0xb56752a940A69750a10bE6920C8153dc6c12225f
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Deploying AirdropManager contract...");

  try {
    // Use configurable airdrop fee with fallback
    const airdropFee = airdropFeeConfig
      ? ethers.parseEther(airdropFeeConfig)
      : ethers.parseEther("0.001"); // 0.01 ETH default fee

    const airdropManager = await deploy("AirdropManager", {
      from: deployer,
      args: [feeCollectorAddress || deployer, airdropFee],
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });

    log("AirdropManager contract deployed at:", airdropManager.address);
    log("Fee collector address:", feeCollectorAddress || deployer);
    log("Airdrop fee:", ethers.formatEther(airdropFee), "ETH");
  } catch (error) {
    log("Error deploying AirdropManager:", error);
    throw error;
  }

  log("----------------------------------------------------");
  log("AirdropManager is ready to manage token airdrops.");
};

module.exports.tags = ["all", "core", "airdropmanager"];
module.exports.dependencies = [];
