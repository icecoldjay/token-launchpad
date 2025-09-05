const { ethers } = require("ethers");
const dotenv = require("dotenv");

dotenv.config();

// Uniswap V2 Factory ABI (minimal)
const UNISWAP_V2_FACTORY_ABI = [
  "function allPairs(uint) external view returns (address)",
  "function allPairsLength() external view returns (uint)",
  "function getPair(address tokenA, address tokenB) external view returns (address)",
];

// Uniswap V2 Pair ABI (minimal)
const UNISWAP_V2_PAIR_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
];

// Network configurations
const NETWORK_CONFIGS = {
  sepolia: {
    rpcUrl: process.env.SEPOLIA_RPC_URL,
    factoryAddress: "0xF62c03E08ada871A0bEb309762E260a7a6a880E6", // Uniswap V2 Factory on Sepolia
    wethAddress: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH on Sepolia
    commonTokens: {
      WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      USDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // Mock USDC on Sepolia
      DAI: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", // Mock DAI on Sepolia
    },
  },
  mainnet: {
    rpcUrl: process.env.MAINNET_RPC_URL,
    factoryAddress: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Uniswap V2 Factory
    wethAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    commonTokens: {
      WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      USDC: "0xA0b86a33E6417c40c1052B83E2340E5C7e0F12a7",
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    },
  },
};

class UniswapTokenQuerier {
  constructor(network = "sepolia") {
    this.config = NETWORK_CONFIGS[network];
    if (!this.config) {
      throw new Error(`Unsupported network: ${network}`);
    }

    if (!this.config.rpcUrl) {
      throw new Error(
        `RPC URL not configured for ${network}. Check your .env file.`
      );
    }

    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    this.factory = new ethers.Contract(
      this.config.factoryAddress,
      UNISWAP_V2_FACTORY_ABI,
      this.provider
    );

    this.network = network;
    console.log(`🔗 Connected to ${network} network`);
    console.log(`📍 Factory: ${this.config.factoryAddress}`);
  }

  async getTokenInfo(tokenAddress) {
    try {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

      const [name, symbol, decimals, totalSupply] = await Promise.all([
        token.name().catch(() => "Unknown"),
        token.symbol().catch(() => "???"),
        token.decimals().catch(() => 18),
        token.totalSupply().catch(() => 0n),
      ]);

      return {
        address: tokenAddress,
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: totalSupply.toString(),
      };
    } catch (error) {
      return {
        address: tokenAddress,
        name: "Unknown",
        symbol: "???",
        decimals: 18,
        totalSupply: "0",
        error: error.message,
      };
    }
  }

  async getPairInfo(pairAddress) {
    try {
      const pair = new ethers.Contract(
        pairAddress,
        UNISWAP_V2_PAIR_ABI,
        this.provider
      );

      const [token0Address, token1Address, reserves] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves(),
      ]);

      const [token0Info, token1Info] = await Promise.all([
        this.getTokenInfo(token0Address),
        this.getTokenInfo(token1Address),
      ]);

