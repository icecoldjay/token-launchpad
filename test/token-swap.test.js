const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");

describe("TokenSwapContract - Comprehensive Test Suite", function () {
  // Test fixture for deployment and setup
  async function deployTokenSwapFixture() {
    const [owner, user1, user2, executor, feeRecipient] =
      await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy(
      "Token A",
      "TKNA",
      ethers.parseEther("1000000")
    );
    const tokenB = await MockERC20.deploy(
      "Token B",
      "TKNB",
      ethers.parseEther("1000000")
    );
    const tokenC = await MockERC20.deploy(
      "Token C",
      "TKNC",
      ethers.parseEther("1000000")
    );

    // Deploy mock Uniswap router
    const MockUniswapRouter = await ethers.getContractFactory(
      "MockUniswapRouter"
    );
    const uniswapRouter = await MockUniswapRouter.deploy();

    // Deploy TokenSwapContract
    const TokenSwapContract = await ethers.getContractFactory(
      "TokenSwapContract"
    );
    const tokenSwap = await TokenSwapContract.deploy(
      await uniswapRouter.getAddress()
    );

    // Setup initial token distributions
    await tokenA.transfer(user1.address, ethers.parseEther("10000"));
    await tokenA.transfer(user2.address, ethers.parseEther("10000"));
    await tokenB.transfer(user1.address, ethers.parseEther("10000"));
    await tokenB.transfer(user2.address, ethers.parseEther("10000"));
    await tokenC.transfer(user1.address, ethers.parseEther("10000"));

    // Setup router with mock liquidity
    await tokenA.transfer(
      await uniswapRouter.getAddress(),
      ethers.parseEther("100000")
    );
    await tokenB.transfer(
      await uniswapRouter.getAddress(),
      ethers.parseEther("100000")
    );
    await tokenC.transfer(
      await uniswapRouter.getAddress(),
      ethers.parseEther("100000")
    );

    return {
      tokenSwap,
      uniswapRouter,
      tokenA,
      tokenB,
      tokenC,
      owner,
      user1,
      user2,
      executor,
      feeRecipient,
    };
  }

  describe("A. Deployment and Initialization", function () {
    it("Should deploy with correct initial parameters", async function () {
      const { tokenSwap, uniswapRouter } = await loadFixture(
        deployTokenSwapFixture
      );

      expect(await tokenSwap.uniswapRouter()).to.equal(
        await uniswapRouter.getAddress()
      );
      expect(await tokenSwap.feePercentage()).to.equal(30);
      expect(await tokenSwap.FEE_DENOMINATOR()).to.equal(10000);
      expect(await tokenSwap.nextOrderId()).to.equal(0);
    });

    it("Should set owner correctly", async function () {
      const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);
      expect(await tokenSwap.owner()).to.equal(owner.address);
    });

    it("Should not be paused initially", async function () {
      const { tokenSwap } = await loadFixture(deployTokenSwapFixture);
      expect(await tokenSwap.paused()).to.be.false;
    });
  });

  describe("B. Basic Market Swap - Exact Tokens For Tokens", function () {
    it("Should execute basic market swap successfully", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const swapAmount = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), swapAmount);

      const initialBalanceA = await tokenA.balanceOf(user1.address);
      const initialBalanceB = await tokenB.balanceOf(user1.address);

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            ethers.parseEther("100"),
            0,
            deadline
          )
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should allow owner to unpause contract", async function () {
      const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).pause();
      await tokenSwap.connect(owner).unpause();
      expect(await tokenSwap.paused()).to.be.false;
    });

    it("Should revert when non-owner tries to pause", async function () {
      const { tokenSwap, user1 } = await loadFixture(deployTokenSwapFixture);

      await expect(tokenSwap.connect(user1).pause()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("C. Complex Market Swap - Tokens For Exact Tokens", function () {
    it("Should execute tokens for exact tokens swap", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const exactAmountOut = ethers.parseEther("100");
      const maxAmountIn = ethers.parseEther("110");
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), maxAmountIn);

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapTokensForExactTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            exactAmountOut,
            maxAmountIn,
            deadline
          )
      ).to.emit(tokenSwap, "MarketSwap");
    });

    it("Should revert when max amount in is exceeded", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const exactAmountOut = ethers.parseEther("100");
      const maxAmountIn = ethers.parseEther("50"); // Insufficient
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), maxAmountIn);

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapTokensForExactTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            exactAmountOut,
            maxAmountIn,
            deadline
          )
      ).to.be.revertedWith("Excessive input amount");
    });
  });

  describe("D. Limit Order Creation", function () {
    it("Should create limit order successfully", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("110");
      const expiry = (await time.latest()) + 86400; // 24 hours

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);

      await expect(
        tokenSwap
          .connect(user1)
          .createLimitOrder(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            amountIn,
            minAmountOut,
            expiry
          )
      ).to.emit(tokenSwap, "LimitOrderCreated");

      expect(await tokenSwap.nextOrderId()).to.equal(1);
    });

    it("Should store order details correctly", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("110");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);

      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      const order = await tokenSwap.getOrderDetails(0);
      expect(order.user).to.equal(user1.address);
      expect(order.tokenIn).to.equal(await tokenA.getAddress());
      expect(order.tokenOut).to.equal(await tokenB.getAddress());
      expect(order.amountIn).to.equal(amountIn);
      expect(order.minAmountOut).to.equal(minAmountOut);
      expect(order.executed).to.be.false;
      expect(order.cancelled).to.be.false;
    });

    it("Should track user orders", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("110");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn * 2n);

      // Create two orders
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      const userOrders = await tokenSwap.getUserOrders(user1.address);
      expect(userOrders.length).to.equal(2);
      expect(userOrders[0]).to.equal(0);
      expect(userOrders[1]).to.equal(1);
    });

    it("Should revert with zero amount", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );
      const expiry = (await time.latest()) + 86400;

      await expect(
        tokenSwap
          .connect(user1)
          .createLimitOrder(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            0,
            ethers.parseEther("110"),
            expiry
          )
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should revert with past expiry", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );
      const pastExpiry = (await time.latest()) - 3600;

      await expect(
        tokenSwap
          .connect(user1)
          .createLimitOrder(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            ethers.parseEther("100"),
            ethers.parseEther("110"),
            pastExpiry
          )
      ).to.be.revertedWith("Invalid expiry");
    });
  });

  describe("E. Executor Authorization", function () {
    it("Should allow owner to add authorized executor", async function () {
      const { tokenSwap, owner, executor } = await loadFixture(
        deployTokenSwapFixture
      );

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);
      expect(await tokenSwap.authorizedExecutors(executor.address)).to.be.true;
    });

    it("Should allow owner to remove authorized executor", async function () {
      const { tokenSwap, owner, executor } = await loadFixture(
        deployTokenSwapFixture
      );

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);
      await tokenSwap.connect(owner).removeAuthorizedExecutor(executor.address);
      expect(await tokenSwap.authorizedExecutors(executor.address)).to.be.false;
    });

    it("Should revert when non-owner tries to add executor", async function () {
      const { tokenSwap, user1, executor } = await loadFixture(
        deployTokenSwapFixture
      );

      await expect(
        tokenSwap.connect(user1).addAuthorizedExecutor(executor.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("F. Limit Order Execution", function () {
    it("Should execute limit order by authorized executor", async function () {
      const { tokenSwap, tokenA, tokenB, user1, owner, executor } =
        await loadFixture(deployTokenSwapFixture);

      // Setup
      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      // Execute
      await expect(tokenSwap.connect(executor).executeLimitOrder(0)).to.emit(
        tokenSwap,
        "LimitOrderExecuted"
      );

      const order = await tokenSwap.getOrderDetails(0);
      expect(order.executed).to.be.true;
    });

    it("Should revert when unauthorized user tries to execute", async function () {
      const { tokenSwap, tokenA, tokenB, user1, user2 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      await expect(
        tokenSwap.connect(user2).executeLimitOrder(0)
      ).to.be.revertedWith("Not authorized executor");
    });

    it("Should revert when trying to execute already executed order", async function () {
      const { tokenSwap, tokenA, tokenB, user1, owner, executor } =
        await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      await tokenSwap.connect(executor).executeLimitOrder(0);

      await expect(
        tokenSwap.connect(executor).executeLimitOrder(0)
      ).to.be.revertedWith("Order not executable");
    });

    it("Should revert when trying to execute expired order", async function () {
      const { tokenSwap, tokenA, tokenB, user1, owner, executor } =
        await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const expiry = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      // Fast forward past expiry
      await time.increase(7200);

      await expect(
        tokenSwap.connect(executor).executeLimitOrder(0)
      ).to.be.revertedWith("Order expired");
    });
  });

  describe("G. Batch Order Execution", function () {
    it("Should execute multiple valid orders", async function () {
      const { tokenSwap, tokenA, tokenB, user1, user2, owner, executor } =
        await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const expiry = (await time.latest()) + 86400;

      // Create orders from different users
      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenA
        .connect(user2)
        .approve(await tokenSwap.getAddress(), amountIn);

      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      await tokenSwap
        .connect(user2)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      // Execute batch
      await expect(
        tokenSwap.connect(executor).executeBatchLimitOrders([0, 1])
      ).to.emit(tokenSwap, "LimitOrderExecuted");

      const order1 = await tokenSwap.getOrderDetails(0);
      const order2 = await tokenSwap.getOrderDetails(1);
      expect(order1.executed).to.be.true;
      expect(order2.executed).to.be.true;
    });

    it("Should skip invalid orders in batch", async function () {
      const { tokenSwap, tokenA, tokenB, user1, owner, executor } =
        await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const shortExpiry = (await time.latest()) + 1;
      const longExpiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn * 2n);

      // Create one order that will expire and one valid
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          shortExpiry
        );

      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          longExpiry
        );

      // Wait for first order to expire
      await time.increase(3600);

      // Execute batch - should skip expired order
      await tokenSwap.connect(executor).executeBatchLimitOrders([0, 1]);

      const order1 = await tokenSwap.getOrderDetails(0);
      const order2 = await tokenSwap.getOrderDetails(1);
      expect(order1.executed).to.be.false; // Skipped due to expiry
      expect(order2.executed).to.be.true; // Executed successfully
    });
  });

  describe("H. Order Cancellation", function () {
    it("Should allow user to cancel their own order", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("110");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      const initialBalance = await tokenA.balanceOf(user1.address);

      await expect(tokenSwap.connect(user1).cancelLimitOrder(0)).to.emit(
        tokenSwap,
        "LimitOrderCancelled"
      );

      const finalBalance = await tokenA.balanceOf(user1.address);
      expect(finalBalance).to.equal(initialBalance + amountIn);

      const order = await tokenSwap.getOrderDetails(0);
      expect(order.cancelled).to.be.true;
    });

    it("Should revert when non-owner tries to cancel order", async function () {
      const { tokenSwap, tokenA, tokenB, user1, user2 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("110");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      await expect(
        tokenSwap.connect(user2).cancelLimitOrder(0)
      ).to.be.revertedWith("Not order owner");
    });

    it("Should revert when trying to cancel executed order", async function () {
      const { tokenSwap, tokenA, tokenB, user1, owner, executor } =
        await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      await tokenSwap.connect(executor).executeLimitOrder(0);

      await expect(
        tokenSwap.connect(user1).cancelLimitOrder(0)
      ).to.be.revertedWith("Order not cancellable");
    });
  });

  describe("I. Quote and View Functions", function () {
    it("Should return correct quote with fees", async function () {
      const { tokenSwap, tokenA, tokenB } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const [amountOut, fee] = await tokenSwap.getQuote(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn
      );

      const expectedFee = (amountIn * 30n) / 10000n;
      expect(fee).to.equal(expectedFee);
      expect(amountOut).to.be.gt(0);
    });

    it("Should return active orders correctly", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("110");
      const shortExpiry = (await time.latest()) + 3600;
      const longExpiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn * 3n);

      // Create orders with different expiries
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          shortExpiry
        );

      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          longExpiry
        );

      // Cancel first order
      await tokenSwap.connect(user1).cancelLimitOrder(0);

      const activeOrders = await tokenSwap.getActiveOrdersByUser(user1.address);
      expect(activeOrders.length).to.equal(1);
      expect(activeOrders[0]).to.equal(1);
    });
  });

  describe("J. Admin Functions - Fee Management", function () {
    it("Should allow owner to set fee percentage", async function () {
      const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).setFeePercentage(50); // 0.5%
      expect(await tokenSwap.feePercentage()).to.equal(50);
    });

    it("Should revert when setting fee too high", async function () {
      const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);

      await expect(
        tokenSwap.connect(owner).setFeePercentage(600) // 6%
      ).to.be.revertedWith("Fee too high");
    });

    it("Should revert when non-owner tries to set fee", async function () {
      const { tokenSwap, user1 } = await loadFixture(deployTokenSwapFixture);

      await expect(
        tokenSwap.connect(user1).setFeePercentage(50)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("K. Admin Functions - Fee Withdrawal", function () {
    it("Should allow owner to withdraw accumulated fees", async function () {
      const { tokenSwap, tokenA, tokenB, user1, owner, feeRecipient } =
        await loadFixture(deployTokenSwapFixture);

      // Perform some swaps to accumulate fees
      const swapAmount = ethers.parseEther("100");
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), swapAmount);
      await tokenSwap
        .connect(user1)
        .marketSwapExactTokensForTokens(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          swapAmount,
          0,
          deadline
        );

      const contractBalance = await tokenA.balanceOf(
        await tokenSwap.getAddress()
      );
      expect(contractBalance).to.be.gt(0);

      const initialBalance = await tokenA.balanceOf(feeRecipient.address);

      await tokenSwap
        .connect(owner)
        .withdrawFees(await tokenA.getAddress(), feeRecipient.address);

      const finalBalance = await tokenA.balanceOf(feeRecipient.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should revert when non-owner tries to withdraw fees", async function () {
      const { tokenSwap, tokenA, user1, feeRecipient } = await loadFixture(
        deployTokenSwapFixture
      );

      await expect(
        tokenSwap
          .connect(user1)
          .withdrawFees(await tokenA.getAddress(), feeRecipient.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("L. Pause/Unpause Functionality", function () {
    it("Should allow owner to pause contract", async function () {
      const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).pause();
      expect(await tokenSwap.paused()).to.be.true;
    });

    it("Should prevent operations when paused", async function () {
      const { tokenSwap, tokenA, tokenB, user1, owner } = await loadFixture(
        deployTokenSwapFixture
      );

      await tokenSwap.connect(owner).pause();
      const deadline = (await time.latest()) + 3600;

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            swapAmount,
            minAmountOut,
            deadline
          )
      ).to.emit(tokenSwap, "MarketSwap");

      const finalBalanceA = await tokenA.balanceOf(user1.address);
      const finalBalanceB = await tokenB.balanceOf(user1.address);

      expect(finalBalanceA).to.be.lt(initialBalanceA);
      expect(finalBalanceB).to.be.gt(initialBalanceB);
    });

    it("Should calculate and deduct fees correctly", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const swapAmount = ethers.parseEther("100");
      const expectedFee = (swapAmount * 30n) / 10000n; // 0.3%
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), swapAmount);

      const tx = await tokenSwap
        .connect(user1)
        .marketSwapExactTokensForTokens(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          swapAmount,
          0,
          deadline
        );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "MarketSwap"
      );

      expect(event.args.fee).to.equal(expectedFee);
    });

    it("Should revert with zero amount", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );
      const deadline = (await time.latest()) + 3600;

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            0,
            0,
            deadline
          )
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should revert with expired deadline", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );
      const pastDeadline = (await time.latest()) - 3600;

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            ethers.parseEther("100"),
            0,
            pastDeadline
          )
      ).to.be.revertedWith("Deadline exceeded");
    });
  });

  describe("M. Emergency Functions", function () {
    it("Should allow owner to emergency withdraw tokens", async function () {
      const { tokenSwap, tokenA, owner, feeRecipient } = await loadFixture(
        deployTokenSwapFixture
      );

      // Send some tokens to contract
      await tokenA.transfer(
        await tokenSwap.getAddress(),
        ethers.parseEther("100")
      );

      const contractBalance = await tokenA.balanceOf(
        await tokenSwap.getAddress()
      );
      const initialBalance = await tokenA.balanceOf(feeRecipient.address);

      await tokenSwap
        .connect(owner)
        .emergencyWithdraw(
          await tokenA.getAddress(),
          feeRecipient.address,
          contractBalance
        );

      const finalBalance = await tokenA.balanceOf(feeRecipient.address);
      expect(finalBalance).to.equal(initialBalance + contractBalance);
    });

    it("Should allow cleanup of expired orders", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("110");
      const shortExpiry = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          shortExpiry
        );

      // Fast forward past expiry
      await time.increase(7200);

      const initialBalance = await tokenA.balanceOf(user1.address);

      await expect(tokenSwap.cleanupExpiredOrder(0)).to.emit(
        tokenSwap,
        "LimitOrderCancelled"
      );

      const finalBalance = await tokenA.balanceOf(user1.address);
      expect(finalBalance).to.equal(initialBalance + amountIn);
    });

    it("Should revert cleanup of non-expired order", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("110");
      const longExpiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          longExpiry
        );

      await expect(tokenSwap.cleanupExpiredOrder(0)).to.be.revertedWith(
        "Order not expired"
      );
    });
  });

  describe("N. Reentrancy Protection", function () {
    it("Should prevent reentrancy attacks on market swaps", async function () {
      const { tokenSwap, user1 } = await loadFixture(deployTokenSwapFixture);

      // Deploy malicious token that attempts reentrancy
      const MaliciousToken = await ethers.getContractFactory("MaliciousToken");
      const maliciousToken = await MaliciousToken.deploy(
        await tokenSwap.getAddress()
      );

      await maliciousToken.mint(user1.address, ethers.parseEther("1000"));
      await maliciousToken
        .connect(user1)
        .approve(await tokenSwap.getAddress(), ethers.parseEther("100"));

      const deadline = (await time.latest()) + 3600;

      // This should fail due to reentrancy guard
      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await maliciousToken.getAddress(),
            await tokenA.getAddress(),
            ethers.parseEther("100"),
            0,
            deadline
          )
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });
  });

  describe("O. Edge Cases - Zero Address Handling", function () {
    it("Should handle operations with different token addresses", async function () {
      const { tokenSwap, tokenA, tokenC, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const swapAmount = ethers.parseEther("100");
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), swapAmount);

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await tokenA.getAddress(),
            await tokenC.getAddress(),
            swapAmount,
            0,
            deadline
          )
      ).to.emit(tokenSwap, "MarketSwap");
    });
  });

  describe("P. Gas Optimization Tests", function () {
    it("Should handle batch operations efficiently", async function () {
      const { tokenSwap, tokenA, tokenB, user1, owner, executor } =
        await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);

      const amountIn = ethers.parseEther("10");
      const minAmountOut = ethers.parseEther("9");
      const expiry = (await time.latest()) + 86400;

      // Create multiple orders
      const orderCount = 5;
      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn * BigInt(orderCount));

      const orderIds = [];
      for (let i = 0; i < orderCount; i++) {
        await tokenSwap
          .connect(user1)
          .createLimitOrder(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            amountIn,
            minAmountOut,
            expiry
          );
        orderIds.push(i);
      }

      // Execute batch
      const tx = await tokenSwap
        .connect(executor)
        .executeBatchLimitOrders(orderIds);
      const receipt = await tx.wait();

      // Should emit multiple execution events
      const executionEvents = receipt.logs.filter(
        (log) => log.fragment && log.fragment.name === "LimitOrderExecuted"
      );
      expect(executionEvents.length).to.equal(orderCount);
    });
  });

  describe("Q. Token Approval Edge Cases", function () {
    it("Should handle insufficient allowance gracefully", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const swapAmount = ethers.parseEther("100");
      const deadline = (await time.latest()) + 3600;

      // Approve less than required
      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), ethers.parseEther("50"));

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            swapAmount,
            0,
            deadline
          )
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should handle zero allowance", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const swapAmount = ethers.parseEther("100");
      const deadline = (await time.latest()) + 3600;

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            swapAmount,
            0,
            deadline
          )
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });
  });

  describe("R. Slippage Protection", function () {
    it("Should revert when minimum amount out not met", async function () {
      const { tokenSwap, tokenA, tokenB, user1, uniswapRouter } =
        await loadFixture(deployTokenSwapFixture);

      // Set up router to return less than expected
      await uniswapRouter.setSlippageMode(true);

      const swapAmount = ethers.parseEther("100");
      const highMinAmountOut = ethers.parseEther("200"); // Unrealistic expectation
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), swapAmount);

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            swapAmount,
            highMinAmountOut,
            deadline
          )
      ).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
    });
  });

  describe("S. Event Emission Verification", function () {
    it("Should emit correct events with proper parameters", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const swapAmount = ethers.parseEther("100");
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), swapAmount);

      const tx = await tokenSwap
        .connect(user1)
        .marketSwapExactTokensForTokens(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          swapAmount,
          0,
          deadline
        );

      await expect(tx)
        .to.emit(tokenSwap, "MarketSwap")
        .withArgs(
          user1.address,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          swapAmount,
          ethers.parseEther("99.7"), // Expected output after 0.3% fee
          ethers.parseEther("0.3") // Expected fee
        );
    });
  });

  describe("T. Multiple User Interactions", function () {
    it("Should handle concurrent operations from multiple users", async function () {
      const { tokenSwap, tokenA, tokenB, user1, user2 } = await loadFixture(
        deployTokenSwapFixture
      );

      const swapAmount = ethers.parseEther("100");
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), swapAmount);
      await tokenA
        .connect(user2)
        .approve(await tokenSwap.getAddress(), swapAmount);

      // Both users perform swaps
      await tokenSwap
        .connect(user1)
        .marketSwapExactTokensForTokens(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          swapAmount,
          0,
          deadline
        );

      await tokenSwap
        .connect(user2)
        .marketSwapExactTokensForTokens(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          swapAmount,
          0,
          deadline
        );

      // Verify both users received tokens
      expect(await tokenB.balanceOf(user1.address)).to.be.gt(
        ethers.parseEther("10000")
      );
      expect(await tokenB.balanceOf(user2.address)).to.be.gt(
        ethers.parseEther("10000")
      );
    });

    it("Should maintain separate order lists for different users", async function () {
      const { tokenSwap, tokenA, tokenB, user1, user2 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("110");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn * 2n);
      await tokenA
        .connect(user2)
        .approve(await tokenSwap.getAddress(), amountIn);

      // User1 creates 2 orders, User2 creates 1 order
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      await tokenSwap
        .connect(user2)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      const user1Orders = await tokenSwap.getUserOrders(user1.address);
      const user2Orders = await tokenSwap.getUserOrders(user2.address);

      expect(user1Orders.length).to.equal(2);
      expect(user2Orders.length).to.equal(1);
      expect(user1Orders).to.deep.equal([0, 2]);
      expect(user2Orders).to.deep.equal([1]);
    });
  });

  describe("U. Fee Calculation Precision", function () {
    it("Should handle fee calculations with small amounts", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const smallAmount = ethers.parseUnits("1", 12); // Very small amount
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), smallAmount);

      const [expectedAmountOut, expectedFee] = await tokenSwap.getQuote(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        smallAmount
      );

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            smallAmount,
            0,
            deadline
          )
      ).to.emit(tokenSwap, "MarketSwap");
    });

    it("Should handle fee calculations with large amounts", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const largeAmount = ethers.parseEther("1000");
      await tokenA.transfer(user1.address, largeAmount);

      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), largeAmount);

      const expectedFee = (largeAmount * 30n) / 10000n;

      const tx = await tokenSwap
        .connect(user1)
        .marketSwapExactTokensForTokens(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          largeAmount,
          0,
          deadline
        );

      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "MarketSwap"
      );

      expect(event.args.fee).to.equal(expectedFee);
    });
  });

  describe("V. Time-based Operations", function () {
    it("Should handle orders with different expiry times correctly", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("110");
      const currentTime = await time.latest();

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn * 3n);

      // Create orders with different expiries
      await tokenSwap.connect(user1).createLimitOrder(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        minAmountOut,
        currentTime + 3600 // 1 hour
      );

      await tokenSwap.connect(user1).createLimitOrder(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        minAmountOut,
        currentTime + 7200 // 2 hours
      );

      await tokenSwap.connect(user1).createLimitOrder(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        minAmountOut,
        currentTime + 86400 // 24 hours
      );

      // Fast forward 1.5 hours
      await time.increase(5400);

      const activeOrders = await tokenSwap.getActiveOrdersByUser(user1.address);
      expect(activeOrders.length).to.equal(2); // Only 2 should be active
    });
  });

  describe("W. Contract State Consistency", function () {
    it("Should maintain consistent state after multiple operations", async function () {
      const { tokenSwap, tokenA, tokenB, user1, owner, executor } =
        await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn * 5n);

      // Create multiple orders
      for (let i = 0; i < 3; i++) {
        await tokenSwap
          .connect(user1)
          .createLimitOrder(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            amountIn,
            minAmountOut,
            expiry
          );
      }

      // Execute one order
      await tokenSwap.connect(executor).executeLimitOrder(0);

      // Cancel one order
      await tokenSwap.connect(user1).cancelLimitOrder(1);

      // Verify state consistency
      const order0 = await tokenSwap.getOrderDetails(0);
      const order1 = await tokenSwap.getOrderDetails(1);
      const order2 = await tokenSwap.getOrderDetails(2);

      expect(order0.executed).to.be.true;
      expect(order0.cancelled).to.be.false;

      expect(order1.executed).to.be.false;
      expect(order1.cancelled).to.be.true;

      expect(order2.executed).to.be.false;
      expect(order2.cancelled).to.be.false;

      expect(await tokenSwap.nextOrderId()).to.equal(3);

      const activeOrders = await tokenSwap.getActiveOrdersByUser(user1.address);
      expect(activeOrders.length).to.equal(1);
      expect(activeOrders[0]).to.equal(2);
    });
  });

  describe("X. Extreme Value Testing", function () {
    it("Should handle maximum uint256 values appropriately", async function () {
      const { tokenSwap, tokenA, tokenB } = await loadFixture(
        deployTokenSwapFixture
      );

      const maxUint256 = ethers.MaxUint256;

      // This should not overflow
      const [amountOut, fee] = await tokenSwap.getQuote(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        maxUint256
      );

      expect(fee).to.be.gt(0);
      expect(amountOut).to.be.gt(0);
    });

    it("Should handle minimum non-zero values", async function () {
      const { tokenSwap, tokenA, tokenB, user1 } = await loadFixture(
        deployTokenSwapFixture
      );

      const minAmount = 1n; // Minimum possible amount
      const deadline = (await time.latest()) + 3600;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), minAmount);

      await expect(
        tokenSwap
          .connect(user1)
          .marketSwapExactTokensForTokens(
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            minAmount,
            0,
            deadline
          )
      ).to.emit(tokenSwap, "MarketSwap");
    });
  });

  describe("Y. Integration with Mock Router Edge Cases", function () {
    it("Should handle router failures gracefully in batch execution", async function () {
      const {
        tokenSwap,
        tokenA,
        tokenB,
        user1,
        owner,
        executor,
        uniswapRouter,
      } = await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);

      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn * 2n);

      // Create orders
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      // Set router to fail for specific conditions
      await uniswapRouter.setFailMode(true);

      // Batch execution should not revert, just skip failed orders
      await tokenSwap.connect(executor).executeBatchLimitOrders([0, 1]);

      // Both orders should remain unexecuted
      const order0 = await tokenSwap.getOrderDetails(0);
      const order1 = await tokenSwap.getOrderDetails(1);
      expect(order0.executed).to.be.false;
      expect(order1.executed).to.be.false;
    });
  });

  describe("Z. Comprehensive Security and Final Validation", function () {
    it("Should maintain security under complex attack scenarios", async function () {
      const { tokenSwap, tokenA, tokenB, user1, user2, owner, executor } =
        await loadFixture(deployTokenSwapFixture);

      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);

      // Attempt to manipulate order execution through front-running
      const amountIn = ethers.parseEther("100");
      const minAmountOut = ethers.parseEther("95");
      const expiry = (await time.latest()) + 86400;

      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), amountIn);
      await tokenSwap
        .connect(user1)
        .createLimitOrder(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          expiry
        );

      // User2 tries to cancel user1's order (should fail)
      await expect(
        tokenSwap.connect(user2).cancelLimitOrder(0)
      ).to.be.revertedWith("Not order owner");

      // Non-authorized executor tries to execute (should fail)
      await expect(
        tokenSwap.connect(user2).executeLimitOrder(0)
      ).to.be.revertedWith("Not authorized executor");

      // Authorized executor executes successfully
      await expect(tokenSwap.connect(executor).executeLimitOrder(0)).to.emit(
        tokenSwap,
        "LimitOrderExecuted"
      );
    });

    it("Should handle all edge cases in final comprehensive test", async function () {
      const {
        tokenSwap,
        tokenA,
        tokenB,
        tokenC,
        user1,
        user2,
        owner,
        executor,
        feeRecipient,
      } = await loadFixture(deployTokenSwapFixture);

      // Setup
      await tokenSwap.connect(owner).addAuthorizedExecutor(executor.address);
      await tokenSwap.connect(owner).setFeePercentage(50); // Change fee to 0.5%

      const swapAmount = ethers.parseEther("100");
      const deadline = (await time.latest()) + 3600;

      // Test market swap with new fee
      await tokenA
        .connect(user1)
        .approve(await tokenSwap.getAddress(), swapAmount);
      await tokenSwap
        .connect(user1)
        .marketSwapExactTokensForTokens(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          swapAmount,
          0,
          deadline
        );

      // Test limit orders with different tokens
      await tokenB
        .connect(user2)
        .approve(await tokenSwap.getAddress(), swapAmount);
      await tokenSwap
        .connect(user2)
        .createLimitOrder(
          await tokenB.getAddress(),
          await tokenC.getAddress(),
          swapAmount,
          ethers.parseEther("95"),
          (await time.latest()) + 86400
        );

      // Execute limit order
      await tokenSwap.connect(executor).executeLimitOrder(0);

      // Test fee withdrawal
      await tokenSwap
        .connect(owner)
        .withdrawFees(await tokenA.getAddress(), feeRecipient.address);

      // Test pause/unpause
      await tokenSwap.connect(owner).pause();
      await tokenSwap.connect(owner).unpause();

      // Verify final state is consistent
      expect(await tokenSwap.paused()).to.be.false;
      expect(await tokenSwap.feePercentage()).to.equal(50);
      expect(await tokenSwap.nextOrderId()).to.equal(1);

      const order = await tokenSwap.getOrderDetails(0);
      expect(order.executed).to.be.true;
    });
  });
});

