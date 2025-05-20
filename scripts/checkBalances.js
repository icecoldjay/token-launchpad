const { ethers } = require("ethers");
require("dotenv").config();

// Configuration
const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY";
const WALLET_ADDRESS = "0xb799B0857C48f96E24e4295FD961043856b847eB";
const TOKENS_TO_CHECK = [
  // Add token contracts you want to check
  {
    name: "WETH",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    decimals: 18,
  },
  {
    name: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
  },
];

// ERC20 ABI (simplified balanceOf)
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function checkBalances() {
  console.log("=== Wallet Balance Checker ===");

  // 1. Setup Provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  console.log(`Connected to ${RPC_URL}`);

  // 2. Check ETH Balance
  const ethBalance = await provider.getBalance(WALLET_ADDRESS);
  console.log("\nETH Balance:");
  console.log(`• Raw: ${ethBalance.toString()}`);
  console.log(`• Formatted: ${ethers.formatEther(ethBalance)} ETH`);

  // 3. Check Token Balances
  console.log("\nToken Balances:");

  for (const token of TOKENS_TO_CHECK) {
    try {
      const contract = new ethers.Contract(token.address, ERC20_ABI, provider);

      // Get balance and decimals
      const [balance, decimals] = await Promise.all([
        contract.balanceOf(WALLET_ADDRESS),
        contract.decimals(),
      ]);

      // Format balance
      const formatted = ethers.formatUnits(balance, decimals);

      console.log(`\n${token.name} (${token.address}):`);
      console.log(`• Raw: ${balance.toString()}`);
      console.log(`• Formatted: ${formatted} ${token.name}`);
    } catch (error) {
      console.error(`Error checking ${token.name} balance:`, error.message);
    }
  }

  console.log("\n=== Balance Check Complete ===");
}

// Run with error handling
(async () => {
  try {
    await checkBalances();
  } catch (error) {
    console.error("Fatal error in balance check:", error);
    process.exit(1);
  }
})();
