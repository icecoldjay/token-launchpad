const { ethers } = require('ethers');
const dotenv = require('dotenv');
const liquidityManagerAbi = require('../constants/liquidityManager');
const tokenAbi = require('../constants/tokenTemplateAbi');
dotenv.config();

// Configuration
const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.OWNER_PRIVATE_KEY;
const liquidityManagerAddress = "0xbC53a05dBEB2c73c4b29822427372df11bc333C4";
const TOKEN_A = "0x822639F1319b370Af2c1375198762e89C902a517";
const TOKEN_B = "0x385714D746DDD70D51429D7e3F7401e611ea95F9";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Setup provider and wallet
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

// Contract interfaces
const liquidityManager = new ethers.Contract(
  liquidityManagerAddress,
  liquidityManagerAbi.liquidityManagerAbi,
  wallet
);

/**
 * Debugging utility for testing each step of the createLiquidityPool process
 * We'll test each internal function mentioned in the contract:
 * 1. _prepareTokensAndAmounts
 * 2. _initializePoolIfNeeded
 * 3. _approveTokensForPositionManager
 * 4. _mintPosition
 * 5. _handleLocking
 */

// Helper to format error details
function formatError(error) {
  const details = {
    message: error.message,
    reason: error.reason || 'Unknown reason',
    code: error.code || 'Unknown code'
  };

  if (error.data) {
    try {
      // Try to decode the revert reason if available
      details.decodedData = ethers.toUtf8String('0x' + error.data.slice(138));
    } catch (e) {
      details.decodedData = 'Could not decode error data';
    }
  }

  return details;
}

// Test individual steps
async function testPrepareTokensAndAmounts() {
  console.log("\n===== TESTING _prepareTokensAndAmounts =====");
  
  try {
    const tokenA = new ethers.Contract(TOKEN_A, tokenAbi.tokenAbi, wallet);
    const tokenB = new ethers.Contract(TOKEN_B, tokenAbi.tokenAbi, wallet);
    
    const decimalsA = await tokenA.decimals();
    const decimalsB = await tokenB.decimals();
    
    // Check token balances
    const balanceA = await tokenA.balanceOf(wallet.address);
    const balanceB = await tokenB.balanceOf(wallet.address);
    console.log(`Token A balance: ${ethers.formatUnits(balanceA, decimalsA)}`);
    console.log(`Token B balance: ${ethers.formatUnits(balanceB, decimalsB)}`);
    
    // Since we can't directly call internal functions, we'll create a small test transaction
    // that only does token transfers to simulate what _prepareTokensAndAmounts would do
    
    // We'll modify createLiquidityPool to ONLY run the first step
    const amountA = ethers.parseUnits('0.1', decimalsA); // Very small amount for testing
    const amountB = ethers.parseUnits('0.1', decimalsB);
    
    // Step 1: Check if Token A is WETH (we'd need to handle ETH->WETH conversion)
    const isAnyTokenWeth = TOKEN_A === WETH_ADDRESS || TOKEN_B === WETH_ADDRESS;
    console.log(`Is any token WETH: ${isAnyTokenWeth}`);
    
    // Step 2: Check token ordering (token0 should be the one with lower address)
    const token0 = TOKEN_A < TOKEN_B ? TOKEN_A : TOKEN_B;
    const token1 = TOKEN_A < TOKEN_B ? TOKEN_B : TOKEN_A;
    console.log(`Token0 (lower address): ${token0}`);
    console.log(`Token1 (higher address): ${token1}`);
    
    // Step 3: Check if we need to swap amounts based on token order
    const amount0 = TOKEN_A === token0 ? amountA : amountB;
    const amount1 = TOKEN_A === token0 ? amountB : amountA;
    console.log(`Amount for token0: ${ethers.formatUnits(amount0, TOKEN_A === token0 ? decimalsA : decimalsB)}`);
    console.log(`Amount for token1: ${ethers.formatUnits(amount1, TOKEN_A === token0 ? decimalsB : decimalsA)}`);

    console.log("✅ _prepareTokensAndAmounts simulation successful");
    return { token0, token1, amount0, amount1, decimalsA, decimalsB };
  } catch (error) {
    console.error("❌ _prepareTokensAndAmounts simulation failed:", formatError(error));
    throw error;
  }
}

