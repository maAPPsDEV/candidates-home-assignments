// SPDX-License-Identifier: ISC

pragma solidity ^0.8.0;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev This fund works as following.
 * When a user deposits USDC or USDT to this fund it gets the user 50% of LINK and 50% of WETH.
 * When user withdraws from the fund there is a 10% fee on the profit the fund made for them. Otherwise there is no fee.
 */
contract Fund is ReentrancyGuard, Ownable {
  /// @dev Uniswap v2 router02.
  IUniswapV2Router02 public uniV2Router02;

  /// @dev Indicates input-able tokens.
  mapping(address => bool) public inputTokenables;

  /// @dev Output token A. i.e. LINK.
  IERC20 public tokenA;
  /// @dev Output token B. i.e. WETH.
  IERC20 public tokenB;

  /// @dev The beneficiary of protocol fee.
  address public feeTo;
  /// @dev The percentage of protocol fee aganist positive profit.
  uint256 public constant PROTOCOL_FEE = 10;

  /// @dev The structure represents fund shares.
  struct Share {
    uint256 balanceA;
    uint256 balanceB;
  }

  /// @dev Indicates shares for each investor.
  mapping(address => Share) public shares;

  /// @dev The total fund invested.
  Share public total;

  /**
   * The event for Deposit.
   *
   * @param account     - The account deposited a fund
   * @param input       - The token used to deposit
   * @param amountIn    - The amount to deposit
   * @param amountOutA  - The amount of token A reserved
   * @param amountOutB  - The amount of token B reserved
   */
  event Deposit(address account, address input, uint256 amountIn, uint256 amountOutA, uint256 amountOutB);

  /**
   * The event for Withdraw.
   *
   * @param account     - The account withdrawn a fund
   * @param amountOutA  - The amount of token A withdrawn
   * @param amountOutB  - The amount of token B withdrawn
   * @param feeA        - The fee charged for token A
   * @param feeB        - The fee charged for token B
   */
  event Withdraw(address account, uint256 amountOutA, uint256 amountOutB, uint256 feeA, uint256 feeB);

  /**
   * The fund constructor
   *
   * @param _feeTo          - The benificiary of protocol fee
   * @param _uniV2Router02  - The address of uniswap v2 router02
   * @param _outputTokenA   - The address of token A
   * @param _outputTokenB   - The address of token B
   * @param _inputTokens    - The input-able token addresses
   */
  constructor(
    address _feeTo,
    address _uniV2Router02,
    address _outputTokenA,
    address _outputTokenB,
    address[] memory _inputTokens
  ) {
    feeTo = _feeTo;
    uniV2Router02 = IUniswapV2Router02(_uniV2Router02);
    tokenA = IERC20(_outputTokenA);
    tokenB = IERC20(_outputTokenB);
    for (uint256 i = 0; i < _inputTokens.length; ++i) {
      inputTokenables[_inputTokens[i]] = true;
    }
  }

  /**
   * @dev Deposits a fund
   * User can put a fund by using an input-able token.
   * It converts the input assets into two same value of underlying assets, i.e. LINK & WETH, through Uniswap.
   * And then it records the share (position) of the invester.
   *
   * @param _token    - The address of input token
   * @param _amountIn - The amount to deposit
   *
   * @return The success
   */
  function deposit(address _token, uint256 _amountIn) external returns (bool) {
    require(inputTokenables[_token], "Fund: Invalid token provided");
    uint256 amountInHalf = _amountIn / 2;
    require(amountInHalf > 0, "Fund: Invalid amount provided");

    IUniswapV2Router02 router = uniV2Router02; // gas saving

    // transfer input tokens to this fund, and approve for uniswap router
    TransferHelper.safeTransferFrom(_token, msg.sender, address(this), _amountIn);
    TransferHelper.safeApprove(_token, address(router), _amountIn);

    // 1. swap a half of input tokens to output token A
    address[] memory path = new address[](2);
    path[0] = _token;
    path[1] = address(tokenA);

    // retrieve the prices
    uint256[] memory amountOuts = router.getAmountsOut(amountInHalf, path);
    uint256 amountOutA = amountOuts[amountOuts.length - 1];

    router.swapExactTokensForTokens(amountInHalf, amountOutA, path, address(this), block.timestamp + 1000 * 60);

    // 2. swap a half of input tokens to output token B
    path[1] = address(tokenB);

    // retrieve the prices
    amountOuts = router.getAmountsOut(amountInHalf, path);
    uint256 amountOutB = amountOuts[amountOuts.length - 1];

    router.swapExactTokensForTokens(amountInHalf, amountOutB, path, address(this), block.timestamp + 1000 * 60);

    // 3. populate shares
    Share storage share = shares[msg.sender];
    share.balanceA += amountOutA;
    share.balanceB += amountOutB;

    total.balanceA += amountOutA;
    total.balanceB += amountOutB;

    emit Deposit(msg.sender, _token, _amountIn, amountOutA, amountOutB);
    return true;
  }

  /**
   * @dev Withdraws a fund
   * User will receive the underlying assets based on the position in this fund.
   * When a positive profit is given, user will receive more as 90% of profit based on the position in this fund.
   * The rest 10% of profit will be charged to feeTo.
   * When a negative or no profit is given, user will receive less than or equal amount of underlying assets.
   *
   * This function is Re-entrancy safe.
   *
   * @return The success
   */
  function withdraw() external nonReentrant returns (bool) {
    Share memory total_ = total; // gas saving;
    Share memory share = shares[msg.sender];

    // 1. retrive the current balance of underlying assets
    uint256 balanceA = tokenA.balanceOf(address(this));
    uint256 balanceB = tokenB.balanceOf(address(this));

    // 2. calculate the available withdrawn amount of underlying assets.
    (uint256 amountOutA, uint256 feeA) = getAmountOut(balanceA, total_.balanceA, share.balanceA);
    (uint256 amountOutB, uint256 feeB) = getAmountOut(balanceB, total_.balanceB, share.balanceB);

    // 3. remove the share of the investor
    total.balanceA -= share.balanceA;
    total.balanceB -= share.balanceB;
    shares[msg.sender] = Share(0, 0);

    // 4. transfer tokens
    if (amountOutA > 0) {
      TransferHelper.safeTransfer(address(tokenA), msg.sender, amountOutA);
    }

    if (amountOutB > 0) {
      TransferHelper.safeTransfer(address(tokenB), msg.sender, amountOutB);
    }

    // 5. charge fees
    if (feeA > 0) {
      TransferHelper.safeTransfer(address(tokenA), feeTo, feeA);
    }

    if (feeB > 0) {
      TransferHelper.safeTransfer(address(tokenB), feeTo, feeB);
    }

    emit Withdraw(msg.sender, amountOutA, amountOutB, feeA, feeB);
    return true;
  }

  /**
   * @dev Calculates the amount of underlying asset that can be withdrawn.
   *
   * @param _balance  - The real balance of underlying asset of this fund. It may be different _total depends on the profit
   * @param _total    - The total amount of underlying asset that has been reserved
   * @param _share    - The shared amount of underlying asset that has been reserved by an investor, must be less than or equal to _total
   *
   * @return amountOut  - The amount of underlying asset that is available to withdraw
   * @return fee        - The protocol fee that can be charged, can be greater than 0 when a positive profit is given, otherwise 0
   */
  function getAmountOut(
    uint256 _balance,
    uint256 _total,
    uint256 _share
  ) private pure returns (uint256 amountOut, uint256 fee) {
    require(_total > 0, "Fund: No funds");
    require(_share > 0, "Fund: No shares");
    assert(_total >= _share);

    // 1. calculate the position in this fund
    uint256 position = (_share * 100) / _total;

    if (_balance == _total) {
      // no profit
      amountOut = _share;
      // no fee
    } else if (_balance > _total) {
      // positive profit
      uint256 profit = _balance - _total;
      amountOut = (profit * position) / 100;
      fee = (amountOut * PROTOCOL_FEE) / 100;
      amountOut += _share;
    } else {
      // negative profit
      amountOut = (_balance * position) / 100;
      // no fee
    }
  }

  /**
   * @notice Only test purpose, used in order to decrease the fund balance of underlying assets
   * @dev Invests a part of fund into others according to the strategy.
   */
  function invest(uint256 _amountA, uint256 _amountB) external onlyOwner {
    require(_amountA >= 0 || _amountB >= 0, "Fund: Invalid amount provided");
    require(tokenA.balanceOf(address(this)) >= _amountA && tokenB.balanceOf(address(this)) >= _amountB, "Fund: Insufficient balance");

    if (_amountA > 0) {
      TransferHelper.safeTransfer(address(tokenA), msg.sender, _amountA);
    }

    if (_amountB > 0) {
      TransferHelper.safeTransfer(address(tokenB), msg.sender, _amountB);
    }
  }
}
