const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TokenFactory Contract Tests", function () {
  let tokenFactory;
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let mock;

  // Mock TokenTemplate for testing
  let TokenTemplateMock;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

    // Deploy TokenFactory
    const TokenFactory = await ethers.getContractFactory("TokenFactory");
    tokenFactory = await TokenFactory.deploy(
      addr1.address,
      ethers.utils.parseEther("0.1")
    );
    await tokenFactory.deployed();

    // Create a mock token template for testing
    TokenTemplateMock = await ethers.getContractFactory("TokenTemplate");
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await tokenFactory.owner()).to.equal(owner.address);
    });

    it("Should set the initial fee collector", async function () {
      expect(await tokenFactory.feeCollector()).to.equal(addr1.address);
    });

    it("Should set the initial creation fee", async function () {
      expect(await tokenFactory.creationFee()).to.equal(
        ethers.utils.parseEther("0.1")
      );
    });
  });

  describe("Token Creation", function () {
    it("Should create a new token with correct parameters", async function () {
      const tokenName = "Test Token";
      const tokenSymbol = "TST";
      const totalSupply = ethers.utils.parseEther("1000000");
      const initialHolders = [addr1.address, addr2.address];
      const initialAmounts = [
        ethers.utils.parseEther("50000"),
        ethers.utils.parseEther("100000"),
      ];
      const fee = ethers.utils.parseEther("0.1");

      // Create a new token
      const tx = await tokenFactory.connect(owner).createToken(
        tokenName,
        tokenSymbol,
        totalSupply,
        initialHolders,
        initialAmounts,
        addr3.address, // liquidityManager
        owner.address, // launchManager
        true, // launchWithLiquidity
        owner.address, // initialTokenOwner
        { value: fee }
      );

      // Get the emitted event to find token address
      const receipt = await tx.wait();
      const event = receipt.events.find((e) => e.event === "TokenCreated");
      const tokenAddress = event.args.tokenAddress;

      // Verify the token is recorded in creator tokens
      const creatorTokens = await tokenFactory.getCreatorTokens(owner.address);
      expect(creatorTokens[0]).to.equal(tokenAddress);

      // Check that token was added to all tokens
      const allTokens = await tokenFactory.allTokens(0);
      expect(allTokens).to.equal(tokenAddress);

      // Verify token count
      expect(await tokenFactory.getTotalTokenCount()).to.equal(1);
      expect(await tokenFactory.getCreatorTokenCount(owner.address)).to.equal(
        1
      );
    });

    it("Should refund excess fee", async function () {
      const fee = ethers.utils.parseEther("0.1");
      const excess = ethers.utils.parseEther("0.05");
      const totalSent = fee.add(excess);

      // Track balance before transaction
      const balanceBefore = await owner.getBalance();

      // Create token with excess fee
      const tx = await tokenFactory
        .connect(owner)
        .createToken(
          "Test Token",
          "TST",
          ethers.utils.parseEther("1000000"),
          [addr1.address],
          [ethers.utils.parseEther("10000")],
          addr3.address,
          owner.address,
          true,
          owner.address,
          { value: totalSent }
        );

      const receipt = await tx.wait();
      const gasUsed = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

      // Verify balance after transaction accounts for gas, refunded excess
      const balanceAfter = await owner.getBalance();
      expect(balanceAfter).to.be.closeTo(
        balanceBefore.sub(fee).sub(gasUsed),
        1000 // Allow for small rounding errors
      );
    });

    it("Should collect fee and send to fee collector", async function () {
      const fee = ethers.utils.parseEther("0.1");
      const collector = addr1.address;

      // Track collector's balance before
      const collectorBalanceBefore = await ethers.provider.getBalance(
        collector
      );

      // Create token
      await tokenFactory
        .connect(owner)
        .createToken(
          "Test Token",
          "TST",
          ethers.utils.parseEther("1000000"),
          [addr1.address],
          [ethers.utils.parseEther("10000")],
          addr3.address,
          owner.address,
          true,
          owner.address,
          { value: fee }
        );

      // Verify fee went to collector
      const collectorBalanceAfter = await ethers.provider.getBalance(collector);
      expect(collectorBalanceAfter).to.equal(collectorBalanceBefore.add(fee));
    });

    it("Should revert if insufficient fee paid", async function () {
      const fee = ethers.utils.parseEther("0.05"); // less than required

      await expect(
        tokenFactory
          .connect(owner)
          .createToken(
            "Test Token",
            "TST",
            ethers.utils.parseEther("1000000"),
            [addr1.address],
            [ethers.utils.parseEther("10000")],
            addr3.address,
            owner.address,
            true,
            owner.address,
            { value: fee }
          )
      ).to.be.revertedWith("Insufficient fee");
    });

    it("Should revert if mismatch between holders and amounts arrays", async function () {
      const fee = ethers.utils.parseEther("0.1");

      await expect(
        tokenFactory.connect(owner).createToken(
          "Test Token",
          "TST",
          ethers.utils.parseEther("1000000"),
          [addr1.address, addr2.address], // 2 elements
          [ethers.utils.parseEther("10000")], // 1 element
          addr3.address,
          owner.address,
          true,
          owner.address,
          { value: fee }
        )
      ).to.be.revertedWith("Holders and amounts mismatch");
    });
  });

  describe("Ownership and Fee Collection", function () {
    it("Should allow only owner to update fee collector", async function () {
      await expect(
        tokenFactory.connect(addr1).updateFeeCollector(addr2.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await tokenFactory.connect(owner).updateFeeCollector(addr2.address);
      expect(await tokenFactory.feeCollector()).to.equal(addr2.address);
    });

    it("Should emit event when fee collector is updated", async function () {
      const oldCollector = await tokenFactory.feeCollector();
      const newCollector = addr2.address;

      await expect(tokenFactory.connect(owner).updateFeeCollector(newCollector))
        .to.emit(tokenFactory, "FeeCollectorUpdated")
        .withArgs(oldCollector, newCollector);
    });

    it("Should revert if setting fee collector to zero address", async function () {
      await expect(
        tokenFactory
          .connect(owner)
          .updateFeeCollector(ethers.constants.AddressZero)
      ).to.be.revertedWith("Invalid collector address");
    });

    it("Should allow only owner to update creation fee", async function () {
      const newFee = ethers.utils.parseEther("0.2");

      await expect(
        tokenFactory.connect(addr1).updateCreationFee(newFee)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await tokenFactory.connect(owner).updateCreationFee(newFee);
      expect(await tokenFactory.creationFee()).to.equal(newFee);
    });

    it("Should emit event when creation fee is updated", async function () {
      const oldFee = await tokenFactory.creationFee();
      const newFee = ethers.utils.parseEther("0.2");

      await expect(tokenFactory.connect(owner).updateCreationFee(newFee))
        .to.emit(tokenFactory, "CreationFeeUpdated")
        .withArgs(oldFee, newFee);
    });
  });

  describe("Token Tracking", function () {
    it("Should correctly track all created tokens", async function () {
      // Create multiple tokens and verify count
      for (let i = 0; i < 3; i++) {
        await tokenFactory
          .connect(owner)
          .createToken(
            `Test Token ${i}`,
            `TST${i}`,
            ethers.utils.parseEther("1000000"),
            [addr1.address],
            [ethers.utils.parseEther("10000")],
            addr3.address,
            owner.address,
            true,
            owner.address,
            { value: ethers.utils.parseEther("0.1") }
          );
      }

      // Verify total token count
      expect(await tokenFactory.getTotalTokenCount()).to.equal(3);

      // Check that all tokens are tracked
      for (let i = 0; i < 3; i++) {
        const tokenAddr = await tokenFactory.allTokens(i);
        expect(tokenAddr).to.not.equal(ethers.constants.AddressZero);
      }
    });

    it("Should track tokens by creator", async function () {
      // Create tokens from different creators
      await tokenFactory
        .connect(owner)
        .createToken(
          "Token 1",
          "T1",
          ethers.utils.parseEther("1000000"),
          [addr1.address],
          [ethers.utils.parseEther("10000")],
          addr3.address,
          owner.address,
          true,
          owner.address,
          { value: ethers.utils.parseEther("0.1") }
        );

      await tokenFactory
        .connect(addr1)
        .createToken(
          "Token 2",
          "T2",
          ethers.utils.parseEther("1000000"),
          [addr1.address],
          [ethers.utils.parseEther("10000")],
          addr3.address,
          owner.address,
          true,
          owner.address,
          { value: ethers.utils.parseEther("0.1") }
        );

      // Verify token counts by creator
      expect(await tokenFactory.getCreatorTokenCount(owner.address)).to.equal(
        1
      );
      expect(await tokenFactory.getCreatorTokenCount(addr1.address)).to.equal(
        1
      );
    });

    it("Should support retrieving all creator tokens", async function () {
      // Create multiple tokens for the same creator
      for (let i = 0; i < 3; i++) {
        await tokenFactory
          .connect(owner)
          .createToken(
            `Test Token ${i}`,
            `TST${i}`,
            ethers.utils.parseEther("1000000"),
            [addr1.address],
            [ethers.utils.parseEther("10000")],
            addr3.address,
            owner.address,
            true,
            owner.address,
            { value: ethers.utils.parseEther("0.1") }
          );
      }

      // Get all tokens for the creator
      const tokensForCreator = await tokenFactory.getCreatorTokens(
        owner.address
      );
      expect(tokensForCreator.length).to.equal(3);
    });
  });

  describe("Error Handling", function () {
    it("Should handle zero length holder array", async function () {
      await tokenFactory.connect(owner).createToken(
        "Test Token",
        "TST",
        ethers.utils.parseEther("1000000"),
        [], // Empty array
        [], // Empty array
        addr3.address,
        owner.address,
        true,
        owner.address,
        { value: ethers.utils.parseEther("0.1") }
      );

      // Should succeed and create a token
      expect(await tokenFactory.getTotalTokenCount()).to.equal(1);
    });

    it("Should handle failed refund", async function () {
      // Deploy a mock receiver that rejects refunds
      const MockReceiver = await ethers.getContractFactory("MockReceiver");
      const mockReceiver = await MockReceiver.deploy();
      await mockReceiver.deployed();

      await expect(
        tokenFactory.connect(mockReceiver.address).createToken(
          "Test Token",
          "TST",
          ethers.utils.parseEther("1000000"),
          [addr1.address],
          [ethers.utils.parseEther("10000")],
          addr3.address,
          owner.address,
          true,
          owner.address,
          { value: ethers.utils.parseEther("0.2") } // More than fee
        )
      ).to.be.revertedWith("Refund failed");
    });
  });
});
