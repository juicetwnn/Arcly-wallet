import React, { useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import { 
  ShieldAlert, 
  Copy, 
  Key, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Wallet, 
  LogOut, 
  ExternalLink, 
  ChevronRight,
  Database,
  Lock,
  ArrowUpRight,
  Plus,
  Settings as SettingsIcon,
  ArrowDownLeft,
  ArrowRight,
  User,
  Sun,
  Moon,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  ArrowLeftRight,
  Layers,
  Image as ImageIcon,
  Check,
  History,
  Menu,
  X,
  ShieldCheck,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'react-qr-code';
import Avatar from "boring-avatars";
import { ARC_TESTNET_PARAMS, ROUTER_CONTRACT_ADDRESS, SUPPORTED_TOKENS, ROUTER_ABI } from '../constants';
import { ARCAsset, ARCNFT, WalletStep, WalletTab, TransactionStatus, WalletMetadata } from '../types';

// --- UI Components ---

const TokenIcon = ({ symbol, size = 'md' }: { symbol: string, size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  const logoMap: { [key: string]: string } = {
    'USDC': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    'EURC': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1aBaEA1f7C830f032BaEAf159008851c6F06b5a4/logo.png',
    'WETH': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    'ARC': 'https://cdn.corenexis.com/files/c/4579882720.png'
  };

  const logoUrl = logoMap[symbol];

  if (!logoUrl) {
    return (
      <div className={`${sizeMap[size]} bg-blue-600 rounded-full flex items-center justify-center overflow-hidden`}>
        <img src="https://cdn.corenexis.com/files/c/4579882720.png" alt="Arcly Fallback" className="w-2/3 h-2/3 object-contain" />
      </div>
    );
  }

  return (
    <div className={`${sizeMap[size]} flex items-center justify-center`}>
      <img src={logoUrl} alt={symbol} className="w-full h-full object-contain" onError={(e) => {
        (e.target as HTMLImageElement).src = 'https://cdn.corenexis.com/files/c/4579882720.png';
      }} />
    </div>
  );
};

const Card = ({ children, title, subtitle, isLightMode = false }: { children: React.ReactNode, title?: string, subtitle?: string, isLightMode?: boolean, key?: string }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className={`max-w-md mx-auto mt-6 border rounded-2xl overflow-hidden shadow-2xl relative ${isLightMode ? 'bg-white border-neutral-200' : 'bg-[#0A0A0A] border-[#1A1A1A]'}`}
  >
    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
    <div className="p-8">
      {title && (
        <div className="mb-6">
          <h2 className={`text-xl font-medium tracking-tight mb-1 ${isLightMode ? 'text-black' : 'text-white'}`}>{title}</h2>
          {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  </motion.div>
);

// TODO: Verify if this is the correct, live contract address on Arc Testnet, or just a mock address.
const EURC_CONTRACT_ADDRESS_ARC_TESTNET: string = '0x1abaea1f7c830f032baeaf159008851c6f06b5a4'; // Placeholder for user to update

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const ERC721_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

// --- Utilities ---
const fetchTokenPrice = async (symbol: string): Promise<number> => {
  const fallbacks: { [key: string]: number } = {
    'USDC': 1.0,
    'EURC': 1.08,
    'ARC': 2.5,
    'WETH': 3500
  };

  try {
    console.log(`Fetching price for ${symbol} from CoinGecko...`);
    // CoinGecko IDs for supported tokens
    const idMap: { [key: string]: string } = {
      'USDC': 'usd-coin',
      'EURC': 'euro-coin',
      'ARC': 'arc',
      'WETH': 'ethereum'
    };

    const id = idMap[symbol] || 'usd-coin';
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    const price = data[id]?.usd;
    
    if (price) {
      console.log(`Successfully fetched price for ${symbol}: $${price}`);
      return price;
    }
    throw new Error('Price data missing in response');
  } catch (err: any) {
    if (err.message?.includes('failed to fetch')) {
      console.warn(`Failed to fetch price from CoinGecko for ${symbol} (Likely Network/CORS):`, err);
    } else {
      console.warn(`Failed to fetch price from CoinGecko for ${symbol}:`, err);
    }
    console.log(`Falling back to hardcoded rate for ${symbol}: $${fallbacks[symbol] || 1.0}`);
    return fallbacks[symbol] || 1.0;
  }
};

const withRetry = async <T,>(
  fn: (provider: ethers.JsonRpcProvider) => Promise<T>, 
  rpcIndex: number, 
  setRpcIndex: (idx: number) => void,
  setNetworkStatus: (status: 'idle' | 'switching') => void,
  retriesPerRpc = 2,
  delay = 1000
): Promise<T> => {
  const urls = ARC_TESTNET_PARAMS.rpcUrls || [ARC_TESTNET_PARAMS.rpcUrl];
  let localRpcIndex = rpcIndex;

  for (let attemptIdx = 0; attemptIdx < urls.length * retriesPerRpc; attemptIdx++) {
    const currentUrl = urls[localRpcIndex];
    const provider = new ethers.JsonRpcProvider(currentUrl);
    
    try {
      const result = await fn(provider);
      setNetworkStatus('idle');
      return result;
    } catch (err: any) {
      const isNetworkError = err.message?.includes('failed to fetch') || err.message?.includes('429');
      
      if (isNetworkError && attemptIdx < urls.length * retriesPerRpc - 1) {
        console.warn(`RPC Error on ${currentUrl}:`, err.message);
        
        // Rotate to next RPC
        localRpcIndex = (localRpcIndex + 1) % urls.length;
        setRpcIndex(localRpcIndex);
        setNetworkStatus('switching');
        
        console.log(`Switching to backup RPC: ${urls[localRpcIndex]}`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
      
      // If it's a contract error (e.g. out of gas) or we're out of retries
      setNetworkStatus('idle');
      throw err;
    }
  }
  throw new Error("All RPC endpoints failed.");
};

const ArclyWallet = () => {
  const [wallet, setWallet] = useState<ethers.HDNodeWallet | ethers.Wallet | null>(null);
  const [mnemonic, setMnemonic] = useState(() => sessionStorage.getItem('arcly_mnemonic') || '');
  const [privateKey, setPrivateKey] = useState('');
  const [importValue, setImportValue] = useState('');
  const [step, setStep] = useState<WalletStep>('landing');
  const [showSensitive, setShowSensitive] = useState(false);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState('0.00');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<WalletTab>('home');
  const [homeSubTab, setHomeSubTab] = useState<'tokens' | 'nfts' | 'activity'>('tokens');
  
  const [wallets, setWallets] = useState<WalletMetadata[]>(() => {
    const saved = localStorage.getItem('arcly_wallets');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeAddress, setActiveAddress] = useState<string>(() => {
    return localStorage.getItem('arcly_active_address') || '';
  });

  const [rawUsername, setRawUsername] = useState('user');
  const username = useMemo(() => `${rawUsername.toLowerCase()}.arcly`, [rawUsername]);
  
  const [avatarMode, setAvatarMode] = useState<'pixel' | 'nft'>('pixel');
  const [pixelAvatar, setPixelAvatar] = useState(`https://api.dicebear.com/7.x/pixel-art/svg?seed=Arcly`);
  const [selectedNftAvatar, setSelectedNftAvatar] = useState('');
  
  const avatar = useMemo(() => {
    if (avatarMode === 'nft' && selectedNftAvatar) return selectedNftAvatar;
    return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${wallet?.address || 'Arcly'}`;
  }, [avatarMode, selectedNftAvatar, wallet?.address]);

  const [isDevMode, setIsDevMode] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);

  // Send transaction states
  const [sendAddress, setSendAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [txStatus, setTxStatus] = useState<TransactionStatus>('idle');
  const [txHash, setTxHash] = useState('');
  const [txError, setTxError] = useState('');

  // Swap states
  const [swapFromToken, setSwapFromToken] = useState(SUPPORTED_TOKENS[0]);
  const [swapToToken, setSwapToToken] = useState(SUPPORTED_TOKENS[1]);
  const [swapFromAmount, setSwapFromAmount] = useState('');
  const [swapToAmount, setSwapToAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState<number>(0.985); // Default
  const [estimatedFee, setEstimatedFee] = useState('0.0005'); 
  const [swapStatus, setSwapStatus] = useState<TransactionStatus>('idle');
  const [networkStatus, setNetworkStatus] = useState<'idle' | 'switching'>('idle');
  const [currentRpcIndex, setCurrentRpcIndex] = useState(0);
  const [showTokenSelector, setShowTokenSelector] = useState<'from' | 'to' | null>(null);

  const [tokenOverrides, setTokenOverrides] = useState<{ [symbol: string]: { address: string, decimals: number } }>(() => {
    const saved = localStorage.getItem('arcly_token_overrides');
    return saved ? JSON.parse(saved) : {};
  });

  const [importTokenSymbol, setImportTokenSymbol] = useState('');
  const [importTokenAddress, setImportTokenAddress] = useState('');
  const [importTokenDecimals, setImportTokenDecimals] = useState('18');
  const [showTokenImporter, setShowTokenImporter] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);

  // Dynamic Price Fetching
  useEffect(() => {
    const updateRate = async () => {
      const fromPrice = await fetchTokenPrice(swapFromToken.symbol);
      const toPrice = await fetchTokenPrice(swapToToken.symbol);
      
      if (fromPrice && toPrice) {
        const rate = (fromPrice / toPrice) * 0.995; // 0.5% spread
        setExchangeRate(rate);
        
        // Update toAmount if fromAmount exists
        if (swapFromAmount) {
          setSwapToAmount((parseFloat(swapFromAmount) * rate).toFixed(4));
        }
      }
    };
    updateRate();
  }, [swapFromToken, swapToToken]);

  // Assets & NFTs
  const [tokenBalances, setTokenBalances] = useState<{ [symbol: string]: string }>({});
  const [nfts, setNfts] = useState<ARCNFT[]>([]);
  const [nftImportAddress, setNftImportAddress] = useState('');
  const [nftImportId, setNftImportId] = useState('');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [revealMode, setRevealMode] = useState<'none' | 'privateKey' | 'mnemonic'>('none');
  const [revealConfirmed, setRevealConfirmed] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  const [activity, setActivity] = useState<any[]>([]);

  const clearWalletDataForAddress = (addr: string) => {
    localStorage.removeItem(`arcly_token_balances_${addr.toLowerCase()}`);
    localStorage.removeItem(`arcly_activity_${addr.toLowerCase()}`);
    localStorage.removeItem(`arcly_nfts_${addr.toLowerCase()}`);
    setBalance('0.00');
    setTokenBalances({
      'EURC': '0.00',
      'ARC': '0.00',
      'WETH': '0.00'
    });
    setActivity([]);
    setNfts([]);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(''), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  useEffect(() => {
    setCopiedText('');
  }, [revealMode, step, activeTab, isDrawerOpen]);

  const totalPortfolioValue = useMemo(() => {
    const native = parseFloat(balance) || 0;
    const others = (Object.values(tokenBalances) as string[]).reduce((acc: number, val: string) => acc + (parseFloat(val) || 0), 0);
    return (native + others).toFixed(2);
  }, [balance, tokenBalances]);

  // 1. SECURE STORAGE LOGIC
  const saveWalletToRegistry = (address: string, privKey: string, nickname: string, index?: number, isHD?: boolean) => {
    const encrypted = btoa(privKey);
    const newWallet: WalletMetadata = { address, encryptedPrivateKey: encrypted, nickname, index, isHD };
    
    setWallets(prev => {
      const filtered = prev.filter(w => w.address.toLowerCase() !== address.toLowerCase());
      const updated = [...filtered, newWallet];
      localStorage.setItem('arcly_wallets', JSON.stringify(updated));
      return updated;
    });
    
    setActiveAddress(address);
    localStorage.setItem('arcly_active_address', address);
    sessionStorage.setItem('arcly_wallet_vault', encrypted);
  };

  // Load address-keyed data whenever wallet changes
  useEffect(() => {
    if (!wallet) return;
    const addr = wallet.address.toLowerCase();
    
    const storedUsername = localStorage.getItem(`arcly_username_${addr}`);
    if (storedUsername) {
      setRawUsername(storedUsername.replace('.arcly', ''));
    } else {
      setRawUsername('anonymous');
    }

    setAvatarMode((localStorage.getItem(`arcly_avatar_mode_${addr}`) as 'pixel' | 'nft') || 'pixel');
    setSelectedNftAvatar(localStorage.getItem(`arcly_nft_avatar_${addr}`) || '');
    setIsDevMode(localStorage.getItem(`arcly_dev_mode_${addr}`) === 'true');
    setIsLightMode(localStorage.getItem(`arcly_light_mode_${addr}`) === 'true');
    
    const savedBalances = localStorage.getItem(`arcly_token_balances_${addr}`);
    setTokenBalances(savedBalances ? JSON.parse(savedBalances) : { 'EURC': '0.00', 'ARC': '0.00', 'WETH': '0.00' });
    
    const savedNfts = localStorage.getItem(`arcly_nfts_${addr}`);
    setNfts(savedNfts ? JSON.parse(savedNfts) : []);
    
    const savedActivity = localStorage.getItem(`arcly_activity_${addr}`);
    setActivity(savedActivity ? JSON.parse(savedActivity) : []);

    const savedOverrides = localStorage.getItem(`arcly_token_overrides_${addr}`);
    setTokenOverrides(savedOverrides ? JSON.parse(savedOverrides) : {});
    
  }, [wallet?.address]);

  // Save address-keyed data selectively
  useEffect(() => {
    if (!wallet) return;
    const addr = wallet.address.toLowerCase();
    
    localStorage.setItem(`arcly_username_${addr}`, username);
    localStorage.setItem(`arcly_avatar_mode_${addr}`, avatarMode);
    localStorage.setItem(`arcly_nft_avatar_${addr}`, selectedNftAvatar);
    localStorage.setItem(`arcly_dev_mode_${addr}`, isDevMode.toString());
    localStorage.setItem(`arcly_light_mode_${addr}`, isLightMode.toString());
    localStorage.setItem(`arcly_token_balances_${addr}`, JSON.stringify(tokenBalances));
    localStorage.setItem(`arcly_nfts_${addr}`, JSON.stringify(nfts));
    localStorage.setItem(`arcly_activity_${addr}`, JSON.stringify(activity));
    localStorage.setItem(`arcly_token_overrides_${addr}`, JSON.stringify(tokenOverrides));
    
    // Also update generic theme if wanted global, but user said address-keyed
  }, [username, avatarMode, selectedNftAvatar, isDevMode, isLightMode, tokenBalances, nfts, activity, tokenOverrides, wallet?.address]);

  const loadWalletFromSession = async () => {
    const encrypted = sessionStorage.getItem('arcly_wallet_vault');
    if (encrypted && activeAddress) {
      try {
        const decryptedKey = atob(encrypted);
        const recoveredWallet = new ethers.Wallet(decryptedKey);
        if (recoveredWallet.address.toLowerCase() === activeAddress.toLowerCase()) {
          setWallet(recoveredWallet);
          setStep('active');
          refreshAllBalances(recoveredWallet.address);
        }
      } catch (e) {
        console.error("Failed to recover session");
      }
    } else if (activeAddress && wallets.length > 0) {
      // Try to find in registry
      const meta = wallets.find(w => w.address.toLowerCase() === activeAddress.toLowerCase());
      if (meta) {
        try {
          const decryptedKey = atob(meta.encryptedPrivateKey);
          const recoveredWallet = new ethers.Wallet(decryptedKey);
          setWallet(recoveredWallet);
          sessionStorage.setItem('arcly_wallet_vault', meta.encryptedPrivateKey);
          setStep('active');
          refreshAllBalances(recoveredWallet.address);
        } catch (e) {
          console.error("Failed to load active wallet from registry");
        }
      }
    }
  };

  const getTokenAddress = (symbol: string, defaultAddress: string) => {
    if (tokenOverrides[symbol]) return tokenOverrides[symbol].address;
    if (symbol === 'EURC' && EURC_CONTRACT_ADDRESS_ARC_TESTNET && EURC_CONTRACT_ADDRESS_ARC_TESTNET.startsWith('0x') && EURC_CONTRACT_ADDRESS_ARC_TESTNET !== '0x0000000000000000000000000000000000000000') {
      return EURC_CONTRACT_ADDRESS_ARC_TESTNET;
    }
    return defaultAddress;
  };

  const getTokenDecimals = (symbol: string, defaultDecimals: number) => {
    if (tokenOverrides[symbol]) return tokenOverrides[symbol].decimals;
    return defaultDecimals;
  };

  const refreshAllBalances = async (address: string) => {
    try {
      await withRetry(async (provider) => {
        const bal = await provider.getBalance(address);
        setBalance(ethers.formatEther(bal));

        // Fetch ERC20 Token Balances
        const newBalances: { [symbol: string]: string } = {};
        
        for (const token of SUPPORTED_TOKENS) {
          if (token.address === 'native') continue;
          
          const contractAddress = getTokenAddress(token.symbol, token.address);

          if (contractAddress && contractAddress.startsWith('0x') && !contractAddress.startsWith('0x000000000000000000000000000000000000000')) {
             try {
               const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
               const tokenBal = await contract.balanceOf(address);
               const decs = getTokenDecimals(token.symbol, token.decimals);
               newBalances[token.symbol] = ethers.formatUnits(tokenBal, decs);
             } catch (e) {
               console.warn(`Failed to fetch ${token.symbol} balance at ${contractAddress}`, e);
               newBalances[token.symbol] = '0.00';
             }
          } else {
             newBalances[token.symbol] = '0.00';
          }
        }

        setTokenBalances(prev => ({ ...prev, ...newBalances }));
      }, currentRpcIndex, setCurrentRpcIndex, setNetworkStatus);
    } catch (err: any) {
      if (err.message?.includes('failed to fetch')) {
        console.error("Failed to fetch response from Arc RPC after retries:", err);
      } else {
        console.error("Failed to refresh balances:", err);
      }
    }
  };

  useEffect(() => {
    loadWalletFromSession();
  }, []);

  // Real-time balance listener
  useEffect(() => {
    if (!wallet || step !== 'active') return;

    const urls = ARC_TESTNET_PARAMS.rpcUrls || [ARC_TESTNET_PARAMS.rpcUrl];
    const provider = new ethers.JsonRpcProvider(urls[currentRpcIndex]);
    
    // Initial fetch
    refreshAllBalances(wallet.address);

    // Listen for new blocks to update balance
    const onBlock = () => {
      refreshAllBalances(wallet.address);
    };

    provider.on('block', onBlock);

    return () => {
      provider.off('block', onBlock);
    };
  }, [wallet, step, currentRpcIndex]);

  // 2. CREATE WALLET
  const handleCreateWallet = () => {
    try {
      const newWallet = ethers.Wallet.createRandom();
      if (newWallet.mnemonic) {
        setMnemonic(newWallet.mnemonic.phrase);
        sessionStorage.setItem('arcly_mnemonic', newWallet.mnemonic.phrase);
      }
      setWallet(newWallet);
      setPrivateKey(newWallet.privateKey);
      saveWalletToRegistry(newWallet.address, newWallet.privateKey, 'Main Wallet', 0, true);
      setStep('create');
    } catch (err) {
      setError("Failed to create wallet.");
    }
  };

  // 3. IMPORT WALLET
  const handleImport = () => {
    setError('');
    setLoading(true);
    try {
      let importedWallet;
      let isHD = false;
      if (importValue.trim().split(/\s+/).length >= 12) {
        importedWallet = ethers.Wallet.fromPhrase(importValue.trim());
        setMnemonic(importValue.trim());
        sessionStorage.setItem('arcly_mnemonic', importValue.trim());
        isHD = true;
      } else {
        const cleanKey = importValue.startsWith('0x') ? importValue : `0x${importValue}`;
        importedWallet = new ethers.Wallet(cleanKey);
      }
      
      setWallet(importedWallet);
      setPrivateKey(importedWallet.privateKey);
      saveWalletToRegistry(importedWallet.address, importedWallet.privateKey, 'Imported Wallet', 0, isHD);
      setStep('active');
      refreshAllBalances(importedWallet.address);
    } catch (err) {
      setError("Invalid Mnemonic or Private Key.");
    } finally {
      setLoading(false);
    }
  };

  const deriveNewAccount = () => {
    if (!mnemonic) return;
    try {
      const nextIndex = wallets.filter(w => w.isHD).length;
      const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${nextIndex}`);
      saveWalletToRegistry(hdNode.address, hdNode.privateKey, `Account ${nextIndex + 1}`, nextIndex, true);
      setWallet(hdNode);
      setPrivateKey(hdNode.privateKey);
      refreshAllBalances(hdNode.address);
    } catch (err) {
      console.error("Derivation failed", err);
    }
  };

  const handleSwitchWallet = (address: string) => {
    const meta = wallets.find(w => w.address.toLowerCase() === address.toLowerCase());
    if (meta) {
      try {
        const decryptedKey = atob(meta.encryptedPrivateKey);
        const switchedWallet = new ethers.Wallet(decryptedKey);
        setWallet(switchedWallet);
        setPrivateKey(switchedWallet.privateKey);
        setActiveAddress(address);
        localStorage.setItem('arcly_active_address', address);
        sessionStorage.setItem('arcly_wallet_vault', meta.encryptedPrivateKey);
        refreshAllBalances(address);
        setIsDrawerOpen(false);
      } catch (e) {
        console.error("Switch failed", e);
      }
    }
  };

  const logout = () => {
    sessionStorage.removeItem('arcly_wallet_vault');
    sessionStorage.removeItem('arcly_mnemonic');
    setWallet(null);
    setMnemonic('');
    setPrivateKey('');
    setStep('landing');
    setActiveTab('home');
    setIsDrawerOpen(false);
  };

  const handleSendTransaction = async () => {
    if (!wallet) return;
    setTxStatus('loading');
    setTxError('');
    
    try {
      console.log("Initializing Send Transaction...");
      
      const tx = await withRetry(async (provider) => {
        const signer = new ethers.Wallet(privateKey, provider);
        try {
          return await signer.sendTransaction({
            to: sendAddress,
            value: ethers.parseEther(sendAmount),
            chainId: ARC_TESTNET_PARAMS.chainId
          });
        } catch (sendErr: any) {
          if (sendErr.message?.includes('failed to fetch')) {
             console.error("Send Transaction Failed (Arc RPC connection error):", sendErr);
          } else {
             console.error("Send Transaction Failed:", sendErr);
          }
          throw sendErr;
        }
      }, currentRpcIndex, setCurrentRpcIndex, setNetworkStatus);
      
      console.log("Transaction Broadcasted. Hash:", tx.hash);
      setTxHash(tx.hash);
      setTxStatus('success');
      
      // Save to activity history
      setActivity(prev => [{
        id: Date.now(),
        type: 'send',
        amount: sendAmount,
        symbol: 'USDC',
        to: sendAddress,
        hash: tx.hash,
        timestamp: new Date().toISOString(),
        status: 'confirmed'
      }, ...prev]);

      // Wait for confirmation to update balance
      console.log("Waiting for confirmation...");
      await withRetry(() => tx.wait(), currentRpcIndex, setCurrentRpcIndex, setNetworkStatus);
      console.log("Transaction Confirmed.");
      refreshAllBalances(wallet.address);
    } catch (err: any) {
      if (err.message?.includes('failed to fetch')) {
        console.error("Failed to fetch response from Arc RPC:", err);
      } else {
        console.error("Transaction Error Trace:", err);
      }
      
      let friendlyError = "Transaction failed. Please check your connection.";
      if (err.message?.includes('failed to fetch')) {
        friendlyError = "Network connection unstable. Unable to reach Arc Testnet RPC.";
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        friendlyError = "Insufficient funds for gas or transfer.";
      } else if (err.reason) {
        friendlyError = `Error: ${err.reason}`;
      } else {
        friendlyError = err.message || "An unexpected error occurred.";
      }
      
      setTxError(friendlyError);
      setTxStatus('error');
    }
  };

  const handleImportNft = async () => {
    if (!nftImportAddress || !nftImportId || !wallet) return;
    setLoading(true);
    setError('');
    
    try {
      console.log("Initializing NFT Contract...");
      
      const owner = await withRetry(async (provider) => {
        const nftContract = new ethers.Contract(nftImportAddress, ERC721_ABI, provider);
        console.log(`Checking ownership of Token ID ${nftImportId} at ${nftImportAddress}...`);
        return await nftContract.ownerOf(nftImportId);
      }, currentRpcIndex, setCurrentRpcIndex, setNetworkStatus);

      if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        setError("You do not own this NFT.");
        setLoading(false);
        return;
      }
      
      // 2. Fetch Metadata URI
      console.log("Fetching TokenURI from contract...");
      let uri = await withRetry(async (provider) => {
        const nftContract = new ethers.Contract(nftImportAddress, ERC721_ABI, provider);
        return await nftContract.tokenURI(nftImportId);
      }, currentRpcIndex, setCurrentRpcIndex, setNetworkStatus);
      
      // Handle IPFS
      if (uri.startsWith('ipfs://')) {
        uri = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
      }
      
      // 3. Fetch Metadata JSON
      console.log(`Fetching metadata JSON from: ${uri}`);
      let metadata: any = {};
      try {
        const response = await fetch(uri, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        metadata = await response.json();
        console.log("Successfully retrieved NFT metadata JSON.");
      } catch (fetchErr) {
        console.warn("Failed to fetch NFT metadata JSON from manifest URL:", fetchErr);
        metadata = { name: `Arcly NFT #${nftImportId}` }; // Minimal fallback
      }
      
      let imageUrl = metadata.image || metadata.image_url;
      if (imageUrl && imageUrl.startsWith('ipfs://')) {
        imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
      }
      
      const newNft: ARCNFT = {
        id: `${nftImportAddress}-${nftImportId}`,
        name: metadata.name || `Arcly NFT #${nftImportId}`,
        image: imageUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${nftImportAddress}${nftImportId}`,
        contractAddress: nftImportAddress,
        tokenId: nftImportId
      };
      
      setNfts(prev => {
        if (prev.some(n => n.id === newNft.id)) return prev;
        return [...prev, newNft];
      });
      
      setNftImportAddress('');
      setNftImportId('');
    } catch (err: any) {
      console.error("Critical NFT Import Failure:", err);
      let errMsg = "Failed to import NFT. Verify address and ID.";
      if (err.message?.includes('failed to fetch')) {
        errMsg = "Unstable connection to Arc Testnet. Unable to verify NFT ownership.";
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = async () => {
    if (!swapFromAmount || isNaN(parseFloat(swapFromAmount)) || !wallet) return;
    setSwapStatus('loading');
    setTxError('');
    
    try {
      console.log("Initializing Swap provider and signer...");
      
      const amountIn = ethers.parseUnits(swapFromAmount, swapFromToken.decimals);
      const minAmountOut = (ethers.parseUnits(swapToAmount, swapToToken.decimals) * 98n) / 100n; // 2% slippage
      
      const targetTokenAddress = getTokenAddress(swapToToken.symbol, swapToToken.address);

      console.log(`Routing swap: ${swapFromAmount} ${swapFromToken.symbol} -> ${swapToToken.symbol} (${targetTokenAddress})`);

      // 1. Execute Transaction with Retries on Pre-flight
      const tx = await withRetry(async (provider) => {
        const signer = new ethers.Wallet(wallet.privateKey, provider);
        const router = new ethers.Contract(ROUTER_CONTRACT_ADDRESS, ROUTER_ABI, signer);
        try {
          return await router.swapNativeForToken(
            targetTokenAddress === 'native' ? ethers.ZeroAddress : targetTokenAddress, 
            minAmountOut,
            { value: amountIn }
          );
        } catch (contractErr: any) {
          if (contractErr.message?.includes('failed to fetch')) {
            console.error("Contract Interaction Failed (Arc RPC connection error):", contractErr);
          } else {
            console.error("Contract Interaction Failed:", contractErr);
          }
          throw contractErr;
        }
      }, currentRpcIndex, setCurrentRpcIndex, setNetworkStatus);
      
      console.log("Transaction Broadcasted. Hash:", tx.hash);
      setTxHash(tx.hash);
      
      // 2. Wait for Confirmation
      console.log("Waiting for block confirmation...");
      const receipt = await withRetry(() => tx.wait(), currentRpcIndex, setCurrentRpcIndex, setNetworkStatus) as ethers.ContractTransactionReceipt | null;
      console.log("Transaction Confirmed. Receipt:", receipt);

      // 2.1 Parse Receipt Logs for Token Transfer
      const erc20Interface = new ethers.Interface(ERC20_ABI);
      let returnedAmount = 0n;
      let targetTokenDecimals = getTokenDecimals(swapToToken.symbol, swapToToken.decimals);
      
      if (receipt && receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsedLog = erc20Interface.parseLog(log);
            if (parsedLog && parsedLog.name === 'Transfer') {
              const toAddr = parsedLog.args[1];
              if (toAddr.toLowerCase() === wallet.address.toLowerCase()) {
                returnedAmount = parsedLog.args[2];
                console.log(`Swap Result: Received ${ethers.formatUnits(returnedAmount, targetTokenDecimals)} ${swapToToken.symbol} from contract ${log.address}`);
              }
            }
          } catch (e) {
            // Log might not be an ERC20 Transfer, skip
          }
        }
      }

      if (returnedAmount === 0n) {
        console.warn("Swap executed but no tokens received. Pool might be empty.");
        setTxError("Swap executed, but 0 tokens returned. The testnet liquidity pool may be empty.");
        setSwapStatus('error');
        return;
      }
      
      // 3. Save to activity history
      setActivity(prev => [{
        id: Date.now(),
        type: 'swap',
        fromSymbol: swapFromToken.symbol,
        toSymbol: swapToToken.symbol,
        fromAmount: swapFromAmount,
        toAmount: swapToAmount,
        hash: tx.hash,
        timestamp: new Date().toISOString(),
        status: 'confirmed'
      }, ...prev]);

      // 4. Refresh Balances
      console.log("Refreshing balances post-swap...");
      await refreshAllBalances(wallet.address);
      
      setSwapStatus('success');
      setSwapFromAmount('');
      setSwapToAmount('');
      
      setTimeout(() => setSwapStatus('idle'), 5000);
    } catch (err: any) {
      if (err.message?.includes('failed to fetch')) {
        console.error("Failed to fetch response from Arc RPC:", err);
      } else {
        console.error("Full Swap Failure Trace:", err);
      }
      
      let friendlyError = "Swap failed. Please check your connection.";
      if (err.message?.includes('failed to fetch')) {
        friendlyError = "Network connection unstable. Unable to reach Arc Testnet RPC.";
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        friendlyError = "Insufficient gas or funds for swap.";
      } else if (err.reason) {
        friendlyError = `Swap Error: ${err.reason}`;
      } else {
        friendlyError = err.message || "An unexpected error occurred during the swap.";
      }

      setTxError(friendlyError);
      setSwapStatus('error');
    }
  };

  // --- UI Components ---
  // Card has been moved to top-level to fix input focus issues

  return (
    <div className={`min-h-screen font-sans selection:bg-blue-500/30 transition-colors duration-300 ${isLightMode ? 'bg-[#F9F9FB] text-neutral-800' : 'bg-black text-neutral-200'}`}>
      {/* Mesh Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full ${isLightMode ? 'bg-blue-100/50' : 'bg-blue-900/10'}`}></div>
        <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full ${isLightMode ? 'bg-blue-100/50' : 'bg-blue-900/10'}`}></div>
      </div>

      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed top-0 left-0 bottom-0 w-80 z-[101] shadow-2xl flex flex-col ${isLightMode ? 'bg-white' : 'bg-[#0A0A0A] border-r border-neutral-900'}`}
            >
              <div className="p-6 border-b border-neutral-900 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 flex items-center justify-center overflow-hidden rounded">
                    <img src="https://cdn.corenexis.com/files/c/4579882720.png" alt="Arcly Logo" className="w-full h-full object-contain" />
                  </div>
                  <span className={`text-sm font-bold tracking-tighter ${isLightMode ? 'text-black' : 'text-white'}`}>SETTINGS</span>
                </div>
                <button onClick={() => setIsDrawerOpen(false)} className="p-2 rounded-lg hover:bg-neutral-800 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Profile Section */}
                <div className="space-y-4">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-bold">Profile Setup</p>
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center overflow-hidden transition-all ${isLightMode ? 'border-neutral-200' : 'border-neutral-800'}`}>
                      <Avatar 
                        size={56} 
                        name={wallet?.address || 'Arcly'} 
                        variant="pixel" 
                        colors={['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']} 
                      />
                    </div>
                    <div className="flex-1">
                      <div className={`flex items-center gap-1 border-b pb-1 transition-all ${isLightMode ? 'border-neutral-200' : 'border-neutral-800 focus-within:border-blue-500'}`}>
                        <input 
                          type="text" 
                          value={rawUsername}
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase().replace('.arcly', '').replace(/[^a-z0-9]/g, '');
                            setRawUsername(val);
                          }}
                          placeholder="username"
                          className={`flex-1 bg-transparent outline-none text-sm font-medium ${isLightMode ? 'text-black' : 'text-white'}`}
                        />
                        <span className="text-xs text-blue-500 font-bold">.arcly</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Manage Wallets Section */}
                <div className="space-y-4">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-bold">Manage Wallets</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                    {wallets.map((w) => (
                      <div 
                        key={w.address}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${w.address.toLowerCase() === wallet?.address.toLowerCase() ? (isLightMode ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/20') : (isLightMode ? 'bg-neutral-50 border-neutral-100 border-dashed' : 'bg-neutral-900 border-neutral-800 border-dashed hover:border-neutral-700')}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar size={32} name={w.address} variant="pixel" />
                          <div className="min-w-0">
                            <p className={`text-[10px] font-bold truncate ${isLightMode ? 'text-black' : 'text-white'}`}>{w.nickname}</p>
                            <p className="text-[8px] text-neutral-500 font-mono">{w.address.slice(0, 6)}...{w.address.slice(-4)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           {w.address.toLowerCase() !== wallet?.address.toLowerCase() ? (
                              <button 
                                onClick={() => handleSwitchWallet(w.address)}
                                className="bg-blue-600 hover:bg-blue-500 text-white text-[8px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all"
                              >
                                Activate
                              </button>
                           ) : (
                              <CheckCircle2 size={14} className="text-blue-500" />
                           )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={deriveNewAccount}
                      disabled={!mnemonic}
                      className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-dashed transition-all disabled:opacity-30 group ${isLightMode ? 'border-neutral-200 hover:bg-neutral-50 text-neutral-600' : 'border-neutral-800 hover:bg-neutral-900 text-neutral-400 hover:border-blue-500/50 hover:text-blue-500'}`}
                    >
                      <Plus size={16} />
                      <span className="text-[8px] font-bold uppercase">Generate New</span>
                    </button>
                    <button 
                      onClick={() => {
                        setStep('import');
                        setIsDrawerOpen(false);
                      }}
                      className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-dashed transition-all group ${isLightMode ? 'border-neutral-200 hover:bg-neutral-50 text-neutral-600' : 'border-neutral-800 hover:bg-neutral-900 text-neutral-400 hover:border-blue-500/50 hover:text-blue-500'}`}
                    >
                      <Download size={16} />
                      <span className="text-[8px] font-bold uppercase">Import Key</span>
                    </button>
                  </div>
                </div>

                {/* Appearance Section */}
                <div className="space-y-4">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-bold">Preferences</p>
                  <div className={`flex justify-between items-center p-4 rounded-2xl border transition-all ${isLightMode ? 'bg-neutral-50 border-neutral-100' : 'bg-neutral-900 border-neutral-800'}`}>
                    <div className="flex items-center gap-3">
                      {isLightMode ? <Sun size={18} className="text-orange-500" /> : <Moon size={18} className="text-blue-500" />}
                      <span className="text-xs font-medium">Dark Mode</span>
                    </div>
                    <button 
                      onClick={() => setIsLightMode(!isLightMode)}
                      className={`w-10 h-5 rounded-full relative transition-all ${!isLightMode ? 'bg-blue-600' : 'bg-neutral-700'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${!isLightMode ? 'right-1' : 'left-1'}`}></div>
                    </button>
                  </div>
                </div>

                {/* Network Section */}
                <div className="space-y-4">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-bold">Connected Network</p>
                  <div className={`p-4 rounded-2xl border ${isLightMode ? 'bg-neutral-50 border-neutral-100' : 'bg-neutral-900 border-neutral-800'}`}>
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-[9px] text-neutral-500 uppercase">Network Name</p>
                        <p className="text-xs font-bold">{ARC_TESTNET_PARAMS.chainName}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-[9px] text-neutral-500 uppercase">Chain ID</p>
                          <p className="text-xs font-mono font-bold tracking-widest">{ARC_TESTNET_PARAMS.chainId}</p>
                        </div>
                        <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-1 rounded-full border border-blue-500/20">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                          <span className="text-[8px] font-bold text-blue-500 uppercase">Connected</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-neutral-800">
                        <p className="text-[9px] text-neutral-500 uppercase mb-1">Current Address</p>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-mono text-neutral-400">
                            {wallet?.address ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}` : '0x...'}
                          </p>
                          <button 
                            onClick={() => {
                              if (wallet?.address) {
                                copyToClipboard(wallet.address);
                              }
                            }}
                            className={`p-1.5 rounded-md transition-colors ${copiedText && copiedText === wallet?.address ? 'text-green-500' : 'p-1.5 rounded-md hover:bg-neutral-800 text-neutral-500 transition-colors'}`}
                          >
                            {copiedText && copiedText === wallet?.address ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security Section */}
                <div className="space-y-4">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-bold">Security</p>
                  <div className="space-y-2">
                    <button 
                      onClick={() => {
                        setRevealMode('privateKey');
                        setRevealConfirmed(false);
                      }}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${isLightMode ? 'bg-neutral-50 border-neutral-100 hover:bg-white' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800/50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Key size={18} className="text-blue-500" />
                        <span className="text-xs font-medium">Show Private Key</span>
                      </div>
                      <ChevronRight size={14} className="text-neutral-500" />
                    </button>
                    <button 
                      onClick={() => {
                        setRevealMode('mnemonic');
                        setRevealConfirmed(false);
                      }}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${isLightMode ? 'bg-neutral-50 border-neutral-100 hover:bg-white' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800/50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <ShieldCheck size={18} className="text-blue-500" />
                        <span className="text-xs font-medium">Show Recovery Phrase</span>
                      </div>
                      <ChevronRight size={14} className="text-neutral-500" />
                    </button>
                  </div>
                </div>

                {/* Actions Section */}
                <div className="space-y-4 pb-12">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-bold">Critical Actions</p>
                  <div className="space-y-2">
                    <button 
                      onClick={() => {
                        setStep('import');
                        setIsDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${isLightMode ? 'bg-neutral-50 border-neutral-100 hover:bg-white' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800/50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Download size={18} className="text-neutral-500" />
                        <span className="text-xs font-bold">Import Existing Wallet</span>
                      </div>
                    </button>
                    <button 
                      onClick={logout}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${isLightMode ? 'bg-red-50 border-red-100 text-red-600' : 'bg-red-500/5 border-red-500/10 text-red-500'}`}
                    >
                      <div className="flex items-center gap-3">
                        <LogOut size={18} />
                        <span className="text-xs font-bold">Logout / Lock Wallet</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}

        {/* Security Reveal Modal */}
        {revealMode !== 'none' && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`max-w-sm w-full p-8 rounded-3xl border shadow-2xl ${isLightMode ? 'bg-white border-neutral-200' : 'bg-[#0A0A0A] border-neutral-800'}`}
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 border border-red-500/20">
                  <ShieldAlert className="text-red-500" size={32} />
                </div>
                <h3 className="text-xl font-bold mb-2">Security Warning</h3>
                <p className="text-sm text-neutral-500 mb-8 leading-relaxed">
                  NEVER share this. Anyone with this {revealMode === 'privateKey' ? 'key' : 'phrase'} can steal your funds! Do you still want to proceed?
                </p>

                {!revealConfirmed ? (
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <button 
                      onClick={() => setRevealMode('none')}
                      className={`py-3 rounded-xl font-bold border transition-all ${isLightMode ? 'border-neutral-200' : 'border-neutral-800 hover:bg-neutral-900'}`}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => setRevealConfirmed(true)}
                      className="py-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg shadow-red-600/20"
                    >
                      Show Me
                    </button>
                  </div>
                ) : (
                  <div className="w-full space-y-6">
                    <div className={`p-4 rounded-2xl border font-mono text-sm break-all leading-relaxed ${isLightMode ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`}>
                      {revealMode === 'privateKey' ? privateKey : mnemonic}
                      <button 
                        onClick={() => copyToClipboard(revealMode === 'privateKey' ? privateKey : mnemonic)}
                        className={`mt-4 w-full flex items-center justify-center gap-2 text-[10px] uppercase font-black transition-all ${copiedText && copiedText === (revealMode === 'privateKey' ? privateKey : mnemonic) ? 'text-green-500' : 'text-blue-500'}`}
                      >
                        {copiedText && copiedText === (revealMode === 'privateKey' ? privateKey : mnemonic) ? <Check size={12} /> : <Copy size={12} />}
                        {copiedText && copiedText === (revealMode === 'privateKey' ? privateKey : mnemonic) ? 'Copied!' : 'Copy to Clipboard'}
                      </button>
                    </div>
                    <button 
                      onClick={() => setRevealMode('none')}
                      className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold"
                    >
                      I Have Stored It Safely
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="relative z-10 max-w-lg mx-auto pt-8 px-6">
        {/* Header */}
        <header className="grid grid-cols-3 items-center mb-8 h-12">
          <div className="flex justify-start items-center gap-2 overflow-visible">
            {step === 'active' && (
              <button 
                onClick={() => setIsDrawerOpen(true)}
                className={`p-2 rounded-xl border transition-all ${isLightMode ? 'bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-600' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-neutral-400'}`}
              >
                <Menu size={20} />
              </button>
            )}
            
            {step === 'active' && wallet && (
              <div className="relative">
                <button 
                  onClick={() => setShowAccountSwitcher(!showAccountSwitcher)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${isLightMode ? 'bg-white border-neutral-200 hover:bg-neutral-50' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800'}`}
                >
                  <div className="w-5 h-5 rounded-md overflow-hidden">
                    <Avatar size={20} name={wallet.address} variant="pixel" />
                  </div>
                  <div className="text-left hidden xs:block">
                    <p className={`text-[9px] font-black uppercase tracking-tighter leading-none mb-0.5 ${isLightMode ? 'text-neutral-900' : 'text-white'}`}>
                      {wallets.find(w => w.address.toLowerCase() === wallet.address.toLowerCase())?.nickname || 'Account'}
                    </p>
                    <p className="text-[8px] text-neutral-500 font-mono leading-none">
                      {wallet.address.slice(0, 4)}...{wallet.address.slice(-4)}
                    </p>
                  </div>
                </button>

                <AnimatePresence>
                  {showAccountSwitcher && (
                    <>
                      <div className="fixed inset-0 z-[110]" onClick={() => setShowAccountSwitcher(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className={`absolute top-full left-0 mt-2 w-56 rounded-2xl border shadow-2xl z-[111] overflow-hidden ${isLightMode ? 'bg-white border-neutral-200' : 'bg-[#0A0A0A] border-neutral-800'}`}
                      >
                        <div className="p-3 border-b border-neutral-800 flex justify-between items-center">
                          <span className="text-[9px] uppercase font-black text-neutral-500 tracking-widest">Select Account</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                          {wallets.map((w) => (
                            <button 
                              key={w.address}
                              onClick={() => {
                                handleSwitchWallet(w.address);
                                setShowAccountSwitcher(false);
                              }}
                              className={`w-full flex items-center gap-3 p-3 transition-colors hover:bg-blue-500/5 ${w.address.toLowerCase() === wallet.address.toLowerCase() ? (isLightMode ? 'bg-blue-50' : 'bg-blue-500/10') : ''}`}
                            >
                              <Avatar size={24} name={w.address} variant="pixel" />
                              <div className="text-left flex-1 min-w-0">
                                <p className={`text-[10px] font-bold truncate ${isLightMode ? 'text-black' : 'text-white'}`}>{w.nickname}</p>
                                <p className="text-[9px] text-neutral-500 font-mono">{w.address.slice(0, 6)}...{w.address.slice(-4)}</p>
                              </div>
                              {w.address.toLowerCase() === wallet.address.toLowerCase() && (
                                <CheckCircle2 size={12} className="text-blue-500" />
                              )}
                            </button>
                          ))}
                        </div>
                        <button 
                          onClick={() => {
                            setShowAccountSwitcher(false);
                            setIsDrawerOpen(true);
                          }}
                          className={`w-full p-3 text-[9px] font-black uppercase text-blue-500 border-t border-neutral-800 hover:bg-blue-500/5 transition-colors`}
                        >
                          Manage Wallets
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2">
            <div className="w-6 h-6 flex items-center justify-center overflow-hidden rounded">
              <img src="https://cdn.corenexis.com/files/c/4579882720.png" alt="Arcly Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className={`text-xl font-bold tracking-wide ${isLightMode ? 'text-black' : 'text-white'}`}>Arcly</h1>
          </div>

          <div className="flex justify-end">
            {(activeTab !== 'home' && step === 'active') && (
              <button 
                onClick={() => setActiveTab('home')}
                className={`p-2 rounded-xl border transition-all ${isLightMode ? 'bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-600' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-neutral-400'}`}
              >
                <ChevronLeft size={20} />
              </button>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {/* Landing View */}
          {step === 'landing' && (
            <Card key="landing" isLightMode={isLightMode}>
              <div className="flex flex-col items-center text-center mb-10">
                <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mb-6 overflow-hidden">
                  <img src="https://cdn.corenexis.com/files/c/4579882720.png" alt="Arcly Logo" className="w-10 h-10 object-contain" />
                </div>
                <h2 className="text-2xl font-semibold text-white mb-2">Welcome to Arcly</h2>
                <p className="text-neutral-500 text-sm max-w-[240px]">The professional gateway to the ARC sovereign network.</p>
              </div>
              
              <div className="space-y-3">
                <button 
                  onClick={handleCreateWallet}
                  className="w-full group bg-white text-black hover:bg-neutral-200 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <Plus size={18} />
                  Create New Wallet
                </button>
                <button 
                  onClick={() => setStep('import')}
                  className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <RefreshCw size={18} />
                  Restore Wallet
                </button>
              </div>
              
              <div className="mt-10 pt-6 border-t border-neutral-900 flex justify-center gap-6">
                <a href="https://arc.network" target="_blank" className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-white transition-colors flex items-center gap-1">Docs <ExternalLink size={10}/></a>
                <a href="https://testnet.arcscan.app/" target="_blank" className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-white transition-colors flex items-center gap-1">Explorer <ExternalLink size={10}/></a>
              </div>
            </Card>
          )}

          {/* Create / Backup View */}
          {step === 'create' && (
            <Card key="create" title="Secret Recovery Phrase" subtitle="Store this securely. If you lose it, your funds are gone." isLightMode={isLightMode}>
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl mb-6 flex gap-4">
                <ShieldAlert className="text-amber-500 shrink-0" size={20} />
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Never share this phrase. ARCLY team will never ask for it. Anyone who has this can control your wallet.
                </p>
              </div>

              <div className="space-y-6">
                <div className="relative group">
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest mb-1.5 block">12-Word Mnemonic</label>
                  <div className="bg-neutral-900 p-4 rounded-xl font-mono text-sm leading-relaxed border border-neutral-800 break-words pr-12 relative group">
                    {mnemonic}
                    <button 
                      onClick={() => copyToClipboard(mnemonic)}
                      className={`absolute top-4 right-4 p-1 rounded-md transition-colors ${copiedText && copiedText === mnemonic ? 'text-green-500 bg-green-500/10' : 'hover:bg-neutral-800 text-neutral-500 hover:text-white'}`}
                    >
                      {copiedText && copiedText === mnemonic ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest mb-1.5 block">Private Key</label>
                  <div className="flex items-center bg-neutral-900 px-4 py-3 rounded-xl border border-neutral-800">
                    <input 
                      type={showSensitive ? "text" : "password"} 
                      readOnly 
                      value={privateKey} 
                      className="bg-transparent w-full outline-none text-sm font-mono text-neutral-300"
                    />
                    <button 
                      onClick={() => setShowSensitive(!showSensitive)}
                      className="p-1 text-neutral-500 hover:text-white transition-colors"
                    >
                      {showSensitive ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                  <button 
                    onClick={() => setStep('active')}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
                  >
                    I've Saved It Securely
                  </button>
                  <button 
                    onClick={() => { setStep('landing'); logout(); }}
                    className="w-full text-neutral-500 text-sm hover:text-white transition-colors"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </Card>
          )}

          {/* Import View */}
          {step === 'import' && (
            <Card key="import" title="Import Wallet" subtitle="Enter your mnemonic phrase or private key." isLightMode={isLightMode}>
              <div className="relative mb-6">
                <textarea 
                  placeholder="word1 word2 word3..."
                  value={importValue}
                  className="w-full bg-neutral-900 border border-neutral-800 p-4 rounded-xl h-32 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
                  onChange={(e) => setImportValue(e.target.value)}
                />
                <Database className="absolute bottom-4 right-4 text-neutral-700 pointer-events-none" size={16} />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg mb-6 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <button 
                  onClick={handleImport}
                  disabled={loading}
                  className="w-full bg-white text-black hover:bg-neutral-200 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <RefreshCw className="animate-spin" size={18} /> : <Lock size={18} />}
                  Restore Wallet
                </button>
                <button 
                  onClick={() => setStep('landing')} 
                  className="w-full text-neutral-500 text-sm hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </Card>
          )}

          {/* Active Dashboard */}
          {step === 'active' && wallet && activeTab === 'home' && (
            <Card key="dashboard" isLightMode={isLightMode}>
              <div className="flex flex-col items-center mb-10">
                <div className={`w-14 h-14 border rounded-2xl flex items-center justify-center mb-6 ring-4 transition-all shadow-xl ${isLightMode ? 'bg-white border-neutral-200 ring-neutral-100' : 'bg-neutral-900 border-neutral-800 ring-neutral-900/50'}`}>
                  <Avatar 
                    size={56} 
                    name={wallet.address} 
                    variant="pixel" 
                    colors={['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']} 
                  />
                </div>
                <h3 className={`text-sm font-medium mb-1 ${isLightMode ? 'text-black' : 'text-white'}`}>{username}</h3>
                <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mb-4">Portfolio Net Worth</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-4xl font-mono font-medium ${isLightMode ? 'text-black' : 'text-white'}`}>{totalPortfolioValue}</span>
                    <span className="text-lg font-bold text-neutral-400">USD</span>
                  </div>
                  <button 
                    onClick={() => refreshAllBalances(wallet.address)}
                    className={`p-2 rounded-full border transition-all ${isLightMode ? 'bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-400' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-neutral-500'}`}
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-8">
                <button 
                  onClick={() => setActiveTab('send')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isLightMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 group-hover:bg-blue-700' : 'bg-blue-600 text-white group-hover:bg-blue-500'}`}>
                    <ArrowRight size={20} className="-rotate-45" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Send</span>
                </button>
                <button 
                  onClick={() => setActiveTab('receive')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isLightMode ? 'bg-neutral-100 text-neutral-600 group-hover:bg-neutral-200' : 'bg-neutral-900 border border-neutral-800 text-neutral-400 group-hover:bg-neutral-800'}`}>
                    <ArrowDownLeft size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Receive</span>
                </button>
                <button 
                  onClick={() => setActiveTab('swap')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isLightMode ? 'bg-neutral-100 text-neutral-600 group-hover:bg-neutral-200' : 'bg-neutral-900 border border-neutral-800 text-neutral-400 group-hover:bg-neutral-800'}`}>
                    <ArrowLeftRight size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Swap</span>
                </button>
                <a 
                  href="https://faucet.circle.com/" 
                  target="_blank" 
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${isLightMode ? 'bg-neutral-100 text-neutral-600 group-hover:bg-neutral-200' : 'bg-neutral-900 border border-neutral-800 text-neutral-400 group-hover:bg-neutral-800'}`}>
                    <Plus size={20} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Gas</span>
                </a>
              </div>

              {/* Home Sub-Tabs (Assets/NFTs) */}
              <div className="space-y-6">
                <div className={`flex border-b ${isLightMode ? 'border-neutral-100' : 'border-neutral-900'}`}>
                  <button 
                    onClick={() => setHomeSubTab('tokens')}
                    className={`pb-3 px-1 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${homeSubTab === 'tokens' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500'}`}
                  >
                    Tokens
                  </button>
                  <button 
                    onClick={() => setHomeSubTab('nfts')}
                    className={`pb-3 px-1 ml-6 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${homeSubTab === 'nfts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500'}`}
                  >
                    NFTs
                  </button>
                  <button 
                    onClick={() => setHomeSubTab('activity')}
                    className={`pb-3 px-1 ml-6 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${homeSubTab === 'activity' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500'}`}
                  >
                    Activity
                  </button>
                </div>

                {homeSubTab === 'tokens' && (
                  <div className="space-y-4">
                    <div className={`flex items-center justify-between p-4 rounded-xl border ${isLightMode ? 'bg-neutral-50 border-neutral-100' : 'bg-neutral-900 border-neutral-800'}`}>
                      <div className="flex items-center gap-4">
                        <TokenIcon symbol="USDC" size="md" />
                        <div>
                          <p className={`text-sm font-bold ${isLightMode ? 'text-black' : 'text-white'}`}>USDC</p>
                          <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Native Token</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-mono font-bold ${isLightMode ? 'text-black' : 'text-white'}`}>{balance}</p>
                      </div>
                    </div>
                    {SUPPORTED_TOKENS.filter(t => t.address !== 'native').map(token => (
                      <div key={token.address} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isLightMode ? 'bg-neutral-50 border-neutral-100 hover:bg-neutral-100' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800'}`}>
                        <div className="flex items-center gap-4">
                          <TokenIcon symbol={token.symbol} size="md" />
                          <div>
                            <p className={`text-sm font-bold ${isLightMode ? 'text-black' : 'text-white'}`}>{token.symbol}</p>
                            <p className="text-[10px] text-neutral-500 uppercase tracking-widest">{token.name}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-mono font-bold ${isLightMode ? 'text-black' : 'text-white'}`}>
                            {tokenBalances[token.symbol] || '0.00'}
                          </p>
                        </div>
                      </div>
                    ))}

                    <button 
                      onClick={() => setShowTokenImporter(!showTokenImporter)}
                      className={`w-full py-3 rounded-xl border border-dashed text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${showTokenImporter ? 'border-red-500/50 text-red-500 hover:bg-red-500/5' : 'border-neutral-700 text-neutral-500 hover:border-blue-500 hover:text-blue-500'}`}
                    >
                      {showTokenImporter ? <X size={14} /> : <Plus size={14} />}
                      {showTokenImporter ? 'Cancel Import' : 'Import Custom Token'}
                    </button>
                    
                    {showTokenImporter && (
                       <div className={`p-4 rounded-xl border ${isLightMode ? 'bg-blue-50/50 border-blue-100' : 'bg-blue-500/5 border-blue-500/20'}`}>
                          <p className="text-[10px] text-blue-500 uppercase font-bold tracking-widest mb-3">Custom Token Definition</p>
                          <div className="space-y-3">
                             <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[8px] text-neutral-500 uppercase font-bold">Symbol</label>
                                  <input 
                                    placeholder="e.g. EURC"
                                    value={importTokenSymbol}
                                    onChange={(e) => setImportTokenSymbol(e.target.value.toUpperCase())}
                                    className={`w-full px-3 py-2 rounded-lg border text-xs outline-none focus:border-blue-500 ${isLightMode ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[8px] text-neutral-500 uppercase font-bold">Decimals</label>
                                  <input 
                                    placeholder="18"
                                    type="number"
                                    value={importTokenDecimals}
                                    onChange={(e) => setImportTokenDecimals(e.target.value)}
                                    className={`w-full px-3 py-2 rounded-lg border text-xs outline-none focus:border-blue-500 ${isLightMode ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`}
                                  />
                                </div>
                             </div>
                             <div className="space-y-1">
                                <label className="text-[8px] text-neutral-500 uppercase font-bold">Contract Address</label>
                                <input 
                                  placeholder="0x..."
                                  value={importTokenAddress}
                                  onChange={(e) => setImportTokenAddress(e.target.value)}
                                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none focus:border-blue-500 ${isLightMode ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`}
                                />
                             </div>
                             <button 
                                onClick={() => {
                                  if (importTokenSymbol && importTokenAddress.startsWith('0x')) {
                                    setTokenOverrides(prev => ({
                                      ...prev,
                                      [importTokenSymbol]: { address: importTokenAddress, decimals: parseInt(importTokenDecimals) || 18 }
                                    }));
                                    setImportTokenSymbol('');
                                    setImportTokenAddress('');
                                    setShowTokenImporter(false);
                                    if (wallet) refreshAllBalances(wallet.address);
                                  }
                                }}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-lg shadow-blue-600/20"
                             >
                                Save Override
                             </button>
                             {tokenOverrides[importTokenSymbol] && (
                                <button 
                                  onClick={() => {
                                    const next = { ...tokenOverrides };
                                    delete next[importTokenSymbol];
                                    setTokenOverrides(next);
                                  }}
                                  className="w-full text-red-500 text-[8px] uppercase font-bold hover:underline"
                                >
                                  Reset to Defaults
                                </button>
                             )}
                          </div>
                       </div>
                    )}
                  </div>
                )}

                {homeSubTab === 'nfts' && (
                  <div className="space-y-6">
                    {nfts.length === 0 ? (
                      <div className="text-center py-6 opacity-40">
                        <ImageIcon size={32} className="mx-auto mb-3" />
                        <p className="text-[10px] uppercase font-bold tracking-widest">No NFTs Collection</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {nfts.map((nft) => (
                          <div 
                            key={nft.id}
                            className={`rounded-xl border overflow-hidden group cursor-pointer ${isLightMode ? 'bg-neutral-50 border-neutral-100' : 'bg-neutral-900 border-neutral-800'}`}
                            onClick={() => {
                              if (confirm(`Use ${nft.name} as your profile avatar?`)) {
                                setSelectedNftAvatar(nft.image);
                                setAvatarMode('nft');
                              }
                            }}
                          >
                            <div className="aspect-square bg-neutral-800 relative">
                              <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />
                              {avatarMode === 'nft' && selectedNftAvatar === nft.image && (
                                <div className="absolute top-2 right-2 bg-blue-600 rounded-full p-1 border border-white">
                                  <Check size={12} className="text-white" />
                                </div>
                              )}
                            </div>
                            <div className="p-2">
                              <p className={`text-[10px] font-bold truncate ${isLightMode ? 'text-black' : 'text-white'}`}>{nft.name}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className={`p-4 rounded-xl border ${isLightMode ? 'bg-blue-50/50 border-blue-100' : 'bg-blue-500/5 border-blue-500/20'}`}>
                      <p className="text-[10px] text-blue-500 uppercase font-bold tracking-widest mb-3">Import NFT</p>
                      
                      {error && homeSubTab === 'nfts' && (
                        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                          <AlertCircle size={12} className="text-red-500" />
                          <p className="text-[10px] text-red-400 font-bold">{error}</p>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input 
                          placeholder="Contract Address (0x...)"
                          value={nftImportAddress}
                          onChange={(e) => setNftImportAddress(e.target.value)}
                          className={`flex-[2] px-3 py-2 rounded-lg border text-xs outline-none focus:border-blue-500 min-w-0 ${isLightMode ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`}
                        />
                        <input 
                          placeholder="Token ID"
                          value={nftImportId}
                          onChange={(e) => setNftImportId(e.target.value)}
                          className={`flex-1 px-3 py-2 rounded-lg border text-xs outline-none focus:border-blue-500 min-w-0 ${isLightMode ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`}
                        />
                        <button 
                          onClick={handleImportNft}
                          disabled={loading}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold p-2.5 rounded-lg text-xs transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
                        >
                          {loading ? <RefreshCw className="animate-spin" size={14} /> : <Plus size={14} />}
                          <span className="sm:hidden">Import NFT</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {homeSubTab === 'activity' && (
                  <div className="space-y-4">
                    {activity.length === 0 ? (
                      <div className="text-center py-12 opacity-40">
                        <History size={32} className="mx-auto mb-3" />
                        <p className="text-[10px] uppercase font-bold tracking-widest">No Transactions Found</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activity.map((item) => (
                          <a 
                            key={item.id}
                            href={`${ARC_TESTNET_PARAMS.explorer}/tx/${item.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isLightMode ? 'bg-neutral-50 border-neutral-100 hover:bg-neutral-100' : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800'}`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.type === 'send' ? 'bg-red-500/10 text-red-500' : item.type === 'swap' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'}`}>
                                {item.type === 'send' ? <ArrowUpRight size={20} /> : item.type === 'swap' ? <ArrowLeftRight size={20} /> : <ArrowDownLeft size={20} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold truncate ${isLightMode ? 'text-black' : 'text-white'}`}>
                                  {item.type === 'send' ? `Sent ${item.amount} ${item.symbol}` : item.type === 'swap' ? `Swapped ${item.fromSymbol} to ${item.toSymbol}` : 'Received Funds'}
                                </p>
                                <p className="text-[9px] text-neutral-500 uppercase tracking-tighter">
                                  {new Date(item.timestamp).toLocaleDateString()} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`text-[10px] font-mono font-bold ${item.type === 'send' ? 'text-red-500' : 'text-green-500'}`}>
                                {item.type === 'send' ? '-' : '+'}{item.type === 'swap' ? item.toAmount : item.amount}
                              </p>
                              <div className="flex items-center justify-end gap-1">
                                <span className={`w-1 h-1 rounded-full ${item.status === 'confirmed' ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                                <span className="text-[8px] text-neutral-500 uppercase">{item.status}</span>
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={`border-t pt-6 transition-colors ${isLightMode ? 'border-neutral-100' : 'border-neutral-900'}`}>
                <div className="flex justify-between items-center mb-3 text-neutral-500">
                   <div className="flex items-center gap-2">
                     <span className="text-[10px] uppercase font-bold tracking-widest">Network Status</span>
                   </div>
                   <span className="text-[10px] text-green-500 font-bold uppercase">Online</span>
                </div>
                <div className={`p-4 rounded-xl border transition-all ${isLightMode ? 'bg-neutral-50 border-neutral-100' : 'bg-neutral-900/50 border-neutral-800'}`}>
                   <p className="text-[10px] font-mono text-neutral-500 mb-1">Current RPC</p>
                   <p className="text-[10px] font-mono truncate">{ARC_TESTNET_PARAMS.rpcUrl}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Swap Tab */}
          {step === 'active' && activeTab === 'swap' && (
            <Card key="swap" title="Swap Assets" subtitle="Instant liquidity pool swaps on ARC Network." isLightMode={isLightMode}>
              <div className="space-y-4 relative">
                <div className={`p-4 rounded-2xl border ${isLightMode ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`}>
                   <div className="flex justify-between items-center mb-2">
                     <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">From</span>
                     <span className="text-[10px] text-neutral-500">Balance: {swapFromToken.symbol === 'USDC' ? balance : (tokenBalances[swapFromToken.symbol] || '0.00')}</span>
                   </div>
                   <div className="flex items-center gap-3">
                     <input 
                       type="number"
                       placeholder="0.00"
                       value={swapFromAmount}
                       onChange={(e) => {
                         setSwapFromAmount(e.target.value);
                         setSwapToAmount(e.target.value ? (parseFloat(e.target.value) * exchangeRate).toFixed(4) : '');
                       }}
                       className="bg-transparent text-xl font-mono outline-none flex-1"
                     />
                     <button 
                      onClick={() => setShowTokenSelector('from')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${isLightMode ? 'bg-white border-neutral-200 hover:bg-neutral-50' : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700'}`}
                     >
                       <TokenIcon symbol={swapFromToken.symbol} size="sm" />
                       <span className="text-xs font-bold">{swapFromToken.symbol}</span>
                       <ChevronRight size={14} className="rotate-90 text-neutral-500" />
                     </button>
                   </div>
                </div>

                <div className="flex justify-center -my-4 relative z-10">
                  <button 
                    onClick={() => {
                      const temp = swapFromToken;
                      setSwapFromToken(swapToToken);
                      setSwapToToken(temp);
                    }}
                    className={`p-2 rounded-xl border shadow-lg transition-all hover:scale-110 ${isLightMode ? 'bg-white border-neutral-200 text-neutral-400' : 'bg-neutral-900 border-neutral-800 text-neutral-500'}`}
                  >
                    <ArrowLeftRight size={16} className="rotate-90" />
                  </button>
                </div>

                <div className={`p-4 rounded-2xl border ${isLightMode ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`}>
                   <div className="flex justify-between items-center mb-2">
                     <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">To</span>
                     <span className="text-[10px] text-neutral-500">Estimated</span>
                   </div>
                   <div className="flex items-center gap-3">
                     <input 
                       type="number"
                       placeholder="0.00"
                       value={swapToAmount}
                       readOnly
                       className="bg-transparent text-xl font-mono outline-none flex-1 opacity-50"
                     />
                     <button 
                      onClick={() => setShowTokenSelector('to')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${isLightMode ? 'bg-white border-neutral-200 hover:bg-neutral-50' : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700'}`}
                     >
                       <TokenIcon symbol={swapToToken.symbol} size="sm" />
                       <span className="text-xs font-bold">{swapToToken.symbol}</span>
                       <ChevronRight size={14} className="rotate-90 text-neutral-500" />
                     </button>
                   </div>
                </div>

                <div className={`p-4 rounded-xl border space-y-2 ${isLightMode ? 'bg-neutral-50 border-neutral-100' : 'bg-neutral-900/50 border-neutral-800'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-neutral-500">Rate</span>
                    <span className="text-[10px] text-neutral-400 font-mono">1 {swapFromToken.symbol} ≈ {exchangeRate.toFixed(4)} {swapToToken.symbol}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-neutral-500">Min. Received</span>
                    <span className="text-[10px] text-neutral-400 font-mono">{(parseFloat(swapToAmount || '0') * 0.99).toFixed(4)} {swapToToken.symbol}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-neutral-500">Network Fee</span>
                    <span className="text-[10px] text-neutral-400 font-mono">{estimatedFee} USDC</span>
                  </div>
                </div>

                {swapStatus === 'success' && (
                  <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-green-500">
                      <CheckCircle2 size={16} />
                      <p className="text-xs font-bold">Swap Successful!</p>
                    </div>
                    {txHash && (
                      <a 
                        href={`${ARC_TESTNET_PARAMS.explorer}/tx/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
                      >
                        View on Explorer <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                )}

                {swapStatus === 'error' && (
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
                    <div className="flex items-center gap-2 text-red-500 mb-1">
                      <AlertCircle size={16} />
                      <p className="text-xs font-bold">Swap Failed</p>
                    </div>
                    <p className="text-[10px] text-red-400 leading-relaxed font-mono break-words">{txError}</p>
                  </div>
                )}

                <button 
                  onClick={() => handleSwap()}
                  disabled={swapStatus === 'loading' || !swapFromAmount}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all mt-4 ${swapStatus === 'loading' ? 'bg-neutral-500/20 text-neutral-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'}`}
                >
                  {swapStatus === 'loading' ? <RefreshCw className="animate-spin" size={18} /> : <ArrowLeftRight size={18} />}
                  {swapStatus === 'loading' 
                    ? (networkStatus === 'switching' ? 'Network busy. Trying backup node...' : 'Confirming & Updating Balances...') 
                    : 'Confirm Swap'}
                </button>

                {/* Token Selector Modal Overlay */}
                {showTokenSelector && (
                  <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm rounded-2xl flex flex-col p-6 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-white">Select Token</h3>
                      <button onClick={() => setShowTokenSelector(null)} className="text-neutral-500 hover:text-white">
                        <Plus size={20} className="rotate-45" />
                      </button>
                    </div>
                    <div className="space-y-2 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                      {SUPPORTED_TOKENS.map(token => {
                        const tokenBalance = token.symbol === 'USDC' ? balance : (tokenBalances[token.symbol] || '0.00');
                        return (
                          <button 
                            key={token.address}
                            onClick={() => {
                              if (showTokenSelector === 'from') setSwapFromToken(token);
                              else setSwapToToken(token);
                              setShowTokenSelector(null);
                            }}
                            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${isLightMode ? 'bg-white border hover:bg-neutral-50' : 'bg-neutral-800 hover:bg-neutral-700'} ${ (showTokenSelector === 'from' ? swapFromToken : swapToToken).symbol === token.symbol ? 'border-blue-600/50 ring-1 ring-blue-600/50' : 'border-transparent'}`}
                          >
                            <div className="flex items-center gap-3">
                              <TokenIcon symbol={token.symbol} size="sm" />
                              <div className="text-left">
                                <p className="text-xs font-bold text-white">{token.symbol}</p>
                                <p className="text-[10px] text-neutral-500">{token.name}</p>
                              </div>
                            </div>
                            <div className="text-right flex items-center gap-3">
                              <span className="text-[10px] font-mono text-neutral-400">{tokenBalance}</span>
                              {(showTokenSelector === 'from' ? swapFromToken : swapToToken).symbol === token.symbol && <Check size={14} className="text-blue-500" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Receive Tab */}
          {step === 'active' && activeTab === 'receive' && (
            <Card key="receive" title="Receive USDC" subtitle="Share your address to receive Arc Testnet USDC." isLightMode={isLightMode}>
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-2xl shadow-xl mb-8 border border-neutral-100">
                  <QRCode 
                    value={wallet.address} 
                    size={160}
                    fgColor="#000000"
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  />
                </div>
                
                <div className={`w-full p-4 rounded-xl border mb-6 ${isLightMode ? 'bg-neutral-50 border-neutral-100' : 'bg-neutral-900 border-neutral-800'}`}>
                   <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mb-2">My Address</p>
                   <p className="font-mono text-xs break-all leading-relaxed text-neutral-400 mb-3">{wallet.address}</p>
                   <button 
                    onClick={() => copyToClipboard(wallet.address)}
                    className={`w-full text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${copiedText && copiedText === wallet.address ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-500'}`}
                   >
                     {copiedText && copiedText === wallet.address ? <Check size={14} /> : <Copy size={14} />}
                     {copiedText && copiedText === wallet.address ? 'Address Copied' : 'Copy Address'}
                   </button>
                </div>
                
                <p className="text-[10px] text-center text-neutral-500 uppercase tracking-[0.1em]">Only send USDC (Arc Testnet) to this address.</p>
              </div>
            </Card>
          )}

          {/* Send Tab */}
          {step === 'active' && activeTab === 'send' && (
            <Card key="send" title="Send Assets" subtitle="Instant USDC transfers on the Arc Network." isLightMode={isLightMode}>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest mb-2 block">Recipient Address</label>
                  <div className={`flex items-center px-4 py-3 rounded-xl border transition-all ${isLightMode ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`}>
                    <input 
                      type="text" 
                      placeholder="0x..." 
                      className="bg-transparent w-full outline-none text-sm font-mono"
                      value={sendAddress}
                      onChange={(e) => setSendAddress(e.target.value)}
                    />
                    <User size={16} className="text-neutral-500" />
                  </div>
                </div>

                <div>
                   <div className="flex justify-between items-center mb-2">
                     <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest block">Amount</label>
                     <span className="text-[10px] text-neutral-500">Balance: {balance} USDC</span>
                   </div>
                  <div className={`flex items-center px-4 py-3 rounded-xl border transition-all ${isLightMode ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900 border-neutral-800'}`}>
                    <input 
                      type="number" 
                      placeholder="0.00" 
                      className="bg-transparent w-full outline-none text-sm font-mono"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                       <TokenIcon symbol="USDC" size="sm" />
                       <span className="text-xs font-bold text-neutral-500">USDC</span>
                    </div>
                  </div>
                </div>

                {txStatus === 'error' && (
                  <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex gap-3 text-red-500">
                    <AlertCircle size={16} className="shrink-0" />
                    <p className="text-xs">{txError}</p>
                  </div>
                )}

                {txStatus === 'success' && (
                  <div className="bg-green-500/10 border border-green-500/20 p-3 rounded-xl flex flex-col gap-2 text-green-500">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} />
                      <p className="text-xs font-bold">Transaction Sent!</p>
                    </div>
                    <a 
                      href={`${ARC_TESTNET_PARAMS.explorer}/tx/${txHash}`} 
                      target="_blank" 
                      className="text-[10px] underline hover:opacity-80 transition-opacity"
                    >
                      View on Explorer
                    </a>
                  </div>
                )}

                <button 
                  onClick={handleSendTransaction}
                  disabled={txStatus === 'loading' || !sendAddress || !sendAmount}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${txStatus === 'loading' ? 'bg-neutral-500/20 text-neutral-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'}`}
                >
                  {txStatus === 'loading' ? <RefreshCw className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                  {txStatus === 'loading' ? 'Confirming...' : 'Review & Send'}
                </button>
              </div>
            </Card>
          )}

        </AnimatePresence>

        {/* Footer Info */}
        <div className="mt-12 text-center">
          <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-[0.2em]">Non-Custodial · Secure · Sovereign</p>
        </div>
      </div>
    </div>
  );
};

export default ArclyWallet;
