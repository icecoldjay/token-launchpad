const { ethers } = require('ethers');
const dotenv = require('dotenv');
const liquidityManagerAbi = require('../constants/liquidityManagerAbi');
const tokenAbi = require('../constants/tokenTemplateAbi');
dotenv.config();

console.log("Script started - initializing LiquidityManagerV2 operations...");

// ======================
// Configuration Checks
// ======================
const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) {
    console.error("ERROR: RPC_URL is not defined in .env file");
    process.exit(1);
}

const privateKey = process.env.OWNER_PRIVATE_KEY;
if (!privateKey) {
    console.error("ERROR: PRIVATE_KEY is not defined in .env file");
    process.exit(1);
}

// ======================
// Provider Setup
// ======================
console.log("Connecting to provider at:", rpcUrl);
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
console.log("Wallet address:", wallet.address);

const liquidityManagerAddress = "0xebc9642aD5A355D3D4183243A870F71d4fA9564E";
if (!liquidityManagerAddress) {
    console.error("ERROR: LIQUIDITY_MANAGER_ADDRESS is not defined in .env file");
    process.exit(1);
}

const TOKEN_A = "0x57E8EEf14E0878cA6789642a7Ae530567De0F562";
if (!TOKEN_A) {
    console.error("ERROR: TOKEN_A_ADDRESS is not defined in .env file");
    process.exit(1);
}

const TOKEN_B = "0x6f10f7F0af427CEf3aAfc7f31aE15497AD85048a";
if (!TOKEN_B) {
    console.error("ERROR: TOKEN_B_ADDRESS is not defined in .env file");
    process.exit(1);
}

console.log("Using liquidity manager at:", liquidityManagerAddress);
console.log("Token A:", TOKEN_A);
console.log("Token B:", TOKEN_B);

// Factory ABI
const factoryAbi = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function createPair(address tokenA, address tokenB) returns (address pair)"
];

// ======================
// Contract Initialization
// ======================
const liquidityManager = new ethers.Contract(
    liquidityManagerAddress,
    liquidityManagerAbi.abi,
    wallet
);

