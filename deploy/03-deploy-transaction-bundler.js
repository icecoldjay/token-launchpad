const { network } = require("hardhat");

// Address: 0x17D3B8d743728D7FcA2bf667160fE41F4846717e
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  try {
    log("----------------------------------------------------");
    log("Deploying TransactionBundler contract...");

    const transactionBundler = await deploy("TransactionBundler", {
      from: deployer,
      args: [deployer], // Setting deployer as the initial owner
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });

    log("----------------------------------------------------");
    log("TransactionBundler contract deployed at:", transactionBundler.address);
    log("----------------------------------------------------");

    log("TransactionBundler is ready to batch transactions.");
  } catch (error) {
    log("Deployment error:", error);
    throw error;
  }
};

module.exports.tags = ["all", "extensions", "transactionbundler"];