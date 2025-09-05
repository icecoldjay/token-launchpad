const { ethers } = require('ethers');
const dotenv = require("dotenv");
const tokenAbi = require('../constants/tokenTemplateAbi')

dotenv.config();

// Initialize provider and signer
const rpcUrl = process.env.SEPOLIA_RPC_URL
const provider = new ethers.JsonRpcProvider(rpcUrl);

const privateKey = process.env.OWNER_PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey, provider);

const tokenTemplateAddress = "0x64a72e8a9A71289f9024Bef8b1211249192c79D4";
const tokenTemplate = new ethers.Contract(tokenTemplateAddress, tokenAbi.tokenAbi, wallet);

async function interactWithTokenTemplate() {
    // Enable trading (only owner)
    try {
        const tx = await tokenTemplate.enableTrading();
        await tx.wait();
        console.log("Trading enabled!");
        
        // Listen for TradingEnabled event
        tokenTemplate.on("TradingEnabled", (timestamp) => {
            console.log(`Trading enabled at ${new Date(timestamp * 1000)}`);
        });
    } catch (error) {
        console.error("Error enabling trading:", error.message);
    }

    // Configure anti-bot settings
    try {
        const tx1 = await tokenTemplate.setAntiBotEnabled(true);
        const tx2 = await tokenTemplate.setMaxTxAmount(ethers.parseEther("1000"));
        const tx3 = await tokenTemplate.setMaxWalletAmount(ethers.parseEther("5000"));
        
        await Promise.all([tx1.wait(), tx2.wait(), tx3.wait()]);
        console.log("Anti-bot settings configured");
    } catch (error) {
        console.error("Error configuring anti-bot:", error.message);
    }

    // Check trading status
    const isTradingEnabled = await tokenTemplate.tradingEnabled();
    console.log(`Trading is currently ${isTradingEnabled ? "enabled" : "disabled"}`);
}

interactWithTokenTemplate();