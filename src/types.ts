
export interface ARCAsset {
  symbol: string;
  name: string;
  balance: string;
  icon: string;
  contractAddress?: string;
}

export interface ARCNFT {
  id: string;
  name: string;
  image: string;
  contractAddress: string;
  tokenId: string;
}

export type WalletStep = 'landing' | 'create' | 'import' | 'active';
export type WalletTab = 'home' | 'send' | 'receive' | 'settings' | 'swap';
export type TransactionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface WalletMetadata {
  address: string;
  encryptedPrivateKey: string;
  nickname: string;
  index?: number;
  isHD?: boolean;
}
