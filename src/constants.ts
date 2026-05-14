
export const ARC_TESTNET_PARAMS = {
  chainId: 5042002,
  chainName: 'Arc Testnet',
  rpcUrl: 'https://5042002.rpc.thirdweb.com',
  rpcUrls: [
    'https://5042002.rpc.thirdweb.com',
    'https://rpc.testnet.arc.network'
  ],
  explorer: 'https://testnet.arcscan.app',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }
};

export const ROUTER_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000'; // Placeholder

export const ROUTER_ABI = [
  "function swapNativeForToken(address tokenOut, uint256 minAmountOut) external payable",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "event SwapExecuted(address indexed user, uint256 amountIn, address tokenOut)"
];

export const SUPPORTED_TOKENS = [
  { symbol: 'USDC', name: 'USD Coin', decimals: 18, address: 'native', icon: 'U' },
  { symbol: 'EURC', name: 'Euro Coin', decimals: 18, address: '0x0000000000000000000000000000000000000001', icon: 'E' },
  { symbol: 'ARC', name: 'ARC Network Token', decimals: 18, address: '0x0000000000000000000000000000000000000002', icon: 'A' },
  { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, address: '0x0000000000000000000000000000000000000003', icon: 'W' },
];
