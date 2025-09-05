const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidityManager", function () {
  let liquidityManager;
  let uniswapFactory;
  let uniswapRouter;
  let weth;
  let tokenA;
  let tokenB;
  let owner;
  let user;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const lockDuration = 86400; // 1 day in seconds

  beforeEach(async function () {
    // Get signers
    [owner, user, ...addrs] = await ethers.getSigners();

    // Deploy mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    tokenA = await ERC20Mock.deploy(
      "Token A",
      "TKNA",
      ethers.utils.parseEther("1000000")
    );
    tokenB = await ERC20Mock.deploy(
      "Token B",
      "TKNB",
      ethers.utils.parseEther("1000000")
    );

    // Deploy mock WETH
    const WETH = await ethers.getContractFactory("WETHMock");
    weth = await WETH.deploy();

    // Deploy mock Uniswap factory and router
    const UniswapV2FactoryMock = await ethers.getContractFactory(
      "UniswapV2FactoryMock"
    );
    uniswapFactory = await UniswapV2FactoryMock.deploy();

    const UniswapV2Router02Mock = await ethers.getContractFactory(
      "UniswapV2Router02Mock"
    );
    uniswapRouter = await UniswapV2Router02Mock.deploy(
      uniswapFactory.address,
      weth.address
    );

    // Deploy LiquidityManager
    const LiquidityManager = await ethers.getContractFactory(
      "LiquidityManager"
    );
    liquidityManager = await LiquidityManager.deploy(uniswapRouter.address);

    // Transfer tokens to user
    await tokenA.transfer(user.address, ethers.utils.parseEther("10000"));
    await tokenB.transfer(user.address, ethers.utils.parseEther("10000"));

    // Approve tokens for liquidity manager
    await tokenA
      .connect(user)
      .approve(liquidityManager.address, ethers.utils.parseEther("10000"));
    await tokenB
      .connect(user)
      .approve(liquidityManager.address, ethers.utils.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the right router address", async function () {
      expect(await liquidityManager.router()).to.equal(uniswapRouter.address);
    });

    it("Should set the right weth address", async function () {
      expect(await liquidityManager.weth()).to.equal(weth.address);
    });

    it("Should set the correct owner", async function () {
      expect(await liquidityManager.owner()).to.equal(owner.address);
    });
  });

  describe("addLiquidity", function () {
    const amountA = ethers.utils.parseEther("100");
    const amountB = ethers.utils.parseEther("100");
    const amountAMin = ethers.utils.parseEther("95");
    const amountBMin = ethers.utils.parseEther("95");

    it("Should add liquidity successfully with no lock", async function () {
      // Setup mock router response
      const routerResponse = {
        amountA: amountA,
        amountB: amountB,
        liquidity: ethers.utils.parseEther("100"),
      };
      await uniswapRouter.setAddLiquidityResponse(routerResponse);

      // Setup mock factory
      const pairAddress = "0x1111111111111111111111111111111111111111";
      await uniswapFactory.setPair(tokenA.address, tokenB.address, pairAddress);

      // Call addLiquidity
      const tx = await liquidityManager.connect(user).addLiquidity(
        tokenA.address,
        tokenB.address,
        amountA,
        amountB,
        amountAMin,
        amountBMin,
        0 // no lock
      );

      // Check event emission
      await expect(tx)
        .to.emit(liquidityManager, "LiquidityAdded")
        .withArgs(
          tokenA.address,
          tokenB.address,
          pairAddress,
          amountA,
          amountB,
          routerResponse.liquidity
        );
    });

    it("Should add liquidity successfully with lock", async function () {
      // Setup mock router response
      const routerResponse = {
        amountA: amountA,
        amountB: amountB,
        liquidity: ethers.utils.parseEther("100"),
      };
      await uniswapRouter.setAddLiquidityResponse(routerResponse);

      // Setup mock factory
      const pairAddress = "0x1111111111111111111111111111111111111111";
      await uniswapFactory.setPair(tokenA.address, tokenB.address, pairAddress);

      // Call addLiquidity with lock
      const tx = await liquidityManager
        .connect(user)
        .addLiquidity(
          tokenA.address,
          tokenB.address,
          amountA,
          amountB,
          amountAMin,
          amountBMin,
          lockDuration
        );

      // Check lock info
      const blockTimestamp = (await ethers.provider.getBlock("latest"))
        .timestamp;
      const lockInfo = await liquidityManager.liquidityLocks(pairAddress);
      expect(lockInfo.pair).to.equal(pairAddress);
      expect(lockInfo.unlockTime).to.equal(blockTimestamp + lockDuration);

      // Check event emission
      await expect(tx)
        .to.emit(liquidityManager, "LiquidityLocked")
        .withArgs(pairAddress, blockTimestamp + lockDuration);
    });

    it("Should refund excess tokens when not all tokens are used", async function () {
      // Setup mock router response - using less than provided
      const usedAmountA = ethers.utils.parseEther("90");
      const usedAmountB = ethers.utils.parseEther("90");
      const routerResponse = {
        amountA: usedAmountA,
        amountB: usedAmountB,
        liquidity: ethers.utils.parseEther("90"),
      };
      await uniswapRouter.setAddLiquidityResponse(routerResponse);

      // Setup mock factory
      const pairAddress = "0x1111111111111111111111111111111111111111";
      await uniswapFactory.setPair(tokenA.address, tokenB.address, pairAddress);

      // Check initial balances
      const initialBalanceA = await tokenA.balanceOf(user.address);
      const initialBalanceB = await tokenB.balanceOf(user.address);

      // Call addLiquidity
      await liquidityManager.connect(user).addLiquidity(
        tokenA.address,
        tokenB.address,
        amountA,
        amountB,
        amountAMin,
        amountBMin,
        0 // no lock
      );

      // Check refunds
      const finalBalanceA = await tokenA.balanceOf(user.address);
      const finalBalanceB = await tokenB.balanceOf(user.address);

      expect(finalBalanceA).to.equal(initialBalanceA.sub(usedAmountA));
      expect(finalBalanceB).to.equal(initialBalanceB.sub(usedAmountB));
    });

    it("Should revert when trying to create WETH/WETH pair", async function () {
      await expect(
        liquidityManager
          .connect(user)
          .addLiquidity(
            weth.address,
            weth.address,
            amountA,
            amountB,
            amountAMin,
            amountBMin,
            0
          )
      ).to.be.revertedWith("Cannot create WETH/WETH pair");
    });

    it("Should revert when token transfer fails", async function () {
      // Mock token with failing transfer
      const FailingERC20Mock = await ethers.getContractFactory(
        "FailingERC20Mock"
      );
      const failingToken = await FailingERC20Mock.deploy(
        "Failing Token",
        "FAIL"
      );

      await expect(
        liquidityManager
          .connect(user)
          .addLiquidity(
            failingToken.address,
            tokenB.address,
            amountA,
            amountB,
            amountAMin,
            amountBMin,
            0
          )
      ).to.be.revertedWith("Transfer of token failed");
    });
  });

  describe("addLiquidityETH", function () {
    const tokenAmount = ethers.utils.parseEther("100");
    const ethAmount = ethers.utils.parseEther("10");
    const tokenAmountMin = ethers.utils.parseEther("95");
    const ethAmountMin = ethers.utils.parseEther("9.5");

    it("Should add ETH liquidity successfully with no lock", async function () {
      // Setup mock router response
      const routerResponse = {
        amountToken: tokenAmount,
        amountETH: ethAmount,
        liquidity: ethers.utils.parseEther("50"),
      };
      await uniswapRouter.setAddLiquidityETHResponse(routerResponse);

      // Setup mock factory
      const pairAddress = "0x2222222222222222222222222222222222222222";
      await uniswapFactory.setPair(tokenA.address, weth.address, pairAddress);

      // Call addLiquidityETH
      const tx = await liquidityManager.connect(user).addLiquidityETH(
        tokenA.address,
        tokenAmount,
        tokenAmountMin,
        ethAmountMin,
        0, // no lock
        { value: ethAmount }
      );

      // Check event emission
      await expect(tx)
        .to.emit(liquidityManager, "LiquidityAdded")
        .withArgs(
          tokenA.address,
          weth.address,
          pairAddress,
          tokenAmount,
          ethAmount,
          routerResponse.liquidity
        );
    });

    it("Should add ETH liquidity successfully with lock", async function () {
      // Setup mock router response
      const routerResponse = {
        amountToken: tokenAmount,
        amountETH: ethAmount,
        liquidity: ethers.utils.parseEther("50"),
      };
      await uniswapRouter.setAddLiquidityETHResponse(routerResponse);

      // Setup mock factory
      const pairAddress = "0x2222222222222222222222222222222222222222";
      await uniswapFactory.setPair(tokenA.address, weth.address, pairAddress);

      // Call addLiquidityETH with lock
      const tx = await liquidityManager
        .connect(user)
        .addLiquidityETH(
          tokenA.address,
          tokenAmount,
          tokenAmountMin,
          ethAmountMin,
          lockDuration,
          { value: ethAmount }
        );

      // Check lock info
      const blockTimestamp = (await ethers.provider.getBlock("latest"))
        .timestamp;
      const lockInfo = await liquidityManager.liquidityLocks(pairAddress);
      expect(lockInfo.pair).to.equal(pairAddress);
      expect(lockInfo.unlockTime).to.equal(blockTimestamp + lockDuration);

      // Check event emission
      await expect(tx)
        .to.emit(liquidityManager, "LiquidityLocked")
        .withArgs(pairAddress, blockTimestamp + lockDuration);
    });

    it("Should refund excess tokens and ETH when not all are used", async function () {
      // Setup mock router response - using less than provided
      const usedTokenAmount = ethers.utils.parseEther("90");
      const usedEthAmount = ethers.utils.parseEther("9");
      const routerResponse = {
        amountToken: usedTokenAmount,
        amountETH: usedEthAmount,
        liquidity: ethers.utils.parseEther("45"),
      };
      await uniswapRouter.setAddLiquidityETHResponse(routerResponse);

      // Setup mock factory
      const pairAddress = "0x2222222222222222222222222222222222222222";
      await uniswapFactory.setPair(tokenA.address, weth.address, pairAddress);

      // Check initial balances
      const initialTokenBalance = await tokenA.balanceOf(user.address);
      const initialEthBalance = await ethers.provider.getBalance(user.address);

      // Call addLiquidityETH
      const tx = await liquidityManager.connect(user).addLiquidityETH(
        tokenA.address,
        tokenAmount,
        tokenAmountMin,
        ethAmountMin,
        0, // no lock
        { value: ethAmount }
      );

      // Calculate gas cost
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed.mul(tx.gasPrice);

      // Check refunds
      const finalTokenBalance = await tokenA.balanceOf(user.address);
      const finalEthBalance = await ethers.provider.getBalance(user.address);

      expect(finalTokenBalance).to.equal(
        initialTokenBalance.sub(usedTokenAmount)
      );
      // For ETH, account for gas costs
      expect(finalEthBalance).to.equal(
        initialEthBalance.sub(usedEthAmount).sub(gasCost)
      );
    });

    it("Should revert when trying to use WETH directly", async function () {
      await expect(
        liquidityManager
          .connect(user)
          .addLiquidityETH(
            weth.address,
            tokenAmount,
            tokenAmountMin,
            ethAmountMin,
            0,
            { value: ethAmount }
          )
      ).to.be.revertedWith("Use addLiquidity for WETH pairs");
    });
  });

  describe("unlockLiquidity", function () {
    const pairAddress = "0x3333333333333333333333333333333333333333";
    const liquidityAmount = ethers.utils.parseEther("100");

    beforeEach(async function () {
      // Setup mock LP token
      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      const lpToken = await ERC20Mock.deploy("LP Token", "LP", liquidityAmount);
      await lpToken.transfer(liquidityManager.address, liquidityAmount);

      // Set mock pair address
      await uniswapFactory.setPair(tokenA.address, tokenB.address, pairAddress);

      // Create lock
      await liquidityManager
        .connect(user)
        .addLiquidity(
          tokenA.address,
          tokenB.address,
          ethers.utils.parseEther("100"),
          ethers.utils.parseEther("100"),
          ethers.utils.parseEther("95"),
          ethers.utils.parseEther("95"),
          lockDuration
        );

      // Mock the pair address
      ethers.provider.send("hardhat_setStorageAt", [
        liquidityManager.address,
        ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256"],
            [pairAddress, 0] // liquidityLocks[pairAddress] storage slot
          )
        ),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256"],
          [pairAddress, Math.floor(Date.now() / 1000) + lockDuration]
        ),
      ]);
    });

    it("Should not allow unlock before time", async function () {
      await expect(
        liquidityManager.connect(owner).unlockLiquidity(pairAddress)
      ).to.be.revertedWith("Liquidity still locked");
    });

    it("Should only allow owner to unlock", async function () {
      // Advance time
      await ethers.provider.send("evm_increaseTime", [lockDuration + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        liquidityManager.connect(user).unlockLiquidity(pairAddress)
      ).to.be.revertedWith("Not authorized");
    });

    it("Should unlock liquidity after lock duration", async function () {
      // Advance time
      await ethers.provider.send("evm_increaseTime", [lockDuration + 1]);
      await ethers.provider.send("evm_mine", []);

      // Mock LP token
      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      const lpToken = await ERC20Mock.deploy("LP Token", "LP", liquidityAmount);
      await lpToken.transfer(liquidityManager.address, liquidityAmount);

      // Mock the pair to point to our LP token contract
      ethers.provider.send("hardhat_setCode", [
        pairAddress,
        lpToken.deployTransaction.data,
      ]);

      // Unlock liquidity
      const tx = await liquidityManager
        .connect(owner)
        .unlockLiquidity(pairAddress);

      // Check event emission
      await expect(tx)
        .to.emit(liquidityManager, "LiquidityUnlocked")
        .withArgs(pairAddress, owner.address);

      // Check LP tokens were transferred
      expect(await lpToken.balanceOf(owner.address)).to.equal(liquidityAmount);
      expect(await lpToken.balanceOf(liquidityManager.address)).to.equal(0);

      // Check lock info was cleared
      const lockInfo = await liquidityManager.liquidityLocks(pairAddress);
      expect(lockInfo.pair).to.equal(ZERO_ADDRESS);
      expect(lockInfo.unlockTime).to.equal(0);
    });

    it("Should revert when no liquidity to unlock", async function () {
      // Advance time
      await ethers.provider.send("evm_increaseTime", [lockDuration + 1]);
      await ethers.provider.send("evm_mine", []);

      // Mock LP token with zero balance
      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      const lpToken = await ERC20Mock.deploy("LP Token", "LP", 0);

      // Mock the pair to point to our LP token contract
      ethers.provider.send("hardhat_setCode", [
        pairAddress,
        lpToken.deployTransaction.data,
      ]);

      await expect(
        liquidityManager.connect(owner).unlockLiquidity(pairAddress)
      ).to.be.revertedWith("No liquidity to unlock");
    });
  });

  describe("createPair", function () {
    it("Should return existing pair if it exists", async function () {
      const existingPair = "0x4444444444444444444444444444444444444444";
      await uniswapFactory.setPair(
        tokenA.address,
        tokenB.address,
        existingPair
      );

      const pair = await liquidityManager.createPair(
        tokenA.address,
        tokenB.address
      );
      expect(pair).to.equal(existingPair);
    });

    it("Should create new pair if it doesn't exist", async function () {
      const newPair = "0x5555555555555555555555555555555555555555";
      await uniswapFactory.setCreatePairResponse(newPair);

      // Ensure pair doesn't exist yet
      await uniswapFactory.setPair(
        tokenA.address,
        tokenB.address,
        ZERO_ADDRESS
      );

      // Create pair
      const tx = await liquidityManager.createPair(
        tokenA.address,
        tokenB.address
      );

      // Check pair
      const pair = await uniswapFactory.getPair(tokenA.address, tokenB.address);
      expect(pair).to.equal(newPair);

      // Check event emission
      await expect(tx)
        .to.emit(liquidityManager, "PairCreated")
        .withArgs(tokenA.address, tokenB.address, newPair);
    });
  });

  describe("Debug functions", function () {
    it("Should check token allowance correctly", async function () {
      const allowanceAmount = ethers.utils.parseEther("100");
      await tokenA.approve(liquidityManager.address, allowanceAmount);

      const allowance = await liquidityManager.checkAllowance(
        tokenA.address,
        liquidityManager.address
      );

      expect(allowance).to.equal(allowanceAmount);
    });

    it("Should check token balance correctly", async function () {
      const balance = await liquidityManager.checkBalance(
        tokenA.address,
        user.address
      );

      expect(balance).to.equal(ethers.utils.parseEther("10000"));
    });

    it("Should transfer tokens directly when called by owner", async function () {
      // Transfer tokens to liquidityManager
      await tokenA.transfer(
        liquidityManager.address,
        ethers.utils.parseEther("100")
      );

      // Check initial balance
      const initialBalance = await tokenA.balanceOf(user.address);

      // Debug transfer
      await liquidityManager
        .connect(owner)
        .debugTransferToken(
          tokenA.address,
          user.address,
          ethers.utils.parseEther("50")
        );

      // Check final balance
      const finalBalance = await tokenA.balanceOf(user.address);
      expect(finalBalance).to.equal(
        initialBalance.add(ethers.utils.parseEther("50"))
      );
    });

    it("Should revert when non-owner calls debug functions", async function () {
      await expect(
        liquidityManager
          .connect(user)
          .debugTransferToken(
            tokenA.address,
            user.address,
            ethers.utils.parseEther("50")
          )
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        liquidityManager
          .connect(user)
          .debugApproveToken(
            tokenA.address,
            user.address,
            ethers.utils.parseEther("50")
          )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should approve tokens directly when called by owner", async function () {
      // Transfer tokens to liquidityManager
      await tokenA.transfer(
        liquidityManager.address,
        ethers.utils.parseEther("100")
      );

      // Debug approve
      await liquidityManager
        .connect(owner)
        .debugApproveToken(
          tokenA.address,
          user.address,
          ethers.utils.parseEther("50")
        );

      // Check allowance
      const allowance = await tokenA.allowance(
        liquidityManager.address,
        user.address
      );
      expect(allowance).to.equal(ethers.utils.parseEther("50"));
    });
  });

  describe("ETH handling", function () {
    it("Should accept ETH via receive function", async function () {
      const ethAmount = ethers.utils.parseEther("1");

      // Send ETH directly
      await user.sendTransaction({
        to: liquidityManager.address,
        value: ethAmount,
      });

      // Check balance
      const balance = await ethers.provider.getBalance(
        liquidityManager.address
      );
      expect(balance).to.equal(ethAmount);
    });
  });
});

