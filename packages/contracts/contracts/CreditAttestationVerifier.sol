// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title CreditAttestationVerifier
 * @notice Verifies EIP-712 signed credit attestations from approved AI signers
 */
contract CreditAttestationVerifier is Ownable, EIP712 {
    using ECDSA for bytes32;

    // Struct matching the EIP-712 typed data
    struct CreditAttestation {
        address worker;
        uint32 trustScore;       // 0-10000 (scaled)
        uint32 pd;               // Probability of default, 0-1e6 (scaled)
        uint256 creditLimit;     // In token decimals
        uint16 aprBps;           // APR in basis points (100 = 1%)
        uint16 tenureDays;       // Loan tenure in days
        uint32 fraudFlags;       // Bitmask of fraud indicators
        uint64 issuedAt;         // Unix timestamp
        uint64 expiresAt;        // Unix timestamp
        uint64 nonce;            // Unique nonce
    }

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "CreditAttestation(address worker,uint32 trustScore,uint32 pd,uint256 creditLimit,uint16 aprBps,uint16 tenureDays,uint32 fraudFlags,uint64 issuedAt,uint64 expiresAt,uint64 nonce)"
    );

    // Approved signers (AI service wallets)
    mapping(address => bool) public approvedSigners;

    // Used nonces to prevent replay attacks
    mapping(uint64 => bool) public usedNonces;

    event SignerApproved(address indexed signer);
    event SignerRevoked(address indexed signer);
    event AttestationVerified(address indexed worker, uint64 nonce, address signer);

    constructor() Ownable(msg.sender) EIP712("UnEmpower", "1") {}

    /**
     * @notice Approve a new signer
     */
    function approveSigner(address _signer) external onlyOwner {
        require(!approvedSigners[_signer], "Already approved");
        approvedSigners[_signer] = true;
        emit SignerApproved(_signer);
    }

    /**
     * @notice Revoke a signer
     */
    function revokeSigner(address _signer) external onlyOwner {
        require(approvedSigners[_signer], "Not approved");
        approvedSigners[_signer] = false;
        emit SignerRevoked(_signer);
    }

    /**
     * @notice Get the EIP-712 domain separator
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Compute the struct hash for an attestation
     */
    function hashAttestation(CreditAttestation calldata attestation) public pure returns (bytes32) {
        return keccak256(abi.encode(
            ATTESTATION_TYPEHASH,
            attestation.worker,
            attestation.trustScore,
            attestation.pd,
            attestation.creditLimit,
            attestation.aprBps,
            attestation.tenureDays,
            attestation.fraudFlags,
            attestation.issuedAt,
            attestation.expiresAt,
            attestation.nonce
        ));
    }

    /**
     * @notice Verify an attestation signature
     * @return signer The address that signed the attestation
     */
    function verifyAttestation(
        CreditAttestation calldata attestation,
        bytes calldata signature
    ) public view returns (address signer) {
        bytes32 structHash = hashAttestation(attestation);
        bytes32 digest = _hashTypedDataV4(structHash);
        signer = ECDSA.recover(digest, signature);
        
        require(approvedSigners[signer], "Invalid signer");
        require(!usedNonces[attestation.nonce], "Nonce already used");
        require(block.timestamp <= attestation.expiresAt, "Attestation expired");
        require(block.timestamp >= attestation.issuedAt, "Attestation not yet valid");
    }

    /**
     * @notice Verify and consume an attestation (marks nonce as used)
     * @dev Called by LoanVault when processing a loan request
     */
    function verifyAndConsumeAttestation(
        CreditAttestation calldata attestation,
        bytes calldata signature
    ) external returns (address signer) {
        signer = verifyAttestation(attestation, signature);
        usedNonces[attestation.nonce] = true;
        emit AttestationVerified(attestation.worker, attestation.nonce, signer);
    }

    /**
     * @notice Check if a nonce has been used
     */
    function isNonceUsed(uint64 _nonce) external view returns (bool) {
        return usedNonces[_nonce];
    }
}
