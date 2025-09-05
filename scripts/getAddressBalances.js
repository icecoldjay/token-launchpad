const { ethers } = require("ethers");

// Configuration
const ALCHEMY_API_KEY = "your-alchemy-api-key-here";
const WALLET_ADDRESS = "0xb799B0857C48f96E24e4295FD961043856b847eB"; // Example address

// ERC-20 ABI for getting token info
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

async function getTokenBalances(walletAddress) {
  try {
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(
      "https://eth-sepolia.g.alchemy.com/v2/VYs_APvI61i76a4y_cWaDlETPQ0rXlHY"
    );

    // Get token balances using Alchemy API
    const response = await fetch(
      "https://eth-sepolia.g.alchemy.com/v2/VYs_APvI61i76a4y_cWaDlETPQ0rXlHY",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "alchemy_getTokenBalances",
          params: [walletAddress],
        }),
      }
    );

    const data = await response.json();
    const tokenBalances = data.result.tokenBalances;

    console.log(
      `Found ${tokenBalances.length} tokens for address: ${walletAddress}\n`
    );

    // Process each token
    for (const token of tokenBalances) {
      const tokenAddress = token.contractAddress;
      const rawBalance = token.tokenBalance;

      // Skip tokens with zero balance
      if (rawBalance === "0x0" || rawBalance === "0x") continue;

      try {
        // Create contract instance
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ERC20_ABI,
          provider
        );

        // Get token metadata
        const [name, symbol, decimals] = await Promise.all([
          tokenContract.name(),
          tokenContract.symbol(),
          tokenContract.decimals(),
        ]);

        // Convert balance to human readable format
        const balance = ethers.formatUnits(rawBalance, decimals);

        console.log(`Token: ${name} (${symbol})`);
        console.log(`Contract: ${tokenAddress}`);
        console.log(`Balance: ${parseFloat(balance).toFixed(6)}`);
        console.log(`Decimals: ${decimals}`);
        console.log("---");
      } catch (error) {
        console.log(
          `Error fetching metadata for ${tokenAddress}: ${error.message}`
        );
        console.log("---");
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Run the script
getTokenBalances(WALLET_ADDRESS);
