// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title ArclyMockSwap
 * @dev Simple contract to test native USDC swaps on Arc Testnet
 */
contract ArclyMockSwap {
    event SwapExecuted(address indexed user, uint256 amountIn, address tokenOut);

    // This contract accepts native USDC (as msg.value)
    receive() external payable {}

    /**
     * @dev Simple swap simulation. 
     * In a real DEX, this would interact with liquidity pools.
     * On Arc Testnet, msg.value is USDC.
     */
    function swapNativeForToken(address tokenOut, uint256 minAmountOut) external payable {
        require(msg.value > 0, "Amount must be > 0");
        
        // In a real mock, you'd transfer an ERC20 to the user here
        // For testing purposes, we just emit the event and keep the USDC
        
        emit SwapExecuted(msg.sender, msg.value, tokenOut);
    }
}
