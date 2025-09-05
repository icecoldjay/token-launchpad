// deploy-all.js
const { network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  log("====================================================");
  log(`Deploying all contracts to ${network.name} (chainId: ${chainId})`);
  log(`Deployer: ${deployer}`);
  log("====================================================");

  // This file just triggers all the other deployment scripts
  // The actual deployments are handled by the individual files

  log("====================================================");
  log("Deployment completed");
  log("====================================================");
};

module.exports.tags = ["all"];
module.exports.dependencies = [
  "tokenfactory",
  "liquiditymanager",
  "launchmanager",
];
