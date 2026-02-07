'use client';

import { http, createConfig } from 'wagmi';
import { hardhat, sepolia } from 'wagmi/chains';
import { injected, metaMask } from 'wagmi/connectors';

// Get chain ID from env
const targetChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '31337');

// Configure chains
export const chains = [hardhat, sepolia] as const;

// Get the target chain object
export const targetChain = chains.find(c => c.id === targetChainId) || hardhat;

// Create wagmi config
export const config = createConfig({
    chains,
    connectors: [
        injected(),
        metaMask(),
    ],
    transports: {
        [hardhat.id]: http('http://127.0.0.1:8545'),
        [sepolia.id]: http(),
    },
});

// API URL
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Export chain helpers
export function isCorrectChain(chainId: number | undefined): boolean {
    return chainId === targetChainId;
}

export function getTargetChainName(): string {
    return targetChain.name;
}

export function getTargetChainId(): number {
    return targetChainId;
}

// Block explorer URL helper
export function getExplorerUrl(txHash: string): string {
    if (targetChainId === 11155111) {
        return `https://sepolia.etherscan.io/tx/${txHash}`;
    }
    // Local hardhat - no explorer
    return '';
}
