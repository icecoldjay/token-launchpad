const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LaunchManager", function () {
  let owner, user1, user2, user3, feeCollector;
  let tokenFactory, launchManager, liquidityManager, router;
  let tokenCreationFee, launchFee;

  // Mock token for testing token pair launches
  let mockToken;

  // Constants for testing
  const ZERO_ADDRESS = ethers.constants.AddressZero;
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 1M tokens
  const TOKEN_AMOUNT_FOR_LIQUIDITY = ethers.utils.parseEther("100000"); // 100K tokens
  const ETH_AMOUNT_FOR_LIQUIDITY = ethers.utils.parseEther("10"); // 10 ETH
  const PAIR_TOKEN_AMOUNT = ethers.utils.parseEther("10000"); // 10K USDC/USDT
  const LOCK_DURATION = 60 * 60 * 24 * 30; // 30 days
  const MIN_SLIPPAGE = 950; // 95% (allowing 5% slippage)

  beforeEach(async function () {
    // Get signers
    [owner, user1, user2, user3, feeCollector] = await ethers.getSigners();

    // Deploy router mock first (needed for LiquidityManager)
    const RouterMock = await ethers.getContractFactory("UniswapV2RouterMock");
    router = await RouterMock.deploy();
    await router.deployed();

    // Deploy LiquidityManager
    const LiquidityManager = await ethers.getContractFactory(
      "LiquidityManager"
    );
    liquidityManager = await LiquidityManager.deploy(router.address);
    await liquidityManager.deployed();

    // Set up creation fee
    tokenCreationFee = ethers.utils.parseEther("0.1"); // 0.1 ETH
    launchFee = ethers.utils.parseEther("0.2"); // 0.2 ETH

    // Deploy TokenFactory
    const TokenFactory = await ethers.getContractFactory("TokenFactory");
    tokenFactory = await TokenFactory.deploy(
      feeCollector.address,
      tokenCreationFee
    );
    await tokenFactory.deployed();

    // Deploy LaunchManager
    const LaunchManager = await ethers.getContractFactory("LaunchManager");
    launchManager = await LaunchManager.deploy(
      tokenFactory.address,
      liquidityManager.address,
      feeCollector.address,
      launchFee
    );
    await launchManager.deployed();

    // Deploy mock token (for token pair launches)
    const MockToken = await ethers.getContractFactory("ERC20Mock");
    mockToken = await MockToken.deploy("Mock USDC", "USDC", 6);
    await mockToken.deployed();

    // Mint tokens to user1 for tests
    await mockToken.mint(user1.address, PAIR_TOKEN_AMOUNT);
  });

  describe("Constructor", function () {
    it("Should correctly set initial values", async function () {
      expect(await launchManager.tokenFactory()).to.equal(tokenFactory.address);
      expect(await launchManager.liquidityManagerAddress()).to.equal(
        liquidityManager.address
      );
      expect(await launchManager.feeCollector()).to.equal(feeCollector.address);
      expect(await launchManager.launchFee()).to.equal(launchFee);
    });
  });

  describe("instantLaunchWithEth", function () {
    let tokenParams, ethParams;

    beforeEach(async function () {
      // Set up token parameters
      tokenParams = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        totalSupply: INITIAL_SUPPLY,
        initialHolders: [user2.address, user3.address],
        initialAmounts: [
          ethers.utils.parseEther("1000"),
          ethers.utils.parseEther("2000"),
        ],
        enableAntiBot: true,
      };

      // Set up ETH pair parameters
      ethParams = {
        tokenAmount: TOKEN_AMOUNT_FOR_LIQUIDITY,
        ethAmount: ETH_AMOUNT_FOR_LIQUIDITY,
        tokenAmountMin: TOKEN_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        ethAmountMin: ETH_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        lockDuration: LOCK_DURATION,
      };
    });

    it("Should revert if insufficient ETH sent", async function () {
      const insufficientAmount = launchFee.add(tokenCreationFee); // Missing ETH for liquidity

      await expect(
        launchManager
          .connect(user1)
          .instantLaunchWithEth(tokenParams, ethParams, {
            value: insufficientAmount,
          })
      ).to.be.revertedWith("Insufficient ETH");
    });

    it("Should successfully launch a token with ETH liquidity", async function () {
      // Calculate total ETH needed
      const totalEthNeeded = launchFee
        .add(tokenCreationFee)
        .add(ETH_AMOUNT_FOR_LIQUIDITY);

      // Track balances before
      const user1BalanceBefore = await ethers.provider.getBalance(
        user1.address
      );
      const feeCollectorBalanceBefore = await ethers.provider.getBalance(
        feeCollector.address
      );

      // Launch with ETH
      const tx = await launchManager
        .connect(user1)
        .instantLaunchWithEth(tokenParams, ethParams, {
          value: totalEthNeeded,
        });

      const receipt = await tx.wait();

      // Get the token address from the event
      const launchCompletedEvent = receipt.events.find(
        (e) => e.event === "LaunchCompleted"
      );
      const tokenAddress = launchCompletedEvent.args.tokenAddress;

      // Verify token creation
      expect(tokenAddress).to.not.equal(ZERO_ADDRESS);

      // Check token contract
      const token = await ethers.getContractAt("IERC20", tokenAddress);

      // Verify initial token distributions
      expect(await token.balanceOf(user2.address)).to.equal(
        tokenParams.initialAmounts[0]
      );
      expect(await token.balanceOf(user3.address)).to.equal(
        tokenParams.initialAmounts[1]
      );

      // Verify fees were collected
      const feeCollectorBalanceAfter = await ethers.provider.getBalance(
        feeCollector.address
      );
      expect(feeCollectorBalanceAfter.sub(feeCollectorBalanceBefore)).to.equal(
        launchFee.add(tokenCreationFee)
      );

      // Verify liquidity was created (check event)
      expect(launchCompletedEvent.args.liquidityTokenId).to.not.equal(0);
    });

    it("Should refund excess ETH if more than needed is sent", async function () {
      // Send extra ETH
      const extraEth = ethers.utils.parseEther("1");
      const totalEthSent = launchFee
        .add(tokenCreationFee)
        .add(ETH_AMOUNT_FOR_LIQUIDITY)
        .add(extraEth);

      // Track balances before
      const user1BalanceBefore = await ethers.provider.getBalance(
        user1.address
      );

      // Launch with ETH
      const tx = await launchManager
        .connect(user1)
        .instantLaunchWithEth(tokenParams, ethParams, { value: totalEthSent });

      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Get user balance after
      const user1BalanceAfter = await ethers.provider.getBalance(user1.address);

      // Calculate expected balance (accounting for gas and refund)
      const expectedBalance = user1BalanceBefore
        .sub(launchFee)
        .sub(tokenCreationFee)
        .sub(ETH_AMOUNT_FOR_LIQUIDITY)
        .sub(gasCost);

      // Allow for small rounding differences in gas calculation
      expect(user1BalanceAfter).to.be.closeTo(
        expectedBalance,
        ethers.utils.parseEther("0.001")
      );
    });

    it("Should properly distribute tokens to initial holders", async function () {
      // Calculate total ETH needed
      const totalEthNeeded = launchFee
        .add(tokenCreationFee)
        .add(ETH_AMOUNT_FOR_LIQUIDITY);

      // Launch with ETH
      const tx = await launchManager
        .connect(user1)
        .instantLaunchWithEth(tokenParams, ethParams, {
          value: totalEthNeeded,
        });

      const receipt = await tx.wait();

      // Get the token address from the event
      const launchCompletedEvent = receipt.events.find(
        (e) => e.event === "LaunchCompleted"
      );
      const tokenAddress = launchCompletedEvent.args.tokenAddress;

      // Get the token contract
      const token = await ethers.getContractAt("IERC20", tokenAddress);

      // Check balances of initial holders
      for (let i = 0; i < tokenParams.initialHolders.length; i++) {
        const balance = await token.balanceOf(tokenParams.initialHolders[i]);
        expect(balance).to.equal(tokenParams.initialAmounts[i]);
      }

      // Verify token distribution events
      const tokenDistributedEvents = receipt.events.filter(
        (e) => e.event === "TokenDistributed"
      );
      expect(tokenDistributedEvents.length).to.equal(
        tokenParams.initialHolders.length
      );
    });

    it("Should mark initial distribution as complete", async function () {
      // Calculate total ETH needed
      const totalEthNeeded = launchFee
        .add(tokenCreationFee)
        .add(ETH_AMOUNT_FOR_LIQUIDITY);

      // Launch with ETH
      const tx = await launchManager
        .connect(user1)
        .instantLaunchWithEth(tokenParams, ethParams, {
          value: totalEthNeeded,
        });

      const receipt = await tx.wait();

      // Get the token address from the event
      const launchCompletedEvent = receipt.events.find(
        (e) => e.event === "LaunchCompleted"
      );
      const tokenAddress = launchCompletedEvent.args.tokenAddress;

      // Get the token contract
      const token = await ethers.getContractAt("IToken", tokenAddress);

      // Check if initial distribution is marked as complete
      expect(await token.initialDistributionComplete()).to.equal(true);
    });

    it("Should fail if token transfers fail", async function () {
      // Deploy a malicious token that fails transfers
      const MaliciousToken = await ethers.getContractFactory("MaliciousToken");
      const maliciousToken = await MaliciousToken.deploy();
      await maliciousToken.deployed();

      // Modify tokenParams to include a malicious token
      const modifiedTokenParams = {
        ...tokenParams,
        initialHolders: [maliciousToken.address],
        initialAmounts: [ethers.utils.parseEther("1000")],
      };

      // Calculate total ETH needed
      const totalEthNeeded = launchFee
        .add(tokenCreationFee)
        .add(ETH_AMOUNT_FOR_LIQUIDITY);

      // Attempt to launch with malicious token - should fail
      await expect(
        launchManager
          .connect(user1)
          .instantLaunchWithEth(modifiedTokenParams, ethParams, {
            value: totalEthNeeded,
          })
      ).to.be.reverted;
    });
  });

  describe("instantLaunchWithToken", function () {
    let tokenParams, tokenPairParams;

    beforeEach(async function () {
      // Set up token parameters
      tokenParams = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        totalSupply: INITIAL_SUPPLY,
        initialHolders: [user2.address, user3.address],
        initialAmounts: [
          ethers.utils.parseEther("1000"),
          ethers.utils.parseEther("2000"),
        ],
        enableAntiBot: true,
      };

      // Set up token pair parameters
      tokenPairParams = {
        pairToken: mockToken.address,
        tokenAmount: TOKEN_AMOUNT_FOR_LIQUIDITY,
        pairAmount: PAIR_TOKEN_AMOUNT,
        tokenAmountMin: TOKEN_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        pairAmountMin: PAIR_TOKEN_AMOUNT.mul(MIN_SLIPPAGE).div(1000),
        lockDuration: LOCK_DURATION,
      };

      // Approve launchManager to spend user1's mockToken
      await mockToken
        .connect(user1)
        .approve(launchManager.address, PAIR_TOKEN_AMOUNT);
    });

    it("Should revert if insufficient ETH sent for fees", async function () {
      const insufficientAmount = launchFee.sub(1); // Less than required fees

      await expect(
        launchManager
          .connect(user1)
          .instantLaunchWithToken(tokenParams, tokenPairParams, {
            value: insufficientAmount,
          })
      ).to.be.revertedWith("Insufficient fee");
    });

    it("Should successfully launch a token with token pair liquidity", async function () {
      // Calculate total ETH needed for fees
      const totalEthNeeded = launchFee.add(tokenCreationFee);

      // Track balances before
      const user1MockTokenBalanceBefore = await mockToken.balanceOf(
        user1.address
      );
      const feeCollectorBalanceBefore = await ethers.provider.getBalance(
        feeCollector.address
      );

      // Launch with token
      const tx = await launchManager
        .connect(user1)
        .instantLaunchWithToken(tokenParams, tokenPairParams, {
          value: totalEthNeeded,
        });

      const receipt = await tx.wait();

      // Get the token address from the event
      const launchCompletedEvent = receipt.events.find(
        (e) => e.event === "LaunchCompleted"
      );
      const tokenAddress = launchCompletedEvent.args.tokenAddress;

      // Verify token creation
      expect(tokenAddress).to.not.equal(ZERO_ADDRESS);

      // Check token contract
      const token = await ethers.getContractAt("IERC20", tokenAddress);

      // Verify initial token distributions
      expect(await token.balanceOf(user2.address)).to.equal(
        tokenParams.initialAmounts[0]
      );
      expect(await token.balanceOf(user3.address)).to.equal(
        tokenParams.initialAmounts[1]
      );

      // Verify fees were collected
      const feeCollectorBalanceAfter = await ethers.provider.getBalance(
        feeCollector.address
      );
      expect(feeCollectorBalanceAfter.sub(feeCollectorBalanceBefore)).to.equal(
        launchFee.add(tokenCreationFee)
      );

      // Verify pair token was spent
      const user1MockTokenBalanceAfter = await mockToken.balanceOf(
        user1.address
      );
      expect(
        user1MockTokenBalanceBefore.sub(user1MockTokenBalanceAfter)
      ).to.be.at.least(tokenPairParams.pairAmountMin);

      // Verify liquidity was created (check event)
      expect(launchCompletedEvent.args.liquidityTokenId).to.not.equal(0);
    });

    it("Should refund excess ETH if more than needed is sent", async function () {
      // Send extra ETH
      const extraEth = ethers.utils.parseEther("1");
      const totalEthSent = launchFee.add(tokenCreationFee).add(extraEth);

      // Track balances before
      const user1BalanceBefore = await ethers.provider.getBalance(
        user1.address
      );

      // Launch with token
      const tx = await launchManager
        .connect(user1)
        .instantLaunchWithToken(tokenParams, tokenPairParams, {
          value: totalEthSent,
        });

      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Get user balance after
      const user1BalanceAfter = await ethers.provider.getBalance(user1.address);

      // Calculate expected balance (accounting for gas and refund)
      const expectedBalance = user1BalanceBefore
        .sub(launchFee)
        .sub(tokenCreationFee)
        .sub(gasCost);

      // Allow for small rounding differences in gas calculation
      expect(user1BalanceAfter).to.be.closeTo(
        expectedBalance,
        ethers.utils.parseEther("0.001")
      );
    });

    it("Should fail if pair token transfer fails", async function () {
      // Set up token parameters
      const fees = launchFee.add(tokenCreationFee);

      // Don't approve the transfer, which should cause the launch to fail
      await mockToken.connect(user1).approve(launchManager.address, 0);

      await expect(
        launchManager
          .connect(user1)
          .instantLaunchWithToken(tokenParams, tokenPairParams, { value: fees })
      ).to.be.revertedWith("Pair token transfer failed");
    });
  });

  describe("Fee handling", function () {
    it("Should send fees to the fee collector", async function () {
      // Set up token parameters
      const tokenParams = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        totalSupply: INITIAL_SUPPLY,
        initialHolders: [user2.address],
        initialAmounts: [ethers.utils.parseEther("1000")],
        enableAntiBot: true,
      };

      // Set up ETH pair parameters
      const ethParams = {
        tokenAmount: TOKEN_AMOUNT_FOR_LIQUIDITY,
        ethAmount: ETH_AMOUNT_FOR_LIQUIDITY,
        tokenAmountMin: TOKEN_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        ethAmountMin: ETH_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        lockDuration: LOCK_DURATION,
      };

      // Track balances before
      const feeCollectorBalanceBefore = await ethers.provider.getBalance(
        feeCollector.address
      );

      // Calculate total ETH needed
      const totalEthNeeded = launchFee
        .add(tokenCreationFee)
        .add(ETH_AMOUNT_FOR_LIQUIDITY);

      // Launch with ETH
      await launchManager
        .connect(user1)
        .instantLaunchWithEth(tokenParams, ethParams, {
          value: totalEthNeeded,
        });

      // Verify fees were collected
      const feeCollectorBalanceAfter = await ethers.provider.getBalance(
        feeCollector.address
      );
      expect(feeCollectorBalanceAfter.sub(feeCollectorBalanceBefore)).to.equal(
        launchFee.add(tokenCreationFee)
      );
    });

    it("Should handle fee transfer failures", async function () {
      // Deploy a malicious fee collector that reverts on receive
      const MaliciousFeeCollector = await ethers.getContractFactory(
        "MaliciousFeeCollector"
      );
      const maliciousFeeCollector = await MaliciousFeeCollector.deploy();
      await maliciousFeeCollector.deployed();

      // Update fee collector in LaunchManager
      const LaunchManager = await ethers.getContractFactory("LaunchManager");
      const maliciousLaunchManager = await LaunchManager.deploy(
        tokenFactory.address,
        liquidityManager.address,
        maliciousFeeCollector.address,
        launchFee
      );
      await maliciousLaunchManager.deployed();

      // Set up token parameters
      const tokenParams = {
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
        totalSupply: INITIAL_SUPPLY,
        initialHolders: [user2.address],
        initialAmounts: [ethers.utils.parseEther("1000")],
        enableAntiBot: true,
      };

      // Set up ETH pair parameters
      const ethParams = {
        tokenAmount: TOKEN_AMOUNT_FOR_LIQUIDITY,
        ethAmount: ETH_AMOUNT_FOR_LIQUIDITY,
        tokenAmountMin: TOKEN_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        ethAmountMin: ETH_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        lockDuration: LOCK_DURATION,
      };

      // Calculate total ETH needed
      const totalEthNeeded = launchFee
        .add(tokenCreationFee)
        .add(ETH_AMOUNT_FOR_LIQUIDITY);

      // Launch with ETH - should fail due to malicious fee collector
      await expect(
        maliciousLaunchManager
          .connect(user1)
          .instantLaunchWithEth(tokenParams, ethParams, {
            value: totalEthNeeded,
          })
      ).to.be.revertedWith("Fee transfer failed");
    });
  });

  // Helper contracts for testing

  describe("Edge cases and specific scenarios", function () {
    it("Should handle token with zero decimals", async function () {
      // Set up token parameters with zero decimals
      const tokenParams = {
        name: "Zero Decimal Token",
        symbol: "ZDT",
        decimals: 0,
        totalSupply: 1000000, // 1M tokens with 0 decimals
        initialHolders: [user2.address],
        initialAmounts: [1000], // 1000 tokens with 0 decimals
        enableAntiBot: true,
      };

      // Set up ETH pair parameters
      const ethParams = {
        tokenAmount: 100000, // 100K tokens with 0 decimals
        ethAmount: ETH_AMOUNT_FOR_LIQUIDITY,
        tokenAmountMin: 95000, // 95K tokens with 0 decimals (5% slippage)
        ethAmountMin: ETH_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        lockDuration: LOCK_DURATION,
      };

      // Calculate total ETH needed
      const totalEthNeeded = launchFee
        .add(tokenCreationFee)
        .add(ETH_AMOUNT_FOR_LIQUIDITY);

      // Launch with ETH
      const tx = await launchManager
        .connect(user1)
        .instantLaunchWithEth(tokenParams, ethParams, {
          value: totalEthNeeded,
        });

      const receipt = await tx.wait();

      // Get the token address from the event
      const launchCompletedEvent = receipt.events.find(
        (e) => e.event === "LaunchCompleted"
      );
      const tokenAddress = launchCompletedEvent.args.tokenAddress;

      // Check token contract
      const token = await ethers.getContractAt("IERC20", tokenAddress);

      // Verify initial token distributions
      expect(await token.balanceOf(user2.address)).to.equal(
        tokenParams.initialAmounts[0]
      );
    });

    it("Should handle many initial holders", async function () {
      // Create a large number of initial holders (test with 10 for practicality)
      const initialHolders = [];
      const initialAmounts = [];

      for (let i = 0; i < 10; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        initialHolders.push(wallet.address);
        initialAmounts.push(ethers.utils.parseEther("100")); // 100 tokens each
      }

      // Set up token parameters
      const tokenParams = {
        name: "Many Holders Token",
        symbol: "MHT",
        decimals: 18,
        totalSupply: INITIAL_SUPPLY,
        initialHolders: initialHolders,
        initialAmounts: initialAmounts,
        enableAntiBot: true,
      };

      // Set up ETH pair parameters
      const ethParams = {
        tokenAmount: TOKEN_AMOUNT_FOR_LIQUIDITY,
        ethAmount: ETH_AMOUNT_FOR_LIQUIDITY,
        tokenAmountMin: TOKEN_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        ethAmountMin: ETH_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        lockDuration: LOCK_DURATION,
      };

      // Calculate total ETH needed
      const totalEthNeeded = launchFee
        .add(tokenCreationFee)
        .add(ETH_AMOUNT_FOR_LIQUIDITY);

      // Launch with ETH
      const tx = await launchManager
        .connect(user1)
        .instantLaunchWithEth(tokenParams, ethParams, {
          value: totalEthNeeded,
        });

      const receipt = await tx.wait();

      // Get the token address from the event
      const launchCompletedEvent = receipt.events.find(
        (e) => e.event === "LaunchCompleted"
      );
      const tokenAddress = launchCompletedEvent.args.tokenAddress;

      // Check token contract
      const token = await ethers.getContractAt("IERC20", tokenAddress);

      // Verify token distribution events
      const tokenDistributedEvents = receipt.events.filter(
        (e) => e.event === "TokenDistributed"
      );
      expect(tokenDistributedEvents.length).to.equal(initialHolders.length);

      // Verify a few random holders' balances
      const randomIndices = [0, 3, 7];
      for (const idx of randomIndices) {
        expect(await token.balanceOf(initialHolders[idx])).to.equal(
          initialAmounts[idx]
        );
      }
    });

    it("Should handle zero liquidity lock duration", async function () {
      // Set up token parameters
      const tokenParams = {
        name: "No Lock Token",
        symbol: "NLT",
        decimals: 18,
        totalSupply: INITIAL_SUPPLY,
        initialHolders: [user2.address],
        initialAmounts: [ethers.utils.parseEther("1000")],
        enableAntiBot: true,
      };

      // Set up ETH pair parameters with zero lock duration
      const ethParams = {
        tokenAmount: TOKEN_AMOUNT_FOR_LIQUIDITY,
        ethAmount: ETH_AMOUNT_FOR_LIQUIDITY,
        tokenAmountMin: TOKEN_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        ethAmountMin: ETH_AMOUNT_FOR_LIQUIDITY.mul(MIN_SLIPPAGE).div(1000),
        lockDuration: 0, // No lock
      };

      // Calculate total ETH needed
      const totalEthNeeded = launchFee
        .add(tokenCreationFee)
        .add(ETH_AMOUNT_FOR_LIQUIDITY);

      // Launch with ETH
      const tx = await launchManager
        .connect(user1)
        .instantLaunchWithEth(tokenParams, ethParams, {
          value: totalEthNeeded,
        });

      const receipt = await tx.wait();

      // Get the token address from the event
      const launchCompletedEvent = receipt.events.find(
        (e) => e.event === "LaunchCompleted"
      );
      expect(launchCompletedEvent).to.not.be.undefined;
    });
  });
});