      return {
        pairAddress,
        token0: token0Info,
        token1: token1Info,
        reserve0: ethers.formatUnits(reserves[0], token0Info.decimals),
        reserve1: ethers.formatUnits(reserves[1], token1Info.decimals),
        lastUpdate: new Date(Number(reserves[2]) * 1000).toISOString(),
      };
    } catch (error) {
      return {
        pairAddress,
        error: error.message,
      };
    }
  }

  async getCommonTokens() {
    console.log("📋 Getting common tokens for", this.network);

    const tokens = [];
    for (const [name, address] of Object.entries(this.config.commonTokens)) {
      console.log(`🔍 Fetching ${name}...`);
      const tokenInfo = await this.getTokenInfo(address);
      tokens.push({ name, ...tokenInfo });
    }

    return tokens;
  }

  async discoverTokensFromPairs(startIndex = 0, count = 50) {
    console.log(
      `🔍 Discovering tokens from pairs (${startIndex} to ${
        startIndex + count
      })...`
    );

    try {
      const pairsLength = await this.factory.allPairsLength();
      console.log(`📊 Total pairs in factory: ${pairsLength.toString()}`);

      const endIndex = Math.min(
        Number(startIndex) + count,
        Number(pairsLength)
      );
      const discoveredTokens = new Map();

      for (let i = startIndex; i < endIndex; i++) {
        try {
          const pairAddress = await this.factory.allPairs(i);
          const pairInfo = await this.getPairInfo(pairAddress);

          if (!pairInfo.error) {
            // Add both tokens from the pair
            if (
              pairInfo.token0 &&
              !discoveredTokens.has(pairInfo.token0.address)
            ) {
              discoveredTokens.set(pairInfo.token0.address, pairInfo.token0);
            }
            if (
              pairInfo.token1 &&
              !discoveredTokens.has(pairInfo.token1.address)
            ) {
              discoveredTokens.set(pairInfo.token1.address, pairInfo.token1);
            }

            console.log(
              `✅ Pair ${i}: ${pairInfo.token0.symbol}/${pairInfo.token1.symbol}`
            );
          } else {
            console.log(`❌ Failed to get pair ${i}: ${pairInfo.error}`);
          }
        } catch (error) {
          console.log(`❌ Error processing pair ${i}: ${error.message}`);
        }

        // Add small delay to avoid rate limiting
        if (i % 10 === 0) {
          await this.sleep(100);
        }
      }

      return Array.from(discoveredTokens.values());
    } catch (error) {
      console.error("❌ Error discovering tokens:", error.message);
      return [];
    }
  }

  async findPairsForToken(tokenAddress, maxPairs = 10) {
    console.log(`🔍 Finding pairs for token: ${tokenAddress}`);

    const pairs = [];
    const commonTokenAddresses = Object.values(this.config.commonTokens);

    for (const commonToken of commonTokenAddresses) {
      if (commonToken.toLowerCase() === tokenAddress.toLowerCase()) continue;

      try {
        const pairAddress = await this.factory.getPair(
          tokenAddress,
          commonToken
        );
        if (pairAddress !== ethers.ZeroAddress) {
          const pairInfo = await this.getPairInfo(pairAddress);
          if (!pairInfo.error) {
            pairs.push(pairInfo);
          }
        }
      } catch (error) {
        // Pair doesn't exist, continue
      }

      if (pairs.length >= maxPairs) break;
    }

    return pairs;
  }

  async validateTokensForSwap(tokenA, tokenB) {
    console.log(`🔍 Validating token pair: ${tokenA} <-> ${tokenB}`);

    try {
      // Check if pair exists
      const pairAddress = await this.factory.getPair(tokenA, tokenB);
      if (pairAddress === ethers.ZeroAddress) {
        return {
          valid: false,
          reason: "No liquidity pair exists",
        };
      }

      // Get pair info
      const pairInfo = await this.getPairInfo(pairAddress);
      if (pairInfo.error) {
        return {
          valid: false,
          reason: `Pair error: ${pairInfo.error}`,
        };
      }

      // Check liquidity
      const reserve0 = parseFloat(pairInfo.reserve0);
      const reserve1 = parseFloat(pairInfo.reserve1);

      if (reserve0 === 0 || reserve1 === 0) {
        return {
          valid: false,
          reason: "No liquidity in pair",
        };
      }

      return {
        valid: true,
        pairInfo,
        liquidity: {
          token0: `${reserve0.toFixed(4)} ${pairInfo.token0.symbol}`,
          token1: `${reserve1.toFixed(4)} ${pairInfo.token1.symbol}`,
        },
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Validation error: ${error.message}`,
      };
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  printTokenList(tokens, title = "Tokens") {
    console.log(`\n📋 ${title}`);
    console.log("=".repeat(80));
    console.log("Address".padEnd(45) + "Symbol".padEnd(10) + "Name".padEnd(25));
    console.log("-".repeat(80));

    tokens.forEach((token) => {
      const address = token.address || "N/A";
      const symbol = token.symbol || "???";
      const name = (token.name || "Unknown").substring(0, 24);

      console.log(address.padEnd(45) + symbol.padEnd(10) + name.padEnd(25));
    });
    console.log("=".repeat(80));
  }

  generateSwapScript(tokenA, tokenB) {
    return `
// Add these token addresses to your swap script:
const TOKEN_A = "${tokenA}"; // Replace with actual token address
const TOKEN_B = "${tokenB}"; // Replace with actual token address

// Update your TokenSwapContract address:
const tokenSwapAddress = "YOUR_DEPLOYED_CONTRACT_ADDRESS";

// Example usage:
// await performMarketSwapExact();
// await getQuote(TOKEN_A, TOKEN_B, ethers.parseEther("100"));
`;
  }
}

// Main execution
async function main() {
  try {
    console.log("🚀 Starting Uniswap Token Discovery...");

    // Choose network (sepolia or mainnet)
    const network = process.argv[2] || "sepolia";
    const querier = new UniswapTokenQuerier(network);

    console.log("\n" + "=".repeat(60));
    console.log("🎯 UNISWAP TOKEN DISCOVERY");
    console.log("=".repeat(60));

    // 1. Get common/known tokens
    console.log("\n1️⃣ Getting common tokens...");
    const commonTokens = await querier.getCommonTokens();
    querier.printTokenList(commonTokens, "Common Tokens");

    // 2. Discover tokens from pairs
    console.log("\n2️⃣ Discovering tokens from pairs...");
    const discoveredTokens = await querier.discoverTokensFromPairs(0, 100);
    querier.printTokenList(discoveredTokens, "Discovered Tokens");

    // 3. Validate some token pairs
    console.log("\n3️⃣ Validating token pairs...");
    if (commonTokens.length >= 2) {
      const tokenA = commonTokens[0].address;
      const tokenB = commonTokens[1].address;

      const validation = await querier.validateTokensForSwap(tokenA, tokenB);
      console.log(
        `\n🔍 Validation for ${commonTokens[0].symbol}/${commonTokens[1].symbol}:`
      );

      if (validation.valid) {
        console.log("✅ Valid pair with liquidity:");
        console.log(`   Pair: ${validation.pairInfo.pairAddress}`);
        console.log(
          `   Liquidity: ${validation.liquidity.token0} | ${validation.liquidity.token1}`
        );

        console.log("\n📝 Generated script snippet:");
        console.log(querier.generateSwapScript(tokenA, tokenB));
      } else {
        console.log(`❌ Invalid: ${validation.reason}`);
      }
    }

    // 4. Find pairs for a specific token
    if (commonTokens.length > 0) {
      console.log("\n4️⃣ Finding pairs for WETH...");
      const wethPairs = await querier.findPairsForToken(
        querier.config.wethAddress,
        5
      );

      console.log(`\n🔍 Found ${wethPairs.length} pairs for WETH:`);
      wethPairs.forEach((pair, index) => {
        console.log(
          `${index + 1}. ${pair.token0.symbol}/${pair.token1.symbol} - ${
            pair.pairAddress
          }`
        );
        console.log(
          `   Reserves: ${parseFloat(pair.reserve0).toFixed(4)} | ${parseFloat(
            pair.reserve1
          ).toFixed(4)}`
        );
      });
    }

    console.log("\n✅ Token discovery completed!");
    console.log("\n💡 To use these tokens in your swap script:");
    console.log("   1. Copy the token addresses above");
    console.log("   2. Replace TOKEN_A and TOKEN_B in your script");
    console.log("   3. Make sure your contract is deployed");
    console.log("   4. Ensure you have token balances for testing");
  } catch (error) {
    console.error("❌ Fatal error:", error.message);
    process.exit(1);
  }
}

// Export for use as module
module.exports = { UniswapTokenQuerier, NETWORK_CONFIGS };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

// Usage examples:
// node query-tokens.js sepolia
// node query-tokens.js mainnet
