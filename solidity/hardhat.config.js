/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");

const ALCHEMY_PROJECT_ID = "3wG4241SVPfNkDa-tYa86PeYHfZ0ThLe";

module.exports = {
  solidity: {
    version: "0.8.0", // not to use SafeMath
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_PROJECT_ID}`,
      },
    },
  },
};