// ======================
// Main Function
// ======================
async function addLiquidity() {
    try {
        // Connect to tokens
        const tokenA = new ethers.Contract(TOKEN_A, tokenAbi.abi, wallet);
        const tokenB = new ethers.Contract(TOKEN_B, tokenAbi.abi, wallet);
        
        // Get token details
        const tokenASymbol = await tokenA.symbol();
        const tokenBSymbol = await tokenB.symbol();
        const decimalsA = await tokenA.decimals();
        const decimalsB = await tokenB.decimals();
        console.log(`Token A (${tokenASymbol}): ${TOKEN_A} - Decimals: ${decimalsA}`);
        console.log(`Token B (${tokenBSymbol}): ${TOKEN_B} - Decimals: ${decimalsB}`);
        
        // Check token balances
        const balanceA = await tokenA.balanceOf(wallet.address);
        const balanceB = await tokenB.balanceOf(wallet.address);
        console.log(`Token A balance: ${ethers.formatUnits(balanceA, decimalsA)} ${tokenASymbol}`);
        console.log(`Token B balance: ${ethers.formatUnits(balanceB, decimalsB)} ${tokenBSymbol}`);
        
        // Define amounts (adjust as needed)
        const amountA = ethers.parseUnits('10', decimalsA);
        const amountB = ethers.parseUnits('10', decimalsB);
        
        // Minimum amounts (95% of desired amounts)
        const amountAMin = amountA * 95n / 100n;
        const amountBMin = amountB * 95n / 100n;
        
        // Lock duration in seconds (0 for no lock)
        const lockDuration = 0; // Change this if you want to lock liquidity
        
        // Check if we have enough balance
        if (balanceA < amountA) {
            console.error(`Not enough ${tokenASymbol}. Have: ${ethers.formatUnits(balanceA, decimalsA)}, Need: ${ethers.formatUnits(amountA, decimalsA)}`);
            return;
        }
        
        if (balanceB < amountB) {
            console.error(`Not enough ${tokenBSymbol}. Have: ${ethers.formatUnits(balanceB, decimalsB)}, Need: ${ethers.formatUnits(amountB, decimalsB)}`);
            return;
        }
        
        // Get router address
        const routerAddress = await liquidityManager.router();
        console.log("Router address:", routerAddress);
        
        // Get WETH address
        const wethAddress = await liquidityManager.weth();
        console.log("WETH address:", wethAddress);
        
        // Create a router contract to get the factory address
        const routerAbi = ["function factory() view returns (address)"];
        const router = new ethers.Contract(routerAddress, routerAbi, provider);
        const factoryAddress = await router.factory();
        console.log("Factory address:", factoryAddress);
        
        // Create a factory contract
        const factory = new ethers.Contract(factoryAddress, factoryAbi, provider);
        
        // First check if we need to create the pair
        console.log('Checking if pair exists...');
        const existingPair = await factory.getPair(TOKEN_A, TOKEN_B);
        
        if (existingPair === ethers.ZeroAddress) {
            console.log('Pair does not exist, creating pair...');
            const createPairTx = await liquidityManager.createPair(TOKEN_A, TOKEN_B);
            console.log(`Create pair transaction submitted: ${createPairTx.hash}`);
            await createPairTx.wait();
            console.log(`Pair created successfully`);
        } else {
            console.log(`Pair already exists at: ${existingPair}`);
        }
        
        // Double check approvals
        const allowanceA = await tokenA.allowance(wallet.address, liquidityManagerAddress);
        const allowanceB = await tokenB.allowance(wallet.address, liquidityManagerAddress);
        console.log(`Token A allowance: ${ethers.formatUnits(allowanceA, decimalsA)} ${tokenASymbol}`);
        console.log(`Token B allowance: ${ethers.formatUnits(allowanceB, decimalsB)} ${tokenBSymbol}`);
        
        console.log('Adding liquidity...');
        
        // Determine if either token is WETH
        console.log(`WETH address: ${wethAddress}`);
        
        let tx;
        if (TOKEN_A.toLowerCase() === wethAddress.toLowerCase() || TOKEN_B.toLowerCase() === wethAddress.toLowerCase()) {
            // Handle ETH pair (one token + ETH)
            const isTokenAWeth = TOKEN_A.toLowerCase() === wethAddress.toLowerCase();
            const tokenAddress = isTokenAWeth ? TOKEN_B : TOKEN_A;
            const tokenAmount = isTokenAWeth ? amountB : amountA;
            const tokenMinAmount = isTokenAWeth ? amountBMin : amountAMin;
            const ethAmount = isTokenAWeth ? amountA : amountB;
            const ethMinAmount = isTokenAWeth ? amountAMin : amountBMin;
            
            console.log(`Adding liquidity with ETH: ${ethers.formatEther(ethAmount)} ETH + ${ethers.formatUnits(tokenAmount, isTokenAWeth ? decimalsB : decimalsA)} ${isTokenAWeth ? tokenBSymbol : tokenASymbol}`);
            
            tx = await liquidityManager.addLiquidityETH(
                tokenAddress,        // token
                tokenAmount,         // amountToken
                tokenMinAmount,      // amountTokenMin
                ethMinAmount,        // amountETHMin
                lockDuration,        // lockDuration
                { value: ethAmount } // ETH value
            );
        } else {
            // Handle regular token pair
            console.log(`Adding liquidity with tokens: ${ethers.formatUnits(amountA, decimalsA)} ${tokenASymbol} + ${ethers.formatUnits(amountB, decimalsB)} ${tokenBSymbol}`);
            
            tx = await liquidityManager.addLiquidity(
                TOKEN_A,         // tokenA
                TOKEN_B,         // tokenB
                amountA,         // amountA
                amountB,         // amountB
                amountAMin,      // amountAMin
                amountBMin,      // amountBMin
                lockDuration     // lockDuration
            );
        }
        
        console.log(`Transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log('Transaction confirmed!');
        
        // Parse events to find liquidity details
        for (const log of receipt.logs) {
            try {
                const parsedLog = liquidityManager.interface.parseLog(log);
                if (parsedLog && parsedLog.name === 'LiquidityAdded') {
                    console.log('✅ Success! Liquidity added:');
                    console.log(`  Pair: ${parsedLog.args.pair}`);
                    console.log(`  Token A: ${parsedLog.args.tokenA}`);
                    console.log(`  Token B: ${parsedLog.args.tokenB}`);
                    console.log(`  Amount A: ${ethers.formatUnits(parsedLog.args.amountA, decimalsA)} ${tokenASymbol}`);
                    console.log(`  Amount B: ${ethers.formatUnits(parsedLog.args.amountB, decimalsB)} ${tokenBSymbol}`);
                    console.log(`  Liquidity tokens: ${parsedLog.args.liquidity.toString()}`);
                    break;
                }
            } catch (e) {
                // Skip logs that can't be parsed
            }
        }
        
        // If liquidity was locked, show details
        if (lockDuration > 0) {
            const pair = await factory.getPair(TOKEN_A, TOKEN_B);
            const lockInfo = await liquidityManager.liquidityLocks(pair);
            console.log(`Liquidity locked until: ${new Date(Number(lockInfo.unlockTime) * 1000).toLocaleString()}`);
        }
        
    } catch (error) {
        console.error('Error adding liquidity:', error);
        
        // Provide more detailed error information
        if (error.reason) {
            console.error('Error reason:', error.reason);
        }
        
        if (error.data) {
            console.error('Error data:', error.data);
        }
        
        if (error.transaction) {
            console.error('Failed transaction details:', {
                to: error.transaction.to,
                from: error.transaction.from,
                data: error.transaction.data.substring(0, 66) + '...' // Show just the function selector
            });
        }
    }
}

// ======================
// Script Execution
// ======================
(async () => {
    try {
        console.log("\nStarting script execution...");
        await addLiquidity();
        console.log("\nScript completed successfully!");
    } catch (error) {
        console.error("\nFATAL ERROR in script execution:");
        console.error(error);
        process.exit(1);
    }
})();