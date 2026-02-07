/**
 * EIP-712 typed data configuration for credit attestations
 */

export const EIP712_DOMAIN = {
    name: "UnEmpower",
    version: "1",
    // chainId and verifyingContract are set at runtime
};

export const ATTESTATION_TYPES = {
    CreditAttestation: [
        { name: "worker", type: "address" },
        { name: "trustScore", type: "uint32" },
        { name: "pd", type: "uint32" },
        { name: "creditLimit", type: "uint256" },
        { name: "aprBps", type: "uint16" },
        { name: "tenureDays", type: "uint16" },
        { name: "fraudFlags", type: "uint32" },
        { name: "issuedAt", type: "uint64" },
        { name: "expiresAt", type: "uint64" },
        { name: "nonce", type: "uint64" },
    ],
} as const;

/**
 * Build the full EIP-712 domain with chain-specific values
 */
export function buildDomain(chainId: number, verifyingContract: string) {
    return {
        ...EIP712_DOMAIN,
        chainId,
        verifyingContract,
    };
}

/**
 * Build the typed data structure for signing
 */
export function buildTypedData(
    chainId: number,
    verifyingContract: string,
    attestation: {
        worker: string;
        trustScore: number;
        pd: number;
        creditLimit: string | bigint;
        aprBps: number;
        tenureDays: number;
        fraudFlags: number;
        issuedAt: number;
        expiresAt: number;
        nonce: number;
    }
) {
    return {
        domain: buildDomain(chainId, verifyingContract),
        types: ATTESTATION_TYPES,
        primaryType: "CreditAttestation" as const,
        message: {
            worker: attestation.worker,
            trustScore: attestation.trustScore,
            pd: attestation.pd,
            creditLimit: BigInt(attestation.creditLimit),
            aprBps: attestation.aprBps,
            tenureDays: attestation.tenureDays,
            fraudFlags: attestation.fraudFlags,
            issuedAt: attestation.issuedAt,
            expiresAt: attestation.expiresAt,
            nonce: attestation.nonce,
        },
    };
}
