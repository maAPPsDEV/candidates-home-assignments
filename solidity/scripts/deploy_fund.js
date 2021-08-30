// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers } = require("hardhat");

const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDC_ADDRESS = "0xb9e31a22e3a1c743c6720f3b723923e91f3c0f8b";
const LINK_ADDRESS = "0x514910771af9ca656af840dff83e8264ecf986ca";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const UNISWAP_V2_ROUNTER02_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const [feeTo] = await ethers.getSigners();
  // We get the contract to deploy
  const factory = await ethers.getContractFactory("Fund");
  const fund = await factory.deploy(feeTo.address, UNISWAP_V2_ROUNTER02_ADDRESS, LINK_ADDRESS, WETH_ADDRESS, [USDT_ADDRESS, USDC_ADDRESS]);

  await fund.deployed();

  console.log("Fund deployed to:", fund.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
