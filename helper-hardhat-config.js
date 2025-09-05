// Define network-specific constants and addresses

const networkConfig = {
  default: {
    name: "hardhat",
    blockConfirmations: 1,
  },
  31337: {
    name: "localhost",
    blockConfirmations: 1,
  },
  5: {
    name: "goerli",
    blockConfirmations: 6,
  },
  1: {
    name: "mainnet",
    blockConfirmations: 6,
  },
  56: {
    name: "bsc",
    blockConfirmations: 6,
  },
  97: {
    name: "bsc-testnet",
    blockConfirmations: 6,
  },
  137: {
    name: "polygon",
    blockConfirmations: 6,
  },
  80001: {
    name: "mumbai",
    blockConfirmations: 6,
  },
  42161: {
    name: "arbitrum",
    blockConfirmations: 6,
  },
  10: {
    name: "optimism",
    blockConfirmations: 6,
  },
};

// DEX Routers for different networks
const routerAddress = {
  1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2 Router (Mainnet)
  5: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2 Router (Goerli)
  56: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap Router (BSC)
  97: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1", // PancakeSwap Router (BSC Testnet)
  137: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap Router (Polygon)
  80001: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap Router (Mumbai)
  42161: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // SushiSwap Router (Arbitrum)
  10: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // SushiSwap Router (Optimism)
};

// Contract Addresses
// For local development, these will be overridden
const feeCollectorAddress =
  process.env.FEE_COLLECTOR_ADDRESS ||
  "0x0000000000000000000000000000000000000000";

const tokenCreationFeeConfig = process.env.TOKEN_CREATION_FEE || "0.0001";
const tokenSaleFeeConfig = "0.0001";
const launchFeeConfig = process.env.LAUNCH_FEE || "0.0001";
const airdropFeeConfig = process.env.AIRDROP_FEE || "0.0001";

// Development accounts
const developmentChains = ["hardhat", "localhost"];

const initialHolder1 = "0xb174659C69bC97b7D1Be4d8012d80cD0A374194e";
const initialHolder2 = "0xEa4d95CC1c1bB90d398bEd9DdF5dAE3D64b85f6B";
const initialHolder3 = "0xF8dA925Da2695c484b687c236A1e5beCB9F3F81C";
const initialHolder4 = "0xba884a1a579288680af80092974ae308384D3588";

module.exports = {
  networkConfig,
  developmentChains,
  feeCollectorAddress,
  airdropFeeConfig,
  routerAddress,
  tokenCreationFeeConfig,
  launchFeeConfig,
  tokenSaleFeeConfig,
  initialHolder1,
  initialHolder2,
  initialHolder3,
  initialHolder4,
};