async function testInitializePoolIfNeeded(token0, token1) {
  console.log("\n===== TESTING _initializePoolIfNeeded =====");
  
  try {
    // Get the factory address from position manager
    const positionManagerAddress = await liquidityManager.positionManager();
    console.log(`Position Manager Address: ${positionManagerAddress}`);
    
    // Let's create a minimal ABI for the position manager to check factory
    const positionManagerMinAbi = [
      "function factory() external view returns (address)"
    ];
    
    const positionManager = new ethers.Contract(
      positionManagerAddress,
      positionManagerMinAbi,
      provider
    );
    
    // Get factory address
    try {
      const factoryAddress = await positionManager.factory();
      console.log(`Factory Address: ${factoryAddress}`);
      
      // Create a minimal factory ABI to check pool existence
      const factoryMinAbi = [
        "function getPool(address, address, uint24) external view returns (address)"
      ];
      
      const factory = new ethers.Contract(
        factoryAddress,
        factoryMinAbi,
        provider
      );
      
      // Check if pool already exists for fee 3000 (0.3%)
      const fee = 3000;
      const poolAddress = await factory.getPool(token0, token1, fee);
      
      if (poolAddress === "0x0000000000000000000000000000000000000000") {
        console.log("Pool does not exist yet - will need initialization");
        
        // Unfortunately we can't easily simulate pool initialization without making a transaction
        // But this confirms the pool would need to be created
      } else {
        console.log(`Pool already exists at: ${poolAddress}`);
      }
      
      console.log("✅ _initializePoolIfNeeded simulation successful");
      return { positionManagerAddress, factoryAddress, poolExists: poolAddress !== "0x0000000000000000000000000000000000000000" };
    } catch (error) {
      console.error("❌ Failed to check factory:", formatError(error));
      throw error;
    }
  } catch (error) {
    console.error("❌ _initializePoolIfNeeded simulation failed:", formatError(error));
    throw error;
  }
}

async function testApproveTokensForPositionManager(token0, token1, amount0, amount1, positionManagerAddress) {
  console.log("\n===== TESTING _approveTokensForPositionManager =====");
  
  try {
    // Connect to both tokens
    const token0Contract = new ethers.Contract(
      token0,
      tokenAbi.tokenAbi,
      wallet
    );
    
    const token1Contract = new ethers.Contract(
      token1,
      tokenAbi.tokenAbi,
      wallet
    );
    
    // Check current allowances
    const allowance0 = await token0Contract.allowance(wallet.address, positionManagerAddress);
    const allowance1 = await token1Contract.allowance(wallet.address, positionManagerAddress);
    
    const token0Symbol = await token0Contract.symbol();
    const token1Symbol = await token1Contract.symbol();
    const token0Decimals = await token0Contract.decimals();
    const token1Decimals = await token1Contract.decimals();
    
    console.log(`Current ${token0Symbol} allowance: ${ethers.formatUnits(allowance0, token0Decimals)}`);
    console.log(`Current ${token1Symbol} allowance: ${ethers.formatUnits(allowance1, token1Decimals)}`);
    
    // We need to make sure tokens are approved for the POSITION MANAGER
    if (allowance0 < amount0) {
      console.log(`Approving ${token0Symbol} for position manager...`);
      const tx0 = await token0Contract.approve(positionManagerAddress, amount0);
      await tx0.wait();
      console.log(`✅ ${token0Symbol} approved: ${tx0.hash}`);
    } else {
      console.log(`✅ ${token0Symbol} already has sufficient allowance`);
    }
    
    if (allowance1 < amount1) {
      console.log(`Approving ${token1Symbol} for position manager...`);
      const tx1 = await token1Contract.approve(positionManagerAddress, amount1);
      await tx1.wait();
      console.log(`✅ ${token1Symbol} approved: ${tx1.hash}`);
    } else {
      console.log(`✅ ${token1Symbol} already has sufficient allowance`);
    }
    
    // Verify approvals
    const newAllowance0 = await token0Contract.allowance(wallet.address, positionManagerAddress);
    const newAllowance1 = await token1Contract.allowance(wallet.address, positionManagerAddress);
    
    console.log(`New ${token0Symbol} allowance: ${ethers.formatUnits(newAllowance0, token0Decimals)}`);
    console.log(`New ${token1Symbol} allowance: ${ethers.formatUnits(newAllowance1, token1Decimals)}`);
    
    if (newAllowance0 < amount0 || newAllowance1 < amount1) {
      throw new Error("Token approvals failed - insufficient allowance");
    }
    
    console.log("✅ _approveTokensForPositionManager simulation successful");
    return true;
  } catch (error) {
    console.error("❌ _approveTokensForPositionManager simulation failed:", formatError(error));
    throw error;
  }
}

