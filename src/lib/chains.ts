import { defineChain } from "viem";

// CRUZ targets a single chain: Arbitrum One. Particle's Universal Accounts
// SDK only supports Arbitrum mainnet (chain id 42161) today, so there's no
// testnet, no multi-chain selector, no "selected network" concept — just one
// chain. Override the RPC via VITE_ARBITRUM_RPC (a dedicated provider such as
// Alchemy or Infura is recommended over the public endpoint).
const ARBITRUM_RPC = import.meta.env.VITE_ARBITRUM_RPC || "https://arb1.arbitrum.io/rpc";
const ARBITRUM_EXPLORER = import.meta.env.VITE_ARBITRUM_EXPLORER || "https://arbiscan.io";

export const arbitrumOne = defineChain({
  id: 42161,
  name: "Arbitrum One",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARBITRUM_RPC] } },
  blockExplorers: { default: { name: "Arbiscan", url: ARBITRUM_EXPLORER } },
  testnet: false,
});

export const SUPPORTED_CHAINS = [arbitrumOne] as const;
export const DEFAULT_CHAIN = arbitrumOne;

export const CHAIN_CONFIG = {
  [arbitrumOne.id]: {
    rpcUrl: ARBITRUM_RPC,
    explorerUrl: ARBITRUM_EXPLORER,
    name: "Arbitrum One",
  },
} as const;

export function chainConfig(chainId: number) {
  return CHAIN_CONFIG[chainId as keyof typeof CHAIN_CONFIG] ?? CHAIN_CONFIG[arbitrumOne.id];
}

// Fallback gas price (Gwei) shown before the live RPC value arrives.
export const DEFAULT_GAS_GWEI = 0.1;
