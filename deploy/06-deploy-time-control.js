const { network } = require("hardhat");

// Address: 0xcb2cCcC8738F5D6e47f2bAe9130D79e78B0b748E
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("🚀 Deploying TimeControl contract...");

  try {
    const timeControl = await deploy("TimeControl", {
      from: deployer,
      args: [], // No constructor arguments needed
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });

    log("✅ TimeControl contract deployed at:", timeControl.address);
    log("⏳ This contract manages trading phases based on launch time.");
  } catch (error) {
    log("❌ Error deploying TimeControl contract:", error);
    throw error;
  }

  log("----------------------------------------------------");
};

module.exports.tags = ["all", "utils", "timecontrol"];