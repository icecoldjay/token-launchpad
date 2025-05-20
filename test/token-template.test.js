const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("TokenTemplate Contract", function () {
  // Test fixture to deploy the contract and set up test environment
  async function deployTokenFixture() {
    const [
      owner,
      addr1,
      addr2,
      addr3,
      addr4,
      liquidityManager,
      launchManager,
      ...addrs
    ] = await ethers.getSigners();

    const TokenTemplate = await ethers.getContractFactory("TokenTemplate");

    // Default parameters for token deployment
    const name = "Test Token";
    const symbol = "TST";
    const totalSupply = ethers.utils.parseEther("1000000"); // 1 million tokens with 18 decimals

    const initialHolders = [addr1.address, addr2.address, addr3.address];
    const initialAmounts = [
      ethers.utils.parseEther("10000"),
      ethers.utils.parseEther("20000"),
      ethers.utils.parseEther("50000"),
    ];
    const tokensToDistribute = initialAmounts.reduce(
      (a, b) => a.add(b),
      ethers.BigNumber.from(0)
    );

    // Deploy the contract with initial configuration
    const token = await TokenTemplate.deploy(
      name,
      symbol,
      totalSupply,
      owner.address,
      initialHolders,
      initialAmounts,
      liquidityManager.address,
      launchManager.address,
      true // launchWithLiquidity
    );

    await token.deployed();

    return {
      token,
      owner,
      addr1,
      addr2,
      addr3,
      addr4,
      liquidityManager,
      launchManager,
      addrs,
      name,
      symbol,
      totalSupply,
      initialHolders,
      initialAmounts,
      tokensToDistribute,
    };
  }

  // Helper function to deploy with custom parameters
  async function deployWithCustomParams(params) {
    const [
      owner,
      addr1,
      addr2,
      addr3,
      addr4,
      liquidityManager,
      launchManager,
      ...addrs
    ] = await ethers.getSigners();

    const TokenTemplate = await ethers.getContractFactory("TokenTemplate");

    // Default parameters that can be overridden
    const defaultParams = {
      name: "Test Token",
      symbol: "TST",
      totalSupply: ethers.utils.parseEther("1000000"),
      initialOwner: owner.address,
      initialHolders: [addr1.address, addr2.address, addr3.address],
      initialAmounts: [
        ethers.utils.parseEther("10000"),
        ethers.utils.parseEther("20000"),
        ethers.utils.parseEther("50000"),
      ],
      liquidityManager: liquidityManager.address,
      launchManager: launchManager.address,
      launchWithLiquidity: true,
    };

    // Merge provided params with defaults
    const deployParams = { ...defaultParams, ...params };

    // Deploy with merged parameters
    const token = await TokenTemplate.deploy(
      deployParams.name,
      deployParams.symbol,
      deployParams.totalSupply,
      deployParams.initialOwner,
      deployParams.initialHolders,
      deployParams.initialAmounts,
      deployParams.liquidityManager,
      deployParams.launchManager,
      deployParams.launchWithLiquidity
    );

    await token.deployed();

    return {
      token,
      owner,
      addr1,
      addr2,
      addr3,
      addr4,
      liquidityManager,
      launchManager,
      addrs,
      deployParams,
    };
  }

  // Tests for constructor and initial state
  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      const { token, name, symbol } = await loadFixture(deployTokenFixture);

      expect(await token.name()).to.equal(name);
      expect(await token.symbol()).to.equal(symbol);
    });

    it("Should assign the total supply to the owner", async function () {
      const { token, owner, totalSupply } = await loadFixture(
        deployTokenFixture
      );

      expect(await token.balanceOf(owner.address)).to.equal(totalSupply);
    });

    it("Should set the correct tokens to distribute", async function () {
      const { token, tokensToDistribute } = await loadFixture(
        deployTokenFixture
      );

      expect(await token.tokensToDistribute()).to.equal(tokensToDistribute);
    });

    it("Should whitelist the owner by default", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      expect(await token.isWhitelisted(owner.address)).to.be.true;
    });

    it("Should whitelist the liquidity manager", async function () {
      const { token, liquidityManager } = await loadFixture(deployTokenFixture);

      expect(await token.isWhitelisted(liquidityManager.address)).to.be.true;
    });

    it("Should whitelist the launch manager", async function () {
      const { token, launchManager } = await loadFixture(deployTokenFixture);

      expect(await token.isWhitelisted(launchManager.address)).to.be.true;
    });

    it("Should set trading enabled to false initially", async function () {
      const { token } = await loadFixture(deployTokenFixture);

      expect(await token.tradingEnabled()).to.be.false;
    });

    it("Should check that launchTime and launchBlock are not set initially", async function () {
      const { token } = await loadFixture(deployTokenFixture);
      const launchTime = await token.launchTime();
      const launchBlock = await token.launchBlock();

      expect(launchTime).to.equal(0);
      expect(launchBlock).to.equal(0);
    });

    it("Should revert when initialHolders and initialAmounts length mismatch", async function () {
      const { owner, addr1, addr2, liquidityManager, launchManager } =
        await loadFixture(deployTokenFixture);
      const TokenTemplate = await ethers.getContractFactory("TokenTemplate");

      await expect(
        TokenTemplate.deploy(
          "Test Token",
          "TST",
          ethers.utils.parseEther("1000000"),
          owner.address,
          [addr1.address, addr2.address], // 2 holders
          [ethers.utils.parseEther("10000")], // 1 amount
          liquidityManager.address,
          launchManager.address,
          true
        )
      ).to.be.revertedWith("Arrays length mismatch");
    });

    it("Should revert when more than 10 initial holders are provided", async function () {
      const { owner, addrs, liquidityManager, launchManager } =
        await loadFixture(deployTokenFixture);
      const TokenTemplate = await ethers.getContractFactory("TokenTemplate");

      // Create arrays with 11 elements (exceeding the 10 limit)
      const holders = addrs.slice(0, 11).map((addr) => addr.address);
      const amounts = Array(11).fill(ethers.utils.parseEther("1000"));

      await expect(
        TokenTemplate.deploy(
          "Test Token",
          "TST",
          ethers.utils.parseEther("1000000"),
          owner.address,
          holders,
          amounts,
          liquidityManager.address,
          launchManager.address,
          true
        )
      ).to.be.revertedWith("Maximum 10 initial holders allowed");
    });

    it("Should revert when distribution exceeds total supply", async function () {
      const { owner, addr1, addr2, liquidityManager, launchManager } =
        await loadFixture(deployTokenFixture);
      const TokenTemplate = await ethers.getContractFactory("TokenTemplate");

      const totalSupply = ethers.utils.parseEther("1000");
      const overAllocatedAmount = ethers.utils.parseEther("1001"); // Exceeds total supply

      await expect(
        TokenTemplate.deploy(
          "Test Token",
          "TST",
          totalSupply,
          owner.address,
          [addr1.address],
          [overAllocatedAmount],
          liquidityManager.address,
          launchManager.address,
          true
        )
      ).to.be.revertedWith("Distribution exceeds total supply");
    });

    it("Should correctly calculate tokensToDistribute with some zero amounts", async function () {
      const result = await deployWithCustomParams({
        initialHolders: [
          "0x0000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000001",
        ],
        initialAmounts: [
          ethers.utils.parseEther("0"),
          ethers.utils.parseEther("5000"),
        ],
      });

      expect(await result.token.tokensToDistribute()).to.equal(
        ethers.utils.parseEther("5000")
      );
    });

    it("Should handle zero address for liquidity manager", async function () {
      const result = await deployWithCustomParams({
        liquidityManager: ethers.constants.AddressZero,
      });

      // Verify the zero address is not whitelisted
      expect(await result.token.isWhitelisted(ethers.constants.AddressZero)).to
        .be.false;
    });

    it("Should handle zero address for launch manager", async function () {
      const result = await deployWithCustomParams({
        launchManager: ethers.constants.AddressZero,
      });

      // Verify the zero address is not whitelisted
      expect(await result.token.isWhitelisted(ethers.constants.AddressZero)).to
        .be.false;
    });

    it("Should approve launchManager for all tokens when launchWithLiquidity is true", async function () {
      const { token, owner, launchManager, totalSupply } = await loadFixture(
        deployTokenFixture
      );

      const allowance = await token.allowance(
        owner.address,
        launchManager.address
      );
      expect(allowance).to.equal(totalSupply);
    });

    it("Should approve launchManager only for tokensToDistribute when launchWithLiquidity is false", async function () {
      const result = await deployWithCustomParams({
        launchWithLiquidity: false,
      });

      const allowance = await result.token.allowance(
        result.owner.address,
        result.launchManager.address
      );
      const tokensToDistribute = await result.token.tokensToDistribute();

      expect(allowance).to.equal(tokensToDistribute);
    });

    it("Should approve liquidityManager for remaining tokens", async function () {
      const {
        token,
        owner,
        liquidityManager,
        totalSupply,
        tokensToDistribute,
      } = await loadFixture(deployTokenFixture);

      const expectedRemainingTokens = totalSupply.sub(tokensToDistribute);
      const allowance = await token.allowance(
        owner.address,
        liquidityManager.address
      );

      expect(allowance).to.equal(expectedRemainingTokens);
    });

    it("Should emit proper events during construction", async function () {
      const [owner, addr1, addr2, liquidityManager, launchManager] =
        await ethers.getSigners();
      const TokenTemplate = await ethers.getContractFactory("TokenTemplate");

      const totalSupply = ethers.utils.parseEther("1000000");
      const initialHolders = [addr1.address];
      const initialAmounts = [ethers.utils.parseEther("10000")];

      const deployTx = await TokenTemplate.deploy(
        "Test Token",
        "TST",
        totalSupply,
        owner.address,
        initialHolders,
        initialAmounts,
        liquidityManager.address,
        launchManager.address,
        true
      );

      // Extract events from transaction receipt
      const receipt = await deployTx.deployTransaction.wait();

      // Check for AddressWhitelisted events
      const whitelistEvents = receipt.events.filter(
        (e) => e.event === "AddressWhitelisted"
      );
      expect(whitelistEvents.length).to.be.at.least(2); // At least for liquidityManager and launchManager

      // Check for LiquidityApproved event
      const liquidityApprovedEvents = receipt.events.filter(
        (e) => e.event === "LiquidityApproved"
      );
      expect(liquidityApprovedEvents.length).to.be.at.least(1);

      // Check for LaunchManagerApproved event
      const launchManagerApprovedEvents = receipt.events.filter(
        (e) => e.event === "LaunchManagerApproved"
      );
      expect(launchManagerApprovedEvents.length).to.be.at.least(1);
    });
  });

  // Tests for completeInitialDistribution function
  describe("Initial Distribution", function () {
    it("Should allow owner to complete initial distribution", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      await expect(token.connect(owner).completeInitialDistribution()).to.emit(
        token,
        "InitialDistributionComplete"
      );
    });

    it("Should allow whitelisted address to complete initial distribution", async function () {
      const { token, liquidityManager } = await loadFixture(deployTokenFixture);

      await expect(
        token.connect(liquidityManager).completeInitialDistribution()
      ).to.emit(token, "InitialDistributionComplete");
    });

    it("Should revert if non-owner/non-whitelisted tries to complete initial distribution", async function () {
      const { token, addr4 } = await loadFixture(deployTokenFixture);

      await expect(
        token.connect(addr4).completeInitialDistribution()
      ).to.be.revertedWith("Not authorized");
    });

    it("Should revert if trying to complete initial distribution twice", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      await token.connect(owner).completeInitialDistribution();

      await expect(
        token.connect(owner).completeInitialDistribution()
      ).to.be.revertedWith("Initial distribution already completed");
    });
  });

  // Tests for enableTrading function
  describe("Trading", function () {
    it("Should enable trading by owner", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      await expect(token.connect(owner).enableTrading()).to.emit(
        token,
        "TradingEnabled"
      );

      expect(await token.tradingEnabled()).to.be.true;
    });

    it("Should set launchTime and launchBlock when enabling trading", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      await token.connect(owner).enableTrading();

      const launchTime = await token.launchTime();
      const launchBlock = await token.launchBlock();

      expect(launchTime).to.be.gt(0);
      expect(launchBlock).to.be.gt(0);
    });

    it("Should revert if non-owner tries to enable trading", async function () {
      const { token, addr1 } = await loadFixture(deployTokenFixture);

      await expect(token.connect(addr1).enableTrading()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should revert when trying to enable trading twice", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      await token.connect(owner).enableTrading();

      await expect(token.connect(owner).enableTrading()).to.be.revertedWith(
        "Trading already enabled"
      );
    });
  });

  // Tests for whitelist functionality
  describe("Whitelisting", function () {
    it("Should allow owner to whitelist an address", async function () {
      const { token, owner, addr4 } = await loadFixture(deployTokenFixture);

      await expect(token.connect(owner).whitelistAddress(addr4.address, true))
        .to.emit(token, "AddressWhitelisted")
        .withArgs(addr4.address, true);

      expect(await token.isWhitelisted(addr4.address)).to.be.true;
    });

    it("Should allow owner to remove address from whitelist", async function () {
      const { token, owner, liquidityManager } = await loadFixture(
        deployTokenFixture
      );

      // First check that liquidityManager is whitelisted
      expect(await token.isWhitelisted(liquidityManager.address)).to.be.true;

      await expect(
        token.connect(owner).whitelistAddress(liquidityManager.address, false)
      )
        .to.emit(token, "AddressWhitelisted")
        .withArgs(liquidityManager.address, false);

      expect(await token.isWhitelisted(liquidityManager.address)).to.be.false;
    });

    it("Should revert if non-owner tries to whitelist an address", async function () {
      const { token, addr1, addr4 } = await loadFixture(deployTokenFixture);

      await expect(
        token.connect(addr1).whitelistAddress(addr4.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // Tests for approval functions
  describe("Manager Approvals", function () {
    it("Should allow owner to approve liquidity manager", async function () {
      const { token, owner, addr4 } = await loadFixture(deployTokenFixture);

      const amount = ethers.utils.parseEther("50000");

      await expect(
        token.connect(owner).approveLiquidityManager(addr4.address, amount)
      )
        .to.emit(token, "LiquidityApproved")
        .withArgs(addr4.address, amount);

      expect(await token.allowance(owner.address, addr4.address)).to.equal(
        amount
      );
    });

    it("Should revert when approving liquidity manager with zero address", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      const amount = ethers.utils.parseEther("50000");

      await expect(
        token
          .connect(owner)
          .approveLiquidityManager(ethers.constants.AddressZero, amount)
      ).to.be.revertedWith("Invalid liquidityManager address");
    });

    it("Should allow owner to approve launch manager", async function () {
      const { token, owner, addr4 } = await loadFixture(deployTokenFixture);

      const amount = ethers.utils.parseEther("60000");

      await expect(
        token.connect(owner).approveLaunchManager(addr4.address, amount)
      )
        .to.emit(token, "LaunchManagerApproved")
        .withArgs(addr4.address, amount);

      expect(await token.allowance(owner.address, addr4.address)).to.equal(
        amount
      );
    });

    it("Should revert when approving launch manager with zero address", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      const amount = ethers.utils.parseEther("60000");

      await expect(
        token
          .connect(owner)
          .approveLaunchManager(ethers.constants.AddressZero, amount)
      ).to.be.revertedWith("Invalid launchManager address");
    });

    it("Should revert if non-owner tries to approve liquidity manager", async function () {
      const { token, addr1, addr4 } = await loadFixture(deployTokenFixture);

      const amount = ethers.utils.parseEther("50000");

      await expect(
        token.connect(addr1).approveLiquidityManager(addr4.address, amount)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if non-owner tries to approve launch manager", async function () {
      const { token, addr1, addr4 } = await loadFixture(deployTokenFixture);

      const amount = ethers.utils.parseEther("60000");

      await expect(
        token.connect(addr1).approveLaunchManager(addr4.address, amount)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // Tests for inherited ERC20 functionality
  describe("ERC20 Functionality", function () {
    it("Should allow token transfers", async function () {
      const { token, owner, addr4 } = await loadFixture(deployTokenFixture);

      const transferAmount = ethers.utils.parseEther("1000");

      await expect(token.connect(owner).transfer(addr4.address, transferAmount))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, addr4.address, transferAmount);

      expect(await token.balanceOf(addr4.address)).to.equal(transferAmount);
    });

    it("Should allow token approval and transferFrom", async function () {
      const { token, owner, addr1, addr4 } = await loadFixture(
        deployTokenFixture
      );

      const approvalAmount = ethers.utils.parseEther("5000");
      const transferAmount = ethers.utils.parseEther("2000");

      await expect(token.connect(owner).approve(addr1.address, approvalAmount))
        .to.emit(token, "Approval")
        .withArgs(owner.address, addr1.address, approvalAmount);

      expect(await token.allowance(owner.address, addr1.address)).to.equal(
        approvalAmount
      );

      await expect(
        token
          .connect(addr1)
          .transferFrom(owner.address, addr4.address, transferAmount)
      )
        .to.emit(token, "Transfer")
        .withArgs(owner.address, addr4.address, transferAmount);

      expect(await token.balanceOf(addr4.address)).to.equal(transferAmount);
      expect(await token.allowance(owner.address, addr1.address)).to.equal(
        approvalAmount.sub(transferAmount)
      );
    });
  });

  // Gas estimation tests
  describe("Gas Usage", function () {
    it("Should measure gas used for enableTrading", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      const tx = await token.connect(owner).enableTrading();
      const receipt = await tx.wait();

      console.log(`Gas used for enableTrading: ${receipt.gasUsed.toString()}`);
    });

    it("Should measure gas used for completeInitialDistribution", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);

      const tx = await token.connect(owner).completeInitialDistribution();
      const receipt = await tx.wait();

      console.log(
        `Gas used for completeInitialDistribution: ${receipt.gasUsed.toString()}`
      );
    });

    it("Should measure gas used for whitelistAddress", async function () {
      const { token, owner, addr4 } = await loadFixture(deployTokenFixture);

      const tx = await token
        .connect(owner)
        .whitelistAddress(addr4.address, true);
      const receipt = await tx.wait();

      console.log(
        `Gas used for whitelistAddress: ${receipt.gasUsed.toString()}`
      );
    });
  });

  // Integration and scenario tests
  describe("Integration Scenarios", function () {
    it("Should handle a complete launch scenario", async function () {
      const {
        token,
        owner,
        addr1,
        addr2,
        addr3,
        launchManager,
        liquidityManager,
      } = await loadFixture(deployTokenFixture);

      // Step 1: Complete initial distribution
      await token.connect(owner).completeInitialDistribution();

      // Step 2: Enable trading
      await token.connect(owner).enableTrading();

      // Step 3: Verify state
      expect(await token.tradingEnabled()).to.be.true;

      // Step 4: Transfer some tokens from owner to addr1 (simulating launch)
      const transferAmount = ethers.utils.parseEther("5000");
      await token.connect(owner).transfer(addr1.address, transferAmount);

      expect(await token.balanceOf(addr1.address)).to.equal(transferAmount);
    });

    it("Should handle multiple transfers and approvals", async function () {
      const { token, owner, addr1, addr2, addr3 } = await loadFixture(
        deployTokenFixture
      );

      // Enable trading
      await token.connect(owner).enableTrading();

      // Transfer tokens to addr1
      const amount1 = ethers.utils.parseEther("10000");
      await token.connect(owner).transfer(addr1.address, amount1);

      // addr1 approves addr2 to spend tokens
      const approvalAmount = ethers.utils.parseEther("5000");
      await token.connect(addr1).approve(addr2.address, approvalAmount);

      // addr2 transfers tokens from addr1 to addr3
      const transferAmount = ethers.utils.parseEther("3000");
      await token
        .connect(addr2)
        .transferFrom(addr1.address, addr3.address, transferAmount);

      // Verify balances
      expect(await token.balanceOf(addr1.address)).to.equal(
        amount1.sub(transferAmount)
      );
      expect(await token.balanceOf(addr3.address)).to.equal(transferAmount);

      // Verify remaining allowance
      expect(await token.allowance(addr1.address, addr2.address)).to.equal(
        approvalAmount.sub(transferAmount)
      );
    });

    it("Should verify manager roles work correctly", async function () {
      const { token, owner, addr1, liquidityManager, launchManager } =
        await loadFixture(deployTokenFixture);

      // Complete initial distribution as launch manager
      await token.connect(launchManager).completeInitialDistribution();

      // Add addr1 to whitelist
      await token.connect(owner).whitelistAddress(addr1.address, true);

      // New approval for liquidity manager
      const newApproval = ethers.utils.parseEther("100000");
      await token
        .connect(owner)
        .approveLiquidityManager(liquidityManager.address, newApproval);

      // Enable trading
      await token.connect(owner).enableTrading();

      // Verify everything worked
      expect(await token.isWhitelisted(addr1.address)).to.be.true;
      expect(
        await token.allowance(owner.address, liquidityManager.address)
      ).to.equal(newApproval);
      expect(await token.tradingEnabled()).to.be.true;
    });
  });

  // Edge case and security tests
  describe("Edge Cases and Security", function () {
    it("Should handle deployment with empty initial holders arrays", async function () {
      const result = await deployWithCustomParams({
        initialHolders: [],
        initialAmounts: [],
      });

      expect(await result.token.tokensToDistribute()).to.equal(0);
    });

    it("Should handle deployment with single holder array", async function () {
      const result = await deployWithCustomParams({
        initialHolders: [ethers.constants.AddressZero],
        initialAmounts: [ethers.utils.parseEther("0")],
      });

      expect(await result.token.tokensToDistribute()).to.equal(0);
    });

    it("Should ignore zero addresses and zero amounts in tokenToDistribute calculation", async function () {
      const result = await deployWithCustomParams({
        initialHolders: [
          ethers.constants.AddressZero,
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000002",
        ],
        initialAmounts: [
          ethers.utils.parseEther("1000"),
          ethers.utils.parseEther("0"),
          ethers.utils.parseEther("2000"),
        ],
      });

      // Only addr2's amount should be counted (2000)
      expect(await result.token.tokensToDistribute()).to.equal(
        ethers.utils.parseEther("2000")
      );
    });

    it("Should handle both liquidity and launch manager being the same address", async function () {
      const [owner, addr1, addr2, commonManager] = await ethers.getSigners();

      const result = await deployWithCustomParams({
        liquidityManager: commonManager.address,
        launchManager: commonManager.address,
      });

      // Verify the address is whitelisted only once
      expect(await result.token.isWhitelisted(commonManager.address)).to.be
        .true;

      // Verify appropriate allowances
      const totalSupply = await result.token.totalSupply();
      expect(
        await result.token.allowance(owner.address, commonManager.address)
      ).to.equal(totalSupply);
    });

    it("Should handle maximum total supply", async function () {
      // Test with maximum uint256 value
      const maxUint256 = ethers.constants.MaxUint256;

      const result = await deployWithCustomParams({
        totalSupply: maxUint256,
        initialHolders: [],
        initialAmounts: [],
      });

      expect(await result.token.totalSupply()).to.equal(maxUint256);
    });

    it("Should handle same address across multiple initial holders", async function () {
      const [owner, addr1] = await ethers.getSigners();

      const result = await deployWithCustomParams({
        initialHolders: [addr1.address, addr1.address, addr1.address],
        initialAmounts: [
          ethers.utils.parseEther("1000"),
          ethers.utils.parseEther("2000"),
          ethers.utils.parseEther("3000"),
        ],
      });

      // Total tokens to distribute should be sum of all amounts
      expect(await result.token.tokensToDistribute()).to.equal(
        ethers.utils.parseEther("6000")
      );
    });
  });
});
