// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.6.6 <0.8.0;

import './utils/SafeMath.sol';
import './UniswapV2Library.sol';
import './interfaces/IERC20.sol';
import './interfaces/IUniswapV2Pair.sol';
import './interfaces/IUniswapV2Factory.sol';
import './interfaces/IUniswapV2Router02.sol';

contract Flashswap {
    using SafeMath for uint;

    address private owner;
    address private constant pancakeFactory = 0x5Fe5cC0122403f06abE2A75DBba1860Edb762985;
    address private constant bakery = 0xCDe540d7eAFE93aC5fE6233Bee57E1270D3E330F;
    address private constant ape = 0x64d43296aFD4CA79aF28d3Fe0865e0f2b131a981;
    IUniswapV2Router02 bakeryRouter = IUniswapV2Router02(bakery);
    IUniswapV2Router02 apeRouter = IUniswapV2Router02(ape);

    constructor() {
        owner = msg.sender;
    }

    function startArbitrage(
        address token0,
        address token1,
        uint amount0,
        uint amount1
    ) external {
        address pairAddress = IUniswapV2Factory(pancakeFactory).getPair(token0, token1);
        require(pairAddress != address(0), 'This pool does not exist');

        IUniswapV2Pair(pairAddress).swap(
            amount0,
            amount1,
            address(this),
            bytes('not empty')
        );
    }

    function uintToString(uint _i) internal pure returns (string memory str) {
      if (_i == 0) {
      return "0";
      }
      uint j = _i;
      uint len;
      while (j != 0) {
          len++;
          j /= 10;
      }
      bytes memory bstr = new bytes(len);
      uint k = len - 1;
      while (_i != 0) {
          bstr[k--] = byte(uint8(48 + _i % 10));
          _i /= 10;
      }
      return string(bstr);
  }

    function pancakeCall(
        address _sender,
        uint _amount0,
        uint _amount1,
        bytes calldata _data
    ) external {
        address[] memory path = new address[](2);

        // obtain an amout of token that you exchanged
        uint amountToken = _amount0 == 0 ? _amount1 : _amount0;

        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();

        require(msg.sender == UniswapV2Library.pairFor(pancakeFactory, token0, token1));
        require(_amount0 == 0 || _amount1 == 0);

        // if _amount0 is zero sell token1 for token0
        // else sell token0 for token1 as a result
        path[0] = _amount0 == 0 ? token1 : token0;
        path[1] = _amount0 == 0 ? token0 : token1;

        // IERC20 token that we will sell for otherToken
        IERC20 token = IERC20(_amount0 == 0 ? token1 : token0);
        // token.approve(address(bakeryRouter), amountToken);
        token.approve(address(apeRouter), amountToken);

        // calculate the amount of token how much input token should be reimbursed
        uint[] memory amountRequired = UniswapV2Library.getAmountsOut(
            pancakeFactory,
            amountToken,
            path
        );
        // string memory a = uintToString(amountRequired[0]);
        string memory b = uintToString(amountRequired[1]);
        // string memory out = string(abi.encodePacked(a,' ',b));
        // require(0 > 1, out);

        // swap token and obtain equivalent otherToken amountRequired as a result
        // need to receive amountRequired at minimum amount to pay back
        // uint amountReceived = bakeryRouter.swapExactTokensForTokens(
        uint amountReceived = apeRouter.swapExactTokensForTokens(
            amountToken,
            amountRequired[1],
            path,
            address(this),
            block.timestamp
        )[1];
        string memory c = uintToString(amountReceived);
        string memory d = string(abi.encodePacked(c,' ',b));
        require(amountReceived > amountRequired[1], d); // fail if we didn't get enough tokens
        IERC20 otherToken = IERC20(_amount0 == 0 ? token0 : token1);
        otherToken.transfer(msg.sender, amountRequired[1] * 3 / 2);

        // uint256 amount = otherToken.balanceOf(address(this));
        // string memory am = uintToString(amount);
        // require(0 > 1, am);
        // string memory e = uintToString(amountReceived.sub(amountRequired[1]));
        otherToken.transfer(owner, amountRequired[1]); //amountReceived.sub(amountRequired[1]));
    }

    receive() external payable {}
}