// Mock contracts needed for testing

// Mock ERC20 Token contract
const ERC20MockArtifact = {
  abi: [
    "constructor(string memory name, string memory symbol, uint256 initialSupply)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address recipient, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address sender, address recipient, uint256 amount) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
  ],
  bytecode: "0x", // Shortened for brevity
};

// Mock contract for failing ERC20 transfer
const FailingERC20MockArtifact = {
  abi: [
    "constructor(string memory name, string memory symbol)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function transferFrom(address sender, address recipient, uint256 amount) returns (bool)",
  ],
  bytecode: "0x", // Shortened for brevity
};

// Mock WETH contract
const WETHMockArtifact = {
  abi: [
    "constructor()",
    "function deposit() payable",
    "function transfer(address to, uint value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ],
  bytecode: "0x", // Shortened for brevity
};

// Mock Uniswap V2 Factory
const UniswapV2FactoryMockArtifact = {
  abi: [
    "constructor()",
    "function createPair(address tokenA, address tokenB) returns (address pair)",
    "function getPair(address tokenA, address tokenB) view returns (address pair)",
    "function setPair(address tokenA, address tokenB, address pair)",
    "function setCreatePairResponse(address pairAddress)",
  ],
  bytecode: "0x", // Shortened for brevity
};

// Mock Uniswap V2 Router
const UniswapV2Router02MockArtifact = {
  abi: [
    "constructor(address factory, address WETH)",
    "function factory() pure returns (address)",
    "function WETH() pure returns (address)",
    "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) returns (uint amountA, uint amountB, uint liquidity)",
    "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) payable returns (uint amountToken, uint amountETH, uint liquidity)",
    "function setAddLiquidityResponse(tuple(uint amountA, uint amountB, uint liquidity) memory response)",
    "function setAddLiquidityETHResponse(tuple(uint amountToken, uint amountETH, uint liquidity) memory response)",
  ],
  bytecode: "0x", // Shortened for brevity
};
