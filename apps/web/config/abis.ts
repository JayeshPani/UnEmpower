/**
 * Contract ABIs - subset of functions used in frontend
 * Avoids Next.js import issues with full artifacts
 */

export const WorkerRegistryABI = [
    {
        type: 'function',
        name: 'registerWorker',
        inputs: [{ name: '_name', type: 'string' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'workers',
        inputs: [{ name: '', type: 'address' }],
        outputs: [
            { name: 'wallet', type: 'address' },
            { name: 'name', type: 'string' },
            { name: 'registeredAt', type: 'uint256' },
            { name: 'isActive', type: 'bool' },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'isActiveWorker',
        inputs: [{ name: '_worker', type: 'address' }],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'WorkerRegistered',
        inputs: [
            { name: 'worker', type: 'address', indexed: true },
            { name: 'name', type: 'string', indexed: false },
            { name: 'timestamp', type: 'uint256', indexed: false },
        ],
    },
] as const;

export const WorkProofABI = [
    {
        type: 'function',
        name: 'submitProof',
        inputs: [
            { name: '_worker', type: 'address' },
            { name: '_proofHash', type: 'bytes32' },
            { name: '_workUnits', type: 'uint256' },
            { name: '_earnedAmount', type: 'uint256' },
            { name: '_proofURI', type: 'string' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'getWorkerProofIds',
        inputs: [{ name: '_worker', type: 'address' }],
        outputs: [{ name: '', type: 'uint256[]' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getProof',
        inputs: [{ name: '_proofId', type: 'uint256' }],
        outputs: [
            {
                name: '',
                type: 'tuple',
                components: [
                    { name: 'worker', type: 'address' },
                    { name: 'proofHash', type: 'bytes32' },
                    { name: 'workUnits', type: 'uint256' },
                    { name: 'earnedAmount', type: 'uint256' },
                    { name: 'timestamp', type: 'uint256' },
                    { name: 'proofURI', type: 'string' },
                ],
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getWorkerStats',
        inputs: [{ name: '_worker', type: 'address' }],
        outputs: [
            { name: 'totalProofs', type: 'uint256' },
            { name: 'totalWorkUnits', type: 'uint256' },
            { name: 'totalEarned', type: 'uint256' },
        ],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'WorkProofSubmitted',
        inputs: [
            { name: 'proofId', type: 'uint256', indexed: true },
            { name: 'worker', type: 'address', indexed: true },
            { name: 'proofHash', type: 'bytes32', indexed: false },
            { name: 'workUnits', type: 'uint256', indexed: false },
            { name: 'earnedAmount', type: 'uint256', indexed: false },
            { name: 'timestamp', type: 'uint256', indexed: false },
        ],
    },
] as const;

export const CreditAttestationVerifierABI = [
    {
        type: 'function',
        name: 'verifyAttestation',
        inputs: [
            {
                name: 'attestation',
                type: 'tuple',
                components: [
                    { name: 'worker', type: 'address' },
                    { name: 'trustScore', type: 'uint32' },
                    { name: 'pd', type: 'uint32' },
                    { name: 'creditLimit', type: 'uint256' },
                    { name: 'aprBps', type: 'uint16' },
                    { name: 'tenureDays', type: 'uint16' },
                    { name: 'fraudFlags', type: 'uint32' },
                    { name: 'issuedAt', type: 'uint64' },
                    { name: 'expiresAt', type: 'uint64' },
                    { name: 'nonce', type: 'uint64' },
                ],
            },
            { name: 'signature', type: 'bytes' },
        ],
        outputs: [{ name: 'signer', type: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'approvedSigners',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'isNonceUsed',
        inputs: [{ name: '_nonce', type: 'uint64' }],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
    },
] as const;

export const LoanVaultABI = [
    {
        type: 'function',
        name: 'requestLoan',
        inputs: [
            { name: '_amount', type: 'uint256' },
            {
                name: 'attestation',
                type: 'tuple',
                components: [
                    { name: 'worker', type: 'address' },
                    { name: 'trustScore', type: 'uint32' },
                    { name: 'pd', type: 'uint32' },
                    { name: 'creditLimit', type: 'uint256' },
                    { name: 'aprBps', type: 'uint16' },
                    { name: 'tenureDays', type: 'uint16' },
                    { name: 'fraudFlags', type: 'uint32' },
                    { name: 'issuedAt', type: 'uint64' },
                    { name: 'expiresAt', type: 'uint64' },
                    { name: 'nonce', type: 'uint64' },
                ],
            },
            { name: 'signature', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'repay',
        inputs: [{ name: '_amount', type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'getLoan',
        inputs: [{ name: '_borrower', type: 'address' }],
        outputs: [
            {
                name: '',
                type: 'tuple',
                components: [
                    { name: 'borrower', type: 'address' },
                    { name: 'principal', type: 'uint256' },
                    { name: 'interestAmount', type: 'uint256' },
                    { name: 'totalDue', type: 'uint256' },
                    { name: 'amountRepaid', type: 'uint256' },
                    { name: 'startTime', type: 'uint64' },
                    { name: 'dueDate', type: 'uint64' },
                    { name: 'aprBps', type: 'uint16' },
                    { name: 'isActive', type: 'bool' },
                    { name: 'isDefaulted', type: 'bool' },
                ],
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'hasActiveLoan',
        inputs: [{ name: '_borrower', type: 'address' }],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'getAvailableLiquidity',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'LoanApproved',
        inputs: [
            { name: 'borrower', type: 'address', indexed: true },
            { name: 'principal', type: 'uint256', indexed: false },
            { name: 'interestAmount', type: 'uint256', indexed: false },
            { name: 'dueDate', type: 'uint64', indexed: false },
            { name: 'nonce', type: 'uint64', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'Repaid',
        inputs: [
            { name: 'borrower', type: 'address', indexed: true },
            { name: 'amount', type: 'uint256', indexed: false },
            { name: 'remaining', type: 'uint256', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'LoanFullyRepaid',
        inputs: [
            { name: 'borrower', type: 'address', indexed: true },
            { name: 'totalPaid', type: 'uint256', indexed: false },
        ],
    },
] as const;

export const MockUSDCABI = [
    {
        type: 'function',
        name: 'balanceOf',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'approve',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'allowance',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'faucet',
        inputs: [{ name: '_amount', type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'decimals',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'symbol',
        inputs: [],
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'Approval',
        inputs: [
            { name: 'owner', type: 'address', indexed: true },
            { name: 'spender', type: 'address', indexed: true },
            { name: 'value', type: 'uint256', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'Transfer',
        inputs: [
            { name: 'from', type: 'address', indexed: true },
            { name: 'to', type: 'address', indexed: true },
            { name: 'value', type: 'uint256', indexed: false },
        ],
    },
] as const;