// // Mock contracts for testing
// contract MockERC20 {
//     string public name;
//     string public symbol;
//     uint8 public decimals = 18;
//     uint256 public totalSupply;

//     mapping(address => uint256) public balanceOf;
//     mapping(address => mapping(address => uint256)) public allowance;

//     event Transfer(address indexed from, address indexed to, uint256 value);
//     event Approval(address indexed owner, address indexed spender, uint256 value);

//     constructor(string memory _name, string memory _symbol, uint256 _totalSupply) {
//         name = _name;
//         symbol = _symbol;
//         totalSupply = _totalSupply;
//         balanceOf[msg.sender] = _totalSupply;
//     }

//     function transfer(address to, uint256 amount) external returns (bool) {
//         require(balanceOf[msg.sender] >= amount, "ERC20: transfer amount exceeds balance");
//         balanceOf[msg.sender] -= amount;
//         balanceOf[to] += amount;
//         emit Transfer(msg.sender, to, amount);
//         return true;
//     }

//     function approve(address spender, uint256 amount) external returns (bool) {
//         allowance[msg.sender][spender] = amount;
//         emit Approval(msg.sender, spender, amount);
//         return true;
//     }

//     function transferFrom(address from, address to, uint256 amount) external returns (bool) {
//         require(allowance[from][msg.sender] >= amount, "ERC20: insufficient allowance");
//         require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");

