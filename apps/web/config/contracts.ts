'use client';

/**
 * Contract addresses loaded from environment variables
 */

export const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '31337');

export const CONTRACTS = {
    WorkerRegistry: process.env.NEXT_PUBLIC_CONTRACT_WORKER_REGISTRY || '',
    WorkProof: process.env.NEXT_PUBLIC_CONTRACT_WORKPROOF || '',
    CreditAttestationVerifier: process.env.NEXT_PUBLIC_CONTRACT_ATTESTATION_VERIFIER || '',
    LoanVault: process.env.NEXT_PUBLIC_CONTRACT_LOAN_VAULT || '',
    MockUSDC: process.env.NEXT_PUBLIC_CONTRACT_MOCK_USDC || '',
} as const;

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const IS_DEMO_ADMIN = process.env.NEXT_PUBLIC_DEMO_ADMIN === 'true';

/**
 * Validate that all required environment variables are set
 */
export function assertEnv(): void {
    const missing: string[] = [];

    if (!CONTRACTS.WorkerRegistry) missing.push('NEXT_PUBLIC_CONTRACT_WORKER_REGISTRY');
    if (!CONTRACTS.WorkProof) missing.push('NEXT_PUBLIC_CONTRACT_WORKPROOF');
    if (!CONTRACTS.CreditAttestationVerifier) missing.push('NEXT_PUBLIC_CONTRACT_ATTESTATION_VERIFIER');
    if (!CONTRACTS.LoanVault) missing.push('NEXT_PUBLIC_CONTRACT_LOAN_VAULT');
    if (!CONTRACTS.MockUSDC) missing.push('NEXT_PUBLIC_CONTRACT_MOCK_USDC');

    if (missing.length > 0) {
        console.warn(`⚠️ Missing contract addresses: ${missing.join(', ')}`);
    }
}

/**
 * Get contract address with type safety
 */
export function getContractAddress(name: keyof typeof CONTRACTS): `0x${string}` {
    const address = CONTRACTS[name];
    if (!address) {
        throw new Error(`Contract address for ${name} not configured`);
    }
    return address as `0x${string}`;
}

/**
 * Check if contracts are configured
 */
export function areContractsConfigured(): boolean {
    return Object.values(CONTRACTS).every(addr => addr && addr.length > 0);
}
