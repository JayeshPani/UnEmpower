// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WorkProof
 * @notice Stores work proofs submitted by authorized verifiers
 */
contract WorkProof is Ownable {
    struct Proof {
        address worker;
        bytes32 proofHash;      // Hash of work data
        uint256 workUnits;      // Amount of work completed
        uint256 earnedAmount;   // Amount earned in this work session
        uint256 timestamp;
        string proofURI;        // IPFS or external URI with proof details
    }

    // Authorized verifiers who can submit proofs
    mapping(address => bool) public authorizedVerifiers;
    
    // Worker => array of proof indices
    mapping(address => uint256[]) public workerProofIndices;
    
    // All proofs
    Proof[] public proofs;

    event VerifierAuthorized(address indexed verifier);
    event VerifierRevoked(address indexed verifier);
    event WorkProofSubmitted(
        uint256 indexed proofId,
        address indexed worker,
        bytes32 proofHash,
        uint256 workUnits,
        uint256 earnedAmount,
        uint256 timestamp
    );

    modifier onlyVerifier() {
        require(authorizedVerifiers[msg.sender], "Not authorized verifier");
        _;
    }

    constructor() Ownable(msg.sender) {
        // Owner is automatically an authorized verifier
        authorizedVerifiers[msg.sender] = true;
        emit VerifierAuthorized(msg.sender);
    }

    /**
     * @notice Authorize a new verifier
     */
    function authorizeVerifier(address _verifier) external onlyOwner {
        require(!authorizedVerifiers[_verifier], "Already authorized");
        authorizedVerifiers[_verifier] = true;
        emit VerifierAuthorized(_verifier);
    }

    /**
     * @notice Revoke verifier authorization
     */
    function revokeVerifier(address _verifier) external onlyOwner {
        require(authorizedVerifiers[_verifier], "Not authorized");
        authorizedVerifiers[_verifier] = false;
        emit VerifierRevoked(_verifier);
    }

    /**
     * @notice Submit a work proof for a worker
     */
    function submitProof(
        address _worker,
        bytes32 _proofHash,
        uint256 _workUnits,
        uint256 _earnedAmount,
        string calldata _proofURI
    ) external onlyVerifier returns (uint256) {
        uint256 proofId = proofs.length;

        proofs.push(Proof({
            worker: _worker,
            proofHash: _proofHash,
            workUnits: _workUnits,
            earnedAmount: _earnedAmount,
            timestamp: block.timestamp,
            proofURI: _proofURI
        }));

        workerProofIndices[_worker].push(proofId);

        emit WorkProofSubmitted(
            proofId,
            _worker,
            _proofHash,
            _workUnits,
            _earnedAmount,
            block.timestamp
        );

        return proofId;
    }

    /**
     * @notice Get all proof IDs for a worker
     */
    function getWorkerProofIds(address _worker) external view returns (uint256[] memory) {
        return workerProofIndices[_worker];
    }

    /**
     * @notice Get proof by ID
     */
    function getProof(uint256 _proofId) external view returns (Proof memory) {
        require(_proofId < proofs.length, "Invalid proof ID");
        return proofs[_proofId];
    }

    /**
     * @notice Get total proofs count
     */
    function getProofCount() external view returns (uint256) {
        return proofs.length;
    }

    /**
     * @notice Get worker's total work stats
     */
    function getWorkerStats(address _worker) external view returns (
        uint256 totalProofs,
        uint256 totalWorkUnits,
        uint256 totalEarned
    ) {
        uint256[] memory proofIds = workerProofIndices[_worker];
        totalProofs = proofIds.length;
        
        for (uint256 i = 0; i < proofIds.length; i++) {
            Proof memory p = proofs[proofIds[i]];
            totalWorkUnits += p.workUnits;
            totalEarned += p.earnedAmount;
        }
    }
}
