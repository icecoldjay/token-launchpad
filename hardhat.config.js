require("dotenv").config();
require("@nomicfoundation/hardhat-verify");
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-chai-matchers");
require("hardhat-deploy");
require("solidity-coverage");
require("hardhat-gas-reporter");

const PRIVATE_KEY =
  process.env.OWNER_PRIVATE_KEY ||
  "0x706f622f32f2dabd6304a22be832436c06a70c3823de7f5ab8d2e0e19270a20e";

// Mainnet RPC URLs
const MAINNET_RPC_URL =
  "https://eth-mainnet.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";
const ARBITRUM_RPC_URL =
  "https://arb-mainnet.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";
const POLYGON_RPC_URL =
  "https://polygon-mainnet.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";
const BASE_RPC_URL =
  "https://bnb-mainnet.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";
const BNB_RPC_URL =
  "https://bnb-mainnet.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";
const AVALANCHE_RPC_URL =
  "https://avax-mainnet.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";

// Testnet RPC URLs
const SEPOLIA_RPC_URL =
  "https://eth-sepolia.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";
const ARBITRUM_SEPOLIA_RPC_URL =
  "https://arb-sepolia.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";
const POLYGON_AMOY_RPC_URL =
  "https://polygon-amoy.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";
const BASE_SEPOLIA_RPC_URL =
  "https://base-sepolia.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";
const BNB_TESTNET_RPC_URL =
  "https://bnb-testnet.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";
const AVALANCHE_TESTNET_RPC_URL =
  "https://avax-fuji.g.alchemy.com/v2/PYq-4sq7V-GIL9KuD0hez";

// API Keys
const ETHERSCAN_API_KEY =
  process.env.ETHERSCAN_API_KEY || "JTGE9INI98Y7Q7C34DT59J68SFUD2INFZT";
const POLYGONSCAN_API_KEY =
  process.env.POLYGONSCAN_API_KEY || "W589WTP4ZMSPQSXR8ZN4C141MCPXEUVDY1";
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY || ETHERSCAN_API_KEY;
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || ETHERSCAN_API_KEY;
const SNOWTRACE_API_KEY = process.env.SNOWTRACE_API_KEY || ETHERSCAN_API_KEY;
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ETHERSCAN_API_KEY;

const REPORT_GAS = process.env.REPORT_GAS || false;

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      chainId: 31337,
    },

    // Mainnets
    ethereum: {
      url: MAINNET_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 1,
      gasPrice: "auto",
    },
    arbitrum: {
      url: ARBITRUM_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 42161,
      gasPrice: "auto",
    },
    polygon: {
      url: POLYGON_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 137,
      gasPrice: "auto",
    },
    base: {
      url: BASE_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 8453,
      gasPrice: "auto",
    },
    bnb: {
      url: BNB_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 56,
      gasPrice: "auto",
    },
    avalanche: {
      url: AVALANCHE_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 43114,
      gasPrice: "auto",
    },

    // Testnets
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111,
      gasPrice: "auto",
    },
    arbitrumSepolia: {
      url: ARBITRUM_SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 421614,
      gasPrice: "auto",
    },
    polygonAmoy: {
      url: POLYGON_AMOY_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 80002,
      gasPrice: "auto",
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 84532,
      gasPrice: "auto",
    },
    bnbTestnet: {
      url: BNB_TESTNET_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 97,
      gasPrice: "auto",
    },
    avalancheFuji: {
      url: AVALANCHE_TESTNET_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 43113,
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: {
      // Mainnets
      mainnet: ETHERSCAN_API_KEY,
      arbitrumOne: ARBISCAN_API_KEY,
      polygon: POLYGONSCAN_API_KEY,
      bsc: BSCSCAN_API_KEY,
      avalanche: SNOWTRACE_API_KEY,
      base: BASESCAN_API_KEY,
      // Testnets
      sepolia: ETHERSCAN_API_KEY,
      arbitrumSepolia: ARBISCAN_API_KEY,
      polygonAmoy: POLYGONSCAN_API_KEY,
      baseSepolia: BASESCAN_API_KEY,
      bscTestnet: BSCSCAN_API_KEY,
      avalancheFujiTestnet: SNOWTRACE_API_KEY,
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io",
        },
      },
      {
        network: "avalancheFujiTestnet",
        chainId: 43113,
        urls: {
          apiURL: "https://api-testnet.snowtrace.io/api",
          browserURL: "https://testnet.snowtrace.io",
        },
      },
    ],
  },
  gasReporter: {
    enabled: REPORT_GAS,
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  namedAccounts: {
    deployer: {
      default: 0,
      1: 0, // Ethereum
      56: 0, // BNB
      137: 0, // Polygon
      42161: 0, // Arbitrum
      43114: 0, // Avalanche
      8453: 0, // Base
      11155111: 0, // Sepolia
      421614: 0, // Arbitrum Sepolia
      80002: 0, // Polygon Amoy
      84532: 0, // Base Sepolia
      97: 0, // BNB Testnet
      43113: 0, // Avalanche Fuji
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
  },
  mocha: {
    timeout: 200000,
  },
};
