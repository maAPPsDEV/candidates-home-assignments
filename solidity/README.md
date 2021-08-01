# Amun solidity/vyper engineer task

An exercise in implementing smart contract logic

## How to use it:

- `$ npm install`

This repo uses [hardhat](https://hardhat.org/). Feel free to use it to as template for your task.

1. Fork this repo
2. Work on one of the tasks
3. Create a pull request and add Amun engineers as reviewers

Tasks (Choose one):

A. Create a ERC20 tokens smart contract portfolio

- User is able to deposit a token, withdraw a token, emergency withdraw all tokens, show list of his tokens with their balances
- Be able to transfer his deposited tokens for another user on the portifolio smart contract
- Bonus: add support for EIP-2612 compliant tokens for single transaction deposits

B. Build a token fund.

This fund works as following.

- When a user deposits USDC or USDT to this fund it gets the user 50% of LINK and 50% of WETH.

- When user withdraws from the fund there is a 10% fee on the profit the fund made for them. Otherwise there is no fee.

- Bonus: Connect the smart contract you create at least to two Dexes, for example Uniswap or Kyber, so as to get the best price when coverting stable coin to LINK or WETH.

## Development

⚠️ _The project works with solc v0.8.0 or higher._

### Configuration

```
npm install
```

### Test

```
npm run test
```

```

> solidity@1.0.0 test
> hardhat test


  Fund
    deposit
      √ should revert when invalid token provided
      √ should revert when insufficient token provided
      √ should emit event
      √ should swap input tokens into output tokens
      √ should divide input tokens into the same value of output tokens
      √ should track fund shares
    withdraw
      √ should revert when no funds reversed
      √ should revert when no shares available
      √ should emit event
      √ should transfer reserves back to invester when no profit given
      √ should not charge protocol fee when negative or no profit given
      √ should transfer some percentage of reserves based on the position back to invester when negative profit given
      √ should transfer reserves and 90% profit based on the position back to invester when positive profit given

·-------------------------|----------------------------|-------------|-----------------------------·
|   Solc version: 0.8.0   ·  Optimizer enabled: false  ·  Runs: 200  ·  Block limit: 12450000 gas  │
··························|····························|·············|······························
|  Methods                ·               36 gwei/gas                ·       2246.17 eur/eth       │
·············|············|··············|·············|·············|···············|··············
|  Contract  ·  Method    ·  Min         ·  Max        ·  Avg        ·  # calls      ·  eur (avg)  │
·············|············|··············|·············|·············|···············|··············
|  Fund      ·  deposit   ·      273757  ·     342157  ·     323917  ·           15  ·      26.19  │
·············|············|··············|·············|·············|···············|··············
|  Fund      ·  invest    ·       53109  ·      53592  ·      53351  ·            4  ·       4.31  │
·············|············|··············|·············|·············|···············|··············
|  Fund      ·  withdraw  ·       63927  ·     154141  ·      84354  ·            6  ·       6.82  │
·············|············|··············|·············|·············|···············|··············
|  Deployments            ·                                          ·  % of limit   ·             │
··························|··············|·············|·············|···············|··············
|  Fund                   ·           -  ·          -  ·    2427858  ·       19.5 %  ·     196.32  │
·-------------------------|--------------|-------------|-------------|---------------|-------------·

  13 passing (2m)

```

### Deployment

```
npm run deploy
```
