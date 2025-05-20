const { ethers } = require('ethers');
const dotenv = require('dotenv');
const transactionBundlerAbi = require('../constants/transactionBundlerAbi');
const { tokenAddress, recipientAddress, someContractAddress } = require('../helper-hardhat-config');
dotenv.config();

console.log("Script started - initializing...");

// ==============
// Configuration
// ==============
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

// ==================
// Provider Setup
// ==================
console.log("Connecting to provider at:", rpcUrl);
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
console.log("Wallet address:", wallet.address);

const transactionBundlerAddress = "0xA2d768ADa18D27799B24c2C36C473CE312E7481e";
console.log("Using transaction bundler at:", transactionBundlerAddress);

if (!transactionBundlerAbi.transactionBundlerAbi) {
    console.error("ERROR: transactionBundlerAbi does not have the expected format");
    process.exit(1);
}

const transactionBundler = new ethers.Contract(
    transactionBundlerAddress,
    transactionBundlerAbi.transactionBundlerAbi,
    wallet
);

// ==================
// Main Function
// ==================
async function executeBundle() {
    console.log("Starting transaction bundle execution...");

    // ==================
    // Transaction Setup
    // ==================
    const amount = ethers.parseEther("100");
    
    // Transaction 1: ERC20 transfer
    const transferData = new ethers.Interface([
        "function transfer(address to, uint256 amount) returns (bool)"
    ]).encodeFunctionData("transfer", [recipientAddress, amount]);
    
    // Transaction 2: Contract call with ETH
    const callData = new ethers.Interface([
        "function doSomething(uint256 param)"
    ]).encodeFunctionData("doSomething", [123]);

    const transactions = [
        {
            target: tokenAddress,
            value: 0,
            data: transferData
        },
        {
            target: someContractAddress,
            value: ethers.parseEther("0.1"), // Send 0.1 ETH
            data: callData
        }
    ];

    // Calculate total ETH needed
    const totalEth = transactions.reduce((sum, tx) => sum + tx.value, 0n);
    console.log("Total ETH required:", ethers.formatEther(totalEth));

    // ==================
    // Event Listeners
    // ==================
    transactionBundler.on("BundleExecuted", (bundleId, executor, count) => {
        console.log(`\nBundle ${bundleId} executed by ${executor}`);
        console.log(`Successfully processed ${count} transactions`);
    });

    transactionBundler.on("TransactionFailed", (bundleId, index, reason) => {
        console.error(`\nTransaction ${index} in bundle ${bundleId} failed`);
        console.error("Reason:", reason);
    });

    // ==================
    // Execution
    // ==================
    try {
        console.log("\nExecuting bundle...");
        const tx = await transactionBundler.executeBundle(transactions, {
            value: totalEth,
            gasLimit: 3000000
        });

        console.log("Transaction sent! Hash:", tx.hash);
        console.log("Waiting for confirmation...");
        
        const receipt = await tx.wait();
        console.log("\nTransaction confirmed in block:", receipt.blockNumber);
        console.log("Bundle executed successfully!");

    } catch (error) {
        console.error("\nERROR during bundle execution:");
        if (error.receipt) {
            console.error("Failed in block:", error.receipt.blockNumber);
        }
        console.error("Reason:", error.reason || error.message);
    } finally {
        // Clean up listeners
        transactionBundler.removeAllListeners();
    }
}

// ==================
// Script Execution
// ==================
(async () => {
    try {
        console.log("\nStarting script execution...");
        await executeBundle();
        console.log("\nScript completed successfully!");
    } catch (error) {
        console.error("\nFATAL ERROR in script execution:");
        console.error(error);
        process.exit(1);
    }
})();