//         allowance[from][msg.sender] -= amount;
//         balanceOf[from] -= amount;
//         balanceOf[to] += amount;

//         emit Transfer(from, to, amount);
//         return true;
//     }
// }

// contract MockUniswapRouter {
//     bool public slippageMode = false;
//     bool public failMode = false;

//     function setSlippageMode(bool _enabled) external {
//         slippageMode = _enabled;
//     }

//     function setFailMode(bool _enabled) external {
//         failMode = _enabled;
//     }

//     function swapExactTokensForTokens(
//         uint amountIn,
//         uint amountOutMin,
//         address[] calldata path,
//         address to,
//         uint deadline
//     ) external returns (uint[] memory amounts) {
//         require(!failMode, "Router: SWAP_FAILED");
//         require(deadline >= block.timestamp, "Router: EXPIRED");

//         amounts = new uint[](2);
//         amounts[0] = amountIn;

//         if (slippageMode) {
//             amounts[1] = amountIn / 2; // Simulate high slippage
//         } else {
//             amounts[1] = (amountIn * 997) / 1000; // Simulate 0.3% slippage
//         }

//         require(amounts[1] >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");

//         // Transfer tokens (simplified)
//         IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
//         IERC20(path[1]).transfer(to, amounts[1]);
//     }

//     function swapTokensForExactTokens(
//         uint amountOut,
//         uint amountInMax,
//         address[] calldata path,
//         address to,
//         uint deadline
//     ) external returns (uint[] memory amounts) {
//         require(!failMode, "Router: SWAP_FAILED");
//         require(deadline >= block.timestamp, "Router: EXPIRED");

//         amounts = new uint[](2);
//         amounts[1] = amountOut;
//         amounts[0] = (amountOut * 1003) / 1000; // Simulate 0.3% slippage

//         require(amounts[0] <= amountInMax, "UniswapV2Router: EXCESSIVE_INPUT_AMOUNT");

//         // Transfer tokens (simplified)
//         IERC20(path[0]).transferFrom(msg.sender, address(this), amounts[0]);
//         IERC20(path[1]).transfer(to, amountOut);
//     }

//     function getAmountsOut(uint amountIn, address[] calldata path)
//         external pure returns (uint[] memory amounts)
//     {
//         amounts = new uint[](2);
//         amounts[0] = amountIn;
//         amounts[1
