const { ethers } = require('ethers');
const dotenv = require('dotenv');
dotenv.config();

// Initialize provider and signer
console.log("Script started - approving tokens...");

const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) {
    console.error("ERROR: SEPOLIA_RPC_URL is not defined in .env file");
    process.exit(1);
}

const privateKey = process.env.OWNER_PRIVATE_KEY;
if (!privateKey) {
    console.error("ERROR: OWNER_PRIVATE_KEY is not defined in .env file");
    process.exit(1);
}

console.log("Connecting to provider...");
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
console.log("Wallet address:", wallet.address);

// Token addresses
const TOKEN_A = "0x822639F1319b370Af2c1375198762e89C902a517"; // Your ERC20 token
const TOKEN_B = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH on Sepolia
const TOKEN_C = "0x385714D746DDD70D51429D7e3F7401e611ea95F9";
const LIQUIDITY_MANAGER = "0xDc7F8Fe7012a6A918F2d4DD79d6e69c4b0b51cAD";
const positionManagerAddress = "0x1238536071E1c677A632429e3655c799b22cDA52"; // Uniswap V3 Position Manager on Sepolia

// Basic ERC20 ABI (just what we need for approval)
const erc20Abi = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

// WETH ABI (includes deposit/withdraw)
const wethAbi = [
    ...erc20Abi,
    "function deposit() public payable",
    "function withdraw(uint wad) public"
];

async function approveToken(tokenAddress, tokenAbi, spenderAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, wallet);
    
    try {
        // Get token info
        const symbol = await tokenContract.symbol();
        const decimals = await tokenContract.decimals();
        console.log(`\nProcessing token: ${symbol} (${decimals} decimals)`);
        
        // Check current balance
        const balance = await tokenContract.balanceOf(wallet.address);
        console.log(`Your balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
        
        // Check current allowance
        const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
        console.log(`Current allowance: ${ethers.formatUnits(currentAllowance, decimals)} ${symbol}`);
        
        // For WETH, we need to ensure we have enough balance
        if (tokenAddress === TOKEN_B) {
            const ethBalance = await provider.getBalance(wallet.address);
            console.log(`Your ETH balance: ${ethers.formatEther(ethBalance)} ETH`);
            
            // Convert some ETH to WETH if needed
            if (balance < ethers.parseEther("0.1")) {
                console.log("Converting 0.1 ETH to WETH...");
                const wethContract = new ethers.Contract(TOKEN_B, wethAbi, wallet);
                const tx = await wethContract.deposit({ value: ethers.parseEther("0.1") });
                await tx.wait();
                console.log("ETH converted to WETH");
            }
        }
        
        // Only approve if current allowance is less than our target
        const targetAllowance = ethers.MaxUint256; // Approve maximum possible
        if (currentAllowance >= ethers.parseEther("10000")) {
            console.log("Sufficient allowance already exists");
            return true;
        }
        
        // Send approval transaction
        console.log(`Approving unlimited ${symbol} for liquidity manager...`);
        const tx = await tokenContract.approve(spenderAddress, targetAllowance);
        console.log("Transaction sent:", tx.hash);
        
        console.log("Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log(`Confirmed in block ${receipt.blockNumber}`);
        
        // Verify new allowance
        const newAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
        console.log(`New allowance: ${ethers.formatUnits(newAllowance, decimals)} ${symbol}`);
        
        return true;
    } catch (error) {
        console.error(`Error approving token at ${tokenAddress}:`, error.message);
        
        if (error.info && error.info.error) {
            console.error("RPC error:", error.info.error.message);
        }
        
        if (error.revert && error.revert.args && error.revert.args[0]) {
            console.error("Revert reason:", error.revert.args[0]);
        }
        
        return false;
    }
}

async function approveAllTokens() {
    console.log("\n=== Approving Token A ===");
    const tokenASuccess = await approveToken(TOKEN_A, erc20Abi, positionManagerAddress);
    
    // console.log("\n=== Approving Token B (WETH) ===");
    // const tokenBSuccess = await approveToken(TOKEN_B, wethAbi, LIQUIDITY_MANAGER);

    console.log("\n=== Approving Token C ===");
    const tokenCSuccess = await approveToken(TOKEN_C, erc20Abi, positionManagerAddress);
    
    if (tokenASuccess && tokenBSuccess) {
        console.log("\nAll approvals completed successfully!");
    } else {
        console.log("\nSome approvals failed. Check the errors above.");
    }
}

// Run the approval function
(async () => {
    try {
        await approveAllTokens();
    } catch (error) {
        console.error("FATAL ERROR:", error);
    }
})();