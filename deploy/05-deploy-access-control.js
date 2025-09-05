const { network } = require("hardhat");

// Address: 0xE1536e6f8809eeDf1F5C1A7018E17D141d30362e
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Deploying TokenAccessControl contract...");

  try {
    const accessControl = await deploy("TokenAccessControl", {
      from: deployer,
      args: [], // No constructor arguments required
      log: true,
      waitConfirmations: network.config.blockConfirmations || 1,
    });

    log("----------------------------------------------------");
    log("✅ TokenAccessControl contract deployed at:", accessControl.address);
    log("Roles: DEFAULT_ADMIN_ROLE and ADMIN_ROLE assigned to deployer.");
  } catch (error) {
    log("Error deploying TokenAccessControl:", error);
    throw error;
  }

  log("----------------------------------------------------");
};

module.exports.tags = ["all", "utils", "accesscontrol"];