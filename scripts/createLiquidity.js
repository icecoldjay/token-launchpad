// Script to create a Uniswap V3 liquidity position on Sepolia testnet
const { ethers } = require('ethers');
require('dotenv').config();

// Uniswap V3 contract addresses on Sepolia
const FACTORY_ADDRESS = '0x0227628f3F023bb0B980b67D528571c95c6DaC1c';
const NONFUNGIBLE_POSITION_MANAGER = '0x1238536071E1c677A632429e3655c799b22cDA52';
const SWAP_ROUTER_ADDRESS = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ee29E';

// Sample token addresses on Sepolia (replace with actual tokens you want to use)
const TOKEN_A = '0x64a72e8a9A71289f9024Bef8b1211249192c79D4'; // Example: Sepolia UNI
const TOKEN_B = '0x0422E8419Fa33a975c5923Ab90fd5269d6A734dA'; // Example: Sepolia WETH

// ABI for ERC20 and Uniswap interfaces
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)'
];

const POSITION_MANAGER_ABI = [
  'function createAndInitializePoolIfNecessary(address tokenA, address tokenB, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)',
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)'
];

async function createLiquidityPosition() {
  try {
    // Connect to provider
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    
    // Set up wallet with private key
    const wallet = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);
    console.log(`Connected to wallet: ${wallet.address}`);
    
    // Connect to token contracts
    const tokenA = new ethers.Contract(TOKEN_A, ERC20_ABI, wallet);
    const tokenB = new ethers.Contract(TOKEN_B, ERC20_ABI, wallet);
    
    // Get token details
    const decimalsA = await tokenA.decimals();
    const decimalsB = await tokenB.decimals();
    console.log(`Token A (${TOKEN_A}) decimals: ${decimalsA}`);
    console.log(`Token B (${TOKEN_B}) decimals: ${decimalsB}`);
    
    // Check token balances
    const balanceA = await tokenA.balanceOf(wallet.address);
    const balanceB = await tokenB.balanceOf(wallet.address);
    console.log(`Token A balance: ${ethers.formatUnits(balanceA, decimalsA)}`);
    console.log(`Token B balance: ${ethers.formatUnits(balanceB, decimalsB)}`);
    
    // Connect to Position Manager contract
    const positionManager = new ethers.Contract(
      NONFUNGIBLE_POSITION_MANAGER,
      POSITION_MANAGER_ABI,
      wallet
    );
    
    // Define liquidity parameters
    const fee = 3000; // 0.3%
    
    // Sort tokens (Uniswap requires tokenA < tokenB by address)
    let [token0, token1] = TOKEN_A.toLowerCase() < TOKEN_B.toLowerCase() 
      ? [TOKEN_A, TOKEN_B] 
      : [TOKEN_B, TOKEN_A];
    
    // Approve tokens for the Position Manager
    const amountA = ethers.parseUnits('10', decimalsA); // Amount of token A to add
    const amountB = ethers.parseUnits('10', decimalsB); // Amount of token B to add
    
    console.log('Approving tokens...');
    await tokenA.approve(NONFUNGIBLE_POSITION_MANAGER, amountA);
    await tokenB.approve(NONFUNGIBLE_POSITION_MANAGER, amountB);
    console.log('Tokens approved');
    
    // Initialize pool if necessary
    // The price is represented as a sqrt(price) * 2^96
    // For a 1:1 price, sqrtPriceX96 = 2^96 = 79228162514264337593543950336
    const sqrtPriceX96 = '79228162514264337593543950336';
    
    console.log('Creating or initializing pool...');
    try {
      const tx = await positionManager.createAndInitializePoolIfNecessary(
        token0, 
        token1, 
        fee, 
        sqrtPriceX96
      );
      await tx.wait();
      console.log('Pool initialized');
    } catch (error) {
      console.log('Pool may already exist, continuing...');
    }
    
    // Define position parameters
    const tickSpacing = 60; // For 0.3% fee tier
    const tickLower = -60 * 100; // Example: 100 ticks below current price
    const tickUpper = 60 * 100;  // Example: 100 ticks above current price
    
    // Calculate amounts based on token order
    let amount0Desired, amount1Desired;
    if (TOKEN_A.toLowerCase() < TOKEN_B.toLowerCase()) {
      amount0Desired = amountA;
      amount1Desired = amountB;
    } else {
      amount0Desired = amountB;
      amount1Desired = amountA;
    }
    
    // Define mint parameters
    const mintParams = {
      token0: token0,
      token1: token1,
      fee: fee,
      tickLower: tickLower,
      tickUpper: tickUpper,
      amount0Desired: amount0Desired,
      amount1Desired: amount1Desired,
      amount0Min: 0,
      amount1Min: 0,
      recipient: wallet.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes from now
    };
    
    console.log('Creating liquidity position...');
    const mintTx = await positionManager.mint(mintParams);
    const receipt = await mintTx.wait();
    
    console.log('Position created!');
    
    // Find the Position token ID from the event logs
    const positionManagerInterface = new ethers.Interface([
      'event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)'
    ]);
    
    const events = receipt.logs
      .map(log => {
        try {
          return positionManagerInterface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter(event => event !== null && event.name === 'IncreaseLiquidity');
    
    if (events.length > 0) {
      const tokenId = events[0].args.tokenId;
      const liquidity = events[0].args.liquidity;
      const amount0 = events[0].args.amount0;
      const amount1 = events[0].args.amount1;
      
      console.log(`✅ Success! Position created with ID: ${tokenId.toString()}`);
      console.log(`Liquidity: ${liquidity.toString()}`);
      console.log(`Amount of token0: ${ethers.formatUnits(amount0, decimalsA)}`);
      console.log(`Amount of token1: ${ethers.formatUnits(amount1, decimalsB)}`);
    } else {
      console.log('Position created but couldn\'t find position ID in logs');
    }
    
  } catch (error) {
    console.error('Error creating liquidity position:', error);
  }
}

// Run the function
createLiquidityPosition()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });