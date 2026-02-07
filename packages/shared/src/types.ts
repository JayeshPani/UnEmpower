/**
 * Worker types
 */
export interface Worker {
    wallet: string;
    name: string;
    registeredAt: number;
    isActive: boolean;
}

/**
 * Work proof types
 */
export interface WorkProof {
    id: number;
    worker: string;
    proofHash: string;
    workUnits: number;
    earnedAmount: string;
    timestamp: number;
    proofURI: string;
}

export interface WorkerStats {
    totalProofs: number;
    totalWorkUnits: number;
    totalEarned: string;
}

/**
 * Credit attestation (matches EIP-712 struct)
 */
export interface CreditAttestation {
    worker: string;
    trustScore: number;        // 0-10000
    pd: number;                // Probability of default, 0-1000000
    creditLimit: string;       // BigInt as string
    aprBps: number;            // APR in basis points
    tenureDays: number;        // Loan tenure in days
    fraudFlags: number;        // Bitmask
    issuedAt: number;          // Unix timestamp
    expiresAt: number;         // Unix timestamp
    nonce: number;             // Unique nonce
}

/**
 * Signed attestation with signature
 */
export interface SignedAttestation {
    attestation: CreditAttestation;
    signature: string;
    signer: string;
}

/**
 * Loan types
 */
export interface Loan {
    borrower: string;
    principal: string;
    interestAmount: string;
    totalDue: string;
    amountRepaid: string;
    startTime: number;
    dueDate: number;
    aprBps: number;
    isActive: boolean;
    isDefaulted: boolean;
}

/**
 * API response types
 */
export interface OfferResponse {
    attestation: CreditAttestation;
    signature: string;
    signer: string;
    explanation: string;
}

export interface WorkProofSimulateRequest {
    workerAddress: string;
    workUnits: number;
    earnedAmount: string;
    proofURI?: string;
}

export interface WorkProofSimulateResponse {
    success: boolean;
    proofId: number;
    txHash: string;
}

/**
 * Event types (from blockchain)
 */
export interface WorkProofSubmittedEvent {
    proofId: number;
    worker: string;
    proofHash: string;
    workUnits: number;
    earnedAmount: string;
    timestamp: number;
    blockNumber: number;
    txHash: string;
}

export interface LoanApprovedEvent {
    borrower: string;
    principal: string;
    interestAmount: string;
    dueDate: number;
    nonce: number;
    blockNumber: number;
    txHash: string;
}

export interface RepaidEvent {
    borrower: string;
    amount: string;
    remaining: string;
    blockNumber: number;
    txHash: string;
}
