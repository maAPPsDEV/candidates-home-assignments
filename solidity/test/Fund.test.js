const chai = require("chai");
const { ethers, network } = require("hardhat");
const { solidity } = require("ethereum-waffle");

chai.use(solidity);
const { expect } = chai;

const USDT_ABI = require("../abis/USDT.json");
const USDT_OWNER = "0xc6cde7c39eb2f0f0095f41570af89efc2c1ea828";
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

const USDC_ADDRESS = "0xb9e31a22e3a1c743c6720f3b723923e91f3c0f8b";

const LINK_ABI = require("../abis/LINK.json");
const LINK_ADDRESS = "0x514910771af9ca656af840dff83e8264ecf986ca";

const WETH_ABI = require("../abis/WETH.json");
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const UNISWAP_ABI = require("../abis/UNIV2ROUTER02.json");
const UNISWAP_V2_ROUNTER02_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

describe("Fund", function () {
  let owner, alice, bob, feeTo;
  let fund;
  let usdt, link, weth;
  let impersonated = false;

  this.timeout(100000);

  beforeEach(async function () {
    // Get Signers
    [owner, alice, bob, feeTo] = await ethers.getSigners();

    // Prepare Test Environment
    if (!impersonated) {
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [USDT_OWNER],
      });

      const usdtSigner = await ethers.getSigner(USDT_OWNER);
      usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, usdtSigner);
      await usdt.transfer(owner.address, 10000);
      impersonated = true;
    }

    link = new ethers.Contract(LINK_ADDRESS, LINK_ABI, owner);
    weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);

    // transfer some initial funds to players
    await usdt.connect(owner).transfer(alice.address, 100);
    await usdt.connect(owner).transfer(bob.address, 100);

    // Init Fund Contract
    const factory = await ethers.getContractFactory("Fund");
    fund = await factory.deploy(feeTo.address, UNISWAP_V2_ROUNTER02_ADDRESS, LINK_ADDRESS, WETH_ADDRESS, [USDT_ADDRESS, USDC_ADDRESS]);
    await fund.deployed();
  });

  context("deposit", function () {
    it("should revert when invalid token provided", async function () {
      await expect(fund.connect(alice).deposit("0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", 100)).to.be.revertedWith(
        "Fund: Invalid token provided",
      );
    });

    it("should revert when insufficient token provided", async function () {
      await usdt.connect(alice).approve(fund.address, 1);
      await expect(fund.connect(alice).deposit(USDT_ADDRESS, 1)).to.be.revertedWith("Fund: Invalid amount provided");
    });

    it("should emit event", async function () {
      await usdt.connect(alice).approve(fund.address, 100);
      await expect(fund.connect(alice).deposit(USDT_ADDRESS, 100)).to.emit(fund, "Deposit");
    });

    it("should swap input tokens into output tokens", async function () {
      await usdt.connect(alice).approve(fund.address, 100);
      await fund.connect(alice).deposit(USDT_ADDRESS, 100);
      let linkBalance = await link.balanceOf(fund.address);
      expect(linkBalance).to.be.gt(0);
      let wethBalance = await weth.balanceOf(fund.address);
      expect(wethBalance).to.be.gt(0);
    });

    it("should divide input tokens into the same value of output tokens", async function () {
      // alice deposits
      await usdt.connect(alice).approve(fund.address, 100);
      await fund.connect(alice).deposit(USDT_ADDRESS, 100);
      let linkBalance = await link.balanceOf(fund.address);
      expect(linkBalance).to.be.gt(0);
      let wethBalance = await weth.balanceOf(fund.address);
      expect(wethBalance).to.be.gt(0);
      const aliceShare = await fund.shares(alice.address);
      expect(aliceShare.balanceA).to.be.equal(linkBalance);
      expect(aliceShare.balanceB).to.be.equal(wethBalance);

      // bob deposits
      await usdt.connect(bob).approve(fund.address, 100);
      await fund.connect(bob).deposit(USDT_ADDRESS, 100);
      linkBalance = await link.balanceOf(fund.address);
      expect(linkBalance).to.be.gt(0);
      wethBalance = await weth.balanceOf(fund.address);
      expect(wethBalance).to.be.gt(0);
      const bobShare = await fund.shares(bob.address);
      expect(bobShare.balanceA).to.be.equal(linkBalance.sub(aliceShare.balanceA));
      expect(bobShare.balanceB).to.be.equal(wethBalance.sub(aliceShare.balanceB));
    });

    it("should track fund shares", async function () {
      // alice deposits
      await usdt.connect(alice).approve(fund.address, 100);
      await fund.connect(alice).deposit(USDT_ADDRESS, 100);
      let linkBalance = await link.balanceOf(fund.address);
      expect(linkBalance).to.be.gt(0);
      let wethBalance = await weth.balanceOf(fund.address);
      expect(wethBalance).to.be.gt(0);
      const aliceShare = await fund.shares(alice.address);
      expect(aliceShare.balanceA).to.be.equal(linkBalance);
      expect(aliceShare.balanceB).to.be.equal(wethBalance);

      // bob deposits
      await usdt.connect(bob).approve(fund.address, 100);
      await fund.connect(bob).deposit(USDT_ADDRESS, 100);
      linkBalance = await link.balanceOf(fund.address);
      expect(linkBalance).to.be.gt(0);
      wethBalance = await weth.balanceOf(fund.address);
      expect(wethBalance).to.be.gt(0);
      const bobShare = await fund.shares(bob.address);
      expect(bobShare.balanceA).to.be.equal(linkBalance.sub(aliceShare.balanceA));
      expect(bobShare.balanceB).to.be.equal(wethBalance.sub(aliceShare.balanceB));

      // check total shares
      const total = await fund.total();
      expect(total.balanceA).to.be.equal(aliceShare.balanceA.add(bobShare.balanceA));
      expect(total.balanceB).to.be.equal(aliceShare.balanceB.add(bobShare.balanceB));
    });
  });

  context("withdraw", function () {
    async function makeProfit(amountA, amountB) {
      const uniRouter = new ethers.Contract(UNISWAP_V2_ROUNTER02_ADDRESS, UNISWAP_ABI, owner);
      const timestamp = Math.floor(Date.now() / 1000);

      // in order to make positive profit, swap non-zero underlying asset to the fund
      // in order to make negtive profit, call fund's test invest function
      if (amountA > 0) {
        await usdt.connect(owner).approve(uniRouter.address, amountA);
        await uniRouter.swapExactTokensForTokens(amountA, 0, [USDT_ADDRESS, LINK_ADDRESS], fund.address, timestamp + 1000 * 60);
      } else {
        await fund.connect(owner).invest(Math.abs(amountA), 0);
      }

      if (amountB > 0) {
        await usdt.connect(owner).approve(uniRouter.address, amountB);
        await uniRouter.swapExactTokensForTokens(amountB, 0, [USDT_ADDRESS, WETH_ADDRESS], fund.address, timestamp + 1000 * 60);
      } else {
        await fund.connect(owner).invest(0, Math.abs(amountB));
      }
    }

    it("should revert when no funds reversed", async function () {
      await expect(fund.connect(alice).withdraw()).to.be.revertedWith("Fund: No funds");
    });

    it("should revert when no shares available", async function () {
      // alice deposits
      await usdt.connect(alice).approve(fund.address, 100);
      await fund.connect(alice).deposit(USDT_ADDRESS, 100);

      // bob tries to withdraw
      await expect(fund.connect(bob).withdraw()).to.be.revertedWith("Fund: No shares");
    });

    it("should emit event", async function () {
      await usdt.connect(alice).approve(fund.address, 100);
      await fund.connect(alice).deposit(USDT_ADDRESS, 100);
      await expect(fund.connect(alice).withdraw()).to.emit(fund, "Withdraw");
    });

    it("should transfer reserves back to invester when no profit given", async function () {
      // clear balances
      await link.connect(alice).transfer(owner.address, await link.balanceOf(alice.address));
      await weth.connect(alice).transfer(owner.address, await weth.balanceOf(alice.address));

      // alice deposits
      await usdt.connect(alice).approve(fund.address, 100);
      await fund.connect(alice).deposit(USDT_ADDRESS, 100);

      const totalBefore = await fund.total();
      let aliceShare = await fund.shares(alice.address);

      // do withdraw
      await fund.connect(alice).withdraw();

      // check balances
      const balanceA = await link.balanceOf(alice.address);
      const balanceB = await weth.balanceOf(alice.address);
      expect(balanceA).to.be.equal(aliceShare.balanceA);
      expect(balanceB).to.be.equal(aliceShare.balanceB);

      // check shares
      const totalAfter = await fund.total();
      aliceShare = await fund.shares(alice.address);
      expect(aliceShare.balanceA).to.be.equal(0);
      expect(aliceShare.balanceB).to.be.equal(0);
      expect(totalAfter.balanceA).to.be.equal(totalBefore.balanceA.sub(balanceA));
      expect(totalAfter.balanceB).to.be.equal(totalBefore.balanceB.sub(balanceB));
    });

    it("should not charge protocol fee when negative or no profit given", async function () {
      // clear balances
      await link.connect(alice).transfer(owner.address, await link.balanceOf(alice.address));
      await weth.connect(alice).transfer(owner.address, await weth.balanceOf(alice.address));

      // alice deposits
      await usdt.connect(alice).approve(fund.address, 100);
      await fund.connect(alice).deposit(USDT_ADDRESS, 100);

      // make negtive profit
      await makeProfit(-50, -50);

      // do withdraw
      await fund.connect(alice).withdraw();

      // check protocol fee if charged
      expect(await link.balanceOf(feeTo.address)).to.be.equal(0);
      expect(await weth.balanceOf(feeTo.address)).to.be.equal(0);
    });

    it("should transfer some percentage of reserves based on the position back to invester when negative profit given", async function () {
      // clear balances
      await link.connect(alice).transfer(owner.address, await link.balanceOf(alice.address));
      await weth.connect(alice).transfer(owner.address, await weth.balanceOf(alice.address));

      // alice deposits
      await usdt.connect(alice).approve(fund.address, 100);
      await fund.connect(alice).deposit(USDT_ADDRESS, 100);

      // bob deposits
      await usdt.connect(bob).approve(fund.address, 100);
      await fund.connect(bob).deposit(USDT_ADDRESS, 100);

      let aliceShare = await fund.shares(alice.address);

      // make negative profit
      await makeProfit(-50, -50);

      // do withdraw
      await fund.connect(alice).withdraw();

      // check balances
      const balanceA = await link.balanceOf(alice.address);
      const balanceB = await weth.balanceOf(alice.address);
      expect(balanceA).to.be.lt(aliceShare.balanceA);
      expect(balanceB).to.be.lt(aliceShare.balanceB);
    });

    it("should transfer reserves and 90% profit based on the position back to invester when positive profit given", async function () {
      // clear balances
      await link.connect(alice).transfer(owner.address, await link.balanceOf(alice.address));
      await weth.connect(alice).transfer(owner.address, await weth.balanceOf(alice.address));

      // alice deposits
      await usdt.connect(alice).approve(fund.address, 100);
      await fund.connect(alice).deposit(USDT_ADDRESS, 100);

      // bob deposits
      await usdt.connect(bob).approve(fund.address, 100);
      await fund.connect(bob).deposit(USDT_ADDRESS, 100);

      let aliceShare = await fund.shares(alice.address);

      // make positive profit
      await makeProfit(50, 50);

      // do withdraw
      await fund.connect(alice).withdraw();

      // check balances
      const balanceA = await link.balanceOf(alice.address);
      const balanceB = await weth.balanceOf(alice.address);
      expect(balanceA).to.be.gt(aliceShare.balanceA);
      expect(balanceB).to.be.gt(aliceShare.balanceB);

      // check protocol fee if charged
      expect(await link.balanceOf(feeTo.address)).to.be.gt(0);
      expect(await weth.balanceOf(feeTo.address)).to.be.gt(0);
    });
  });
});