async function testMintPosition(token0, token1, amount0, amount1) {
  console.log("\n===== TESTING _mintPosition =====");
  
  // Define test parameters
  const fee = 3000;
  const tickLower = -60 * 100;
  const tickUpper = 60 * 100;
  
  try {
    // Since _mintPosition is where the error likely happens, let's simulate this transaction
    const calldata = liquidityManager.interface.encodeFunctionData("createLiquidityPool", [
      TOKEN_A,
      TOKEN_B, 
      fee,
      tickLower, 
      tickUpper,
      TOKEN_A === token0 ? amount0 : amount1,
      TOKEN_B === token1 ? amount1 : amount0,
      0 // No lock duration
    ]);
    
    // Estimate gas to see if the transaction would fail
    try {
      console.log("Testing transaction with gas estimation...");
      const gasEstimate = await provider.estimateGas({
        from: wallet.address,
        to: liquidityManagerAddress,
        data: calldata
      });
      
      console.log(`✅ Gas estimation successful: ${gasEstimate.toString()} units`);
      console.log("Transaction simulation successful - _mintPosition would likely succeed");
      return true;
    } catch (error) {
      console.error("❌ Transaction simulation failed:", formatError(error));
      
      // Let's try to narrow down exactly where it's failing
      console.log("\nAttempting more detailed mint position diagnosis...");
      
      // Create a transaction with explicit parameter values for better debugging
      console.log("Transaction parameters:");
      console.log(`- Token A: ${TOKEN_A}`);
      console.log(`- Token B: ${TOKEN_B}`);
      console.log(`- Fee: ${fee}`);
      console.log(`- Tick Range: ${tickLower} to ${tickUpper}`);
      console.log(`- Amount A: ${TOKEN_A === token0 ? ethers.formatUnits(amount0) : ethers.formatUnits(amount1)}`);
      console.log(`- Amount B: ${TOKEN_B === token1 ? ethers.formatUnits(amount1) : ethers.formatUnits(amount0)}`);
      
      // We can also check for common issues:
      console.log("\nChecking for common issues...");
      
      // 1. Check if tokens exist and have code at their addresses
      const token0Code = await provider.getCode(token0);
      const token1Code = await provider.getCode(token1);
      console.log(`Token 0 exists with code? ${token0Code !== '0x'}`);
      console.log(`Token 1 exists with code? ${token1Code !== '0x'}`);
      
      // 2. Check if liquidityManager exists and has code
      const managerCode = await provider.getCode(liquidityManagerAddress);
      console.log(`LiquidityManager exists with code? ${managerCode !== '0x'}`);
      
      // 3. Check if the user has enough tokens (already done in previous tests)
      
      throw error;
    }
  } catch (error) {
    console.error("❌ _mintPosition simulation failed:", error.message);
    throw error;
  }
}

async function runFullTest() {
  try {
    console.log("WALLET ADDRESS:", wallet.address);
    console.log("LIQUIDITY MANAGER:", liquidityManagerAddress);
    
    // Test Step 1: Prepare tokens and amounts
    const { token0, token1, amount0, amount1, decimalsA, decimalsB } = await testPrepareTokensAndAmounts();
    
    // Test Step 2: Initialize pool if needed
    const { positionManagerAddress, factoryAddress, poolExists } = await testInitializePoolIfNeeded(token0, token1);
    
    // Test Step 3: Approve tokens for position manager
    await testApproveTokensForPositionManager(token0, token1, amount0, amount1, positionManagerAddress);
    
    // Test Step 4: Mint position
    await testMintPosition(token0, token1, amount0, amount1);
    
    // We don't test _handleLocking separately since it only matters after successful minting
    
    console.log("\n✅ All simulations completed successfully!");
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
  }
}

// Run the full test sequence
runFullTest()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });