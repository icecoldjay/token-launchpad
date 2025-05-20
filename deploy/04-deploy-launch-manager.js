const { network, ethers } = require("hardhat");
const {
  feeCollectorAddress,
  launchFeeConfig,
} = require("../helper-hardhat-config");

// Address: 0x0A4688365aC0Fb39A6d7478db4f6c82778ee8138
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Deploying LaunchManager contract...");

  try {
    // Validate dependent contracts are deployed
    const tokenFactory = await get("TokenFactory");
    const liquidityManager = await get("LiquidityManager");

    // Use configurable launch fee with fallback
    const launchFee = launchFeeConfig
      ? ethers.parseEther(launchFeeConfig)
      : ethers.parseEther("0.1");

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

    log("LaunchManager contract deployed at:", launchManager.address);
  } catch (error) {
    log("Error deploying LaunchManager:", error);
    throw error;
  }

  log("----------------------------------------------------");
  log("LaunchManager is ready to deploy tokens with liquidity.");
};

module.exports.tags = ["all", "core", "launchmanager"];
module.exports.dependencies = ["TokenFactory", "LiquidityManager"];
