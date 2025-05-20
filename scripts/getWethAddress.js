const { ethers } = require('ethers');
const dotenv = require('dotenv');
dotenv.config();

// Initialize provider and signer
const rpcUrl = process.env.SEPOLIA_RPC_URL;
const provider = new ethers.JsonRpcProvider(rpcUrl);

const privateKey = process.env.OWNER_PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey, provider);

// Define the LiquidityManager contract address
const liquidityManagerAddress = "0xa444eEB385695269251d87026Ce7624c127A613A";

// Define minimal ABIs for both contracts
const liquidityManagerAbi = [
  {
    "inputs": [],
    "name": "positionManager",
    "outputs": [{"internalType": "contract INonfungiblePositionManager", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
];

const positionManagerAbi = [
  {
    "inputs": [],
    "name": "WETH9",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function getWETH9Address() {
  try {
    console.log("Connecting to LiquidityManager at:", liquidityManagerAddress);
    
    // Create contract instance with a minimal ABI
    const liquidityManager = new ethers.Contract(
      liquidityManagerAddress, 
      liquidityManagerAbi, 
      provider
    );
    
    // Get the position manager address
    const positionManagerAddress = await liquidityManager.positionManager();
    console.log("Position Manager Address:", positionManagerAddress);
    
    if (!positionManagerAddress || positionManagerAddress === ethers.ZeroAddress) {
      throw new Error("Invalid position manager address");
    }
    
    // Create a contract instance for the Position Manager
    const positionManager = new ethers.Contract(
      positionManagerAddress, 
      positionManagerAbi, 
      provider
    );
    
    // Call the WETH9() function
    const weth9Address = await positionManager.WETH9();
    console.log("WETH9 Address:", weth9Address);
    
    return weth9Address;
  } catch (error) {
    console.error("Error getting WETH9 address:", error);
  }
}

// Execute the function
getWETH9Address()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });