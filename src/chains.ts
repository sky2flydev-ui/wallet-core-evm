import type { Chain } from 'viem';
import { arbitrum, base, mainnet, polygon, sepolia } from 'viem/chains';

export interface EvmNetwork {
  readonly id: string;
  readonly chainId: number;
  readonly name: string;
  readonly nativeSymbol: string;
  readonly viemChain: Chain;
  readonly rpcUrl?: string;
}

export const NETWORKS = {
  ethereum: {
    id: 'ethereum',
    chainId: 1,
    name: 'Ethereum Mainnet',
    nativeSymbol: 'ETH',
    viemChain: mainnet,
  },
  sepolia: {
    id: 'sepolia',
    chainId: 11155111,
    name: 'Sepolia',
    nativeSymbol: 'ETH',
    viemChain: sepolia,
  },
  polygon: {
    id: 'polygon',
    chainId: 137,
    name: 'Polygon',
    nativeSymbol: 'POL',
    viemChain: polygon,
  },
  arbitrum: {
    id: 'arbitrum',
    chainId: 42161,
    name: 'Arbitrum One',
    nativeSymbol: 'ETH',
    viemChain: arbitrum,
  },
  base: { id: 'base', chainId: 8453, name: 'Base', nativeSymbol: 'ETH', viemChain: base },
} as const satisfies Record<string, EvmNetwork>;

export type NetworkId = keyof typeof NETWORKS;
export function network(id: NetworkId): EvmNetwork {
  return NETWORKS[id];
}
