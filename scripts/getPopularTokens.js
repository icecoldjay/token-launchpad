const axios = require("axios");

// Network configurations for Moralis API calls
const NETWORKS = {
  "bsc-testnet": {
    name: "BSC Testnet",
    chainId: "0x61",
    moralisChain: "bsc testnet",
  },
  "eth-sepolia": {
    name: "Ethereum Sepolia",
    chainId: "0xaa36a7",
    moralisChain: "sepolia",
  },
  "avalanche-fuji": {
    name: "Avalanche Fuji",
    chainId: "0xa86a",
    moralisChain: "0xa86a",
  },
  "arbitrum-sepolia": {
    name: "Arbitrum Sepolia",
    chainId: "0x66eee",
    moralisChain: "arbitrum testnet",
  },
  "base-testnet": {
    name: "Base Testnet",
    chainId: "0x14a33",
    moralisChain: "base sepolia",
  },
  "polygon-amoy": {
    name: "Polygon Amoy",
    chainId: "0x13882",
    moralisChain: "0x13882",
  },
  bsc: {
    name: "Binance Smart Chain",
    chainId: "0x38",
    moralisChain: "bsc",
  },
  ethereum: {
    name: "Ethereum Mainnet",
    chainId: "0x1",
    moralisChain: "eth",
  },
  polygon: {
    name: "Polygon",
    chainId: "0x89",
    moralisChain: "polygon",
  },
  avalanche: {
    name: "Avalanche",
    chainId: "0xa86a",
    moralisChain: "avalanche",
  },
  arbitrum: {
    name: "Arbitrum One",
    chainId: "0xa4b1",
    moralisChain: "arbitrum",
  },
  base: {
    name: "Base",
    chainId: "0x2105",
    moralisChain: "base",
  },
};

const MORALIS_API_KEY =
  process.env.MORALIS_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjU3ZTk5ZGE0LTAwOWQtNDcwMC04MDhmLTI5YWYxYThkMWIwMiIsIm9yZ0lkIjoiMzIzOTI0IiwidXNlcklkIjoiMzMzMDEzIiwidHlwZUlkIjoiM2NhNzFhODgtNDg0NS00YWRlLThhMDUtOTdhYjM2YzhjMjc3IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MDE2MTU3NDAsImV4cCI6NDg1NzM3NTc0MH0.XRuldEO34RKePPlD5ZjRO1EM04Csq-QaWrUJFWbZk58";

class MoralisTokenFetcher {
  constructor(apiKey = MORALIS_API_KEY) {
    this.apiKey = apiKey;
    this.rateLimitDelay = 1000;
    this.baseUrl = "https://deep-index.moralis.io/api/v2.2";
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  validateApiKey() {
    if (!this.apiKey || this.apiKey === "YOUR-MORALIS-API-KEY") {
      console.error("Error: Please set your Moralis API key!");
      return false;
    }
    return true;
  }

  getHeaders() {
    return {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async fetchPopularTokens(networkKey, limit = 10) {
    if (!this.validateApiKey()) return [];

    const network = NETWORKS[networkKey];
    if (!network) {
      console.error(`Network '${networkKey}' not supported.`);
      console.log("Available networks:", Object.keys(NETWORKS).join(", "));
      return [];
    }

    console.log(`Fetching popular tokens from ${network.name}...`);

    try {
      const response = await axios.get(`${this.baseUrl}/tokens/trending`, {
        headers: this.getHeaders(),
        params: {
          chain: network.moralisChain,
          limit: limit,
        },
      });

      const tokens = this.formatTokenData(
        response.data.tokens,
        network.chainId
      );
      console.log(`Found ${tokens.length} tokens\n`);
      return tokens;
    } catch (error) {
      this.handleError(error, networkKey);
      return [];
    }
  }

  formatTokenData(data, chainId) {
    if (!data || !Array.isArray(data)) return [];

    return data.map((token) => ({
      chainId: chainId,
      tokenAddress: token.address,
      name: token.name || "Unknown",
      uniqueName:
        token.unique_name || token.name?.toLowerCase().replace(/\s+/g, "-"),
      symbol: token.symbol || "N/A",
      decimals: token.decimals || 18,
      logo: token.logo,
      usdPrice: token.usd_price || 0,
      createdAt: token.created_at,
      marketCap: token.market_cap || 0,
    }));
  }

  handleError(error, networkKey = "") {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || error.response.statusText;

      switch (status) {
        case 401:
          console.error("Authentication failed. Check your Moralis API key.");
          break;
        case 429:
          console.error(
            "Rate limit exceeded. Please wait before making more requests."
          );
          break;
        case 400:
          console.error(`Bad request: ${message}`);
          break;
        default:
          console.error(`API Error (${status}): ${message}`);
      }
    } else {
      console.error(`Error: ${error.message}`);
    }
  }

  async fetchAllNetworks(limit = 10) {
    const results = {};
    for (const networkKey of Object.keys(NETWORKS)) {
      results[networkKey] = await this.fetchPopularTokens(networkKey, limit);
      await this.delay(this.rateLimitDelay);
    }
    return results;
  }
}

// Usage
async function main() {
  const fetcher = new MoralisTokenFetcher();
  const selectedNetwork = process.argv[2] || "ethereum";
  const limit = parseInt(process.argv[3]) || 10;

  console.log("Available networks:", Object.keys(NETWORKS).join(", "), "all\n");

  if (selectedNetwork === "all") {
    const allResults = await fetcher.fetchAllNetworks(limit);
    console.log(JSON.stringify(allResults, null, 2));
  } else {
    const tokens = await fetcher.fetchPopularTokens(selectedNetwork, limit);
    console.log(JSON.stringify(tokens, null, 2));
  }
}

main().catch(console.error);

module.exports = { MoralisTokenFetcher, NETWORKS };
