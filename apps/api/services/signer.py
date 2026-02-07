"""
EIP-712 Signing Service

Signs CreditAttestation structs with exact match to Solidity verifier.
"""

from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_typing import HexStr
from typing import Dict, Any
import time

from settings import get_settings


# EIP-712 Type definitions - MUST match Solidity exactly
EIP712_TYPES = {
    "EIP712Domain": [
        {"name": "name", "type": "string"},
        {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ],
    "CreditAttestation": [
        {"name": "worker", "type": "address"},
        {"name": "trustScore", "type": "uint32"},
        {"name": "pd", "type": "uint32"},
        {"name": "creditLimit", "type": "uint256"},
        {"name": "aprBps", "type": "uint16"},
        {"name": "tenureDays", "type": "uint16"},
        {"name": "fraudFlags", "type": "uint32"},
        {"name": "issuedAt", "type": "uint64"},
        {"name": "expiresAt", "type": "uint64"},
        {"name": "nonce", "type": "uint64"},
    ],
}


def get_eip712_domain() -> Dict[str, Any]:
    """Get EIP-712 domain matching Solidity verifier."""
    settings = get_settings()
    return {
        "name": "UnEmpower",
        "version": "1",
        "chainId": settings.CHAIN_ID,
        "verifyingContract": settings.ATTESTATION_VERIFIER_ADDRESS,
    }


def build_typed_data(attestation: Dict[str, Any]) -> Dict[str, Any]:
    """Build full EIP-712 typed data structure."""
    return {
        "types": EIP712_TYPES,
        "primaryType": "CreditAttestation",
        "domain": get_eip712_domain(),
        "message": attestation,
    }


def sign_attestation(attestation: Dict[str, Any]) -> tuple[str, str]:
    """
    Sign a CreditAttestation using EIP-712.
    
    Args:
        attestation: Dict with all attestation fields
        
    Returns:
        Tuple of (signature_hex, signer_address)
    """
    settings = get_settings()
    
    # Build typed data
    typed_data = build_typed_data(attestation)
    
    # Encode and sign
    signable = encode_typed_data(full_message=typed_data)
    
    # Sign with private key
    account = Account.from_key(settings.AI_SIGNER_PRIVATE_KEY)
    signed = account.sign_message(signable)
    
    return signed.signature.hex(), account.address


def get_eip712_hashes(attestation: Dict[str, Any]) -> Dict[str, str]:
    """
    Get EIP-712 hashes for debugging.
    
    Returns struct hash and message digest for comparison with on-chain.
    """
    from eth_account._utils.structured_data.hashing import hash_message, hash_domain, hash_struct
    
    typed_data = build_typed_data(attestation)
    
    # Get domain separator
    domain_hash = hash_domain(typed_data)
    
    # Get struct hash
    struct_hash = hash_struct(typed_data, "CreditAttestation", typed_data["message"])
    
    # Get full message hash (what gets signed)
    message_hash = hash_message(typed_data)
    
    return {
        "domain_hash": domain_hash.hex(),
        "struct_hash": struct_hash.hex(),
        "message_digest": message_hash.hex(),
    }


def create_attestation(
    worker: str,
    trust_score: int,
    pd: int,
    credit_limit: int,
    apr_bps: int,
    tenure_days: int,
    fraud_flags: int = 0,
    expires_in_seconds: int = 900,  # 15 minutes default
) -> Dict[str, Any]:
    """
    Create a new attestation dict with timestamps.
    
    All values stored as Python ints (will serialize to JSON safely).
    """
    now = int(time.time())
    nonce = now * 1000 + (hash(worker) % 1000)  # Simple unique nonce
    
    return {
        "worker": worker,
        "trustScore": trust_score,
        "pd": pd,
        "creditLimit": credit_limit,
        "aprBps": apr_bps,
        "tenureDays": tenure_days,
        "fraudFlags": fraud_flags,
        "issuedAt": now,
        "expiresAt": now + expires_in_seconds,
        "nonce": nonce,
    }


def format_attestation_for_response(attestation: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format attestation for JSON response.
    
    Converts large integers to strings to avoid JSON precision issues.
    """
    return {
        "worker": attestation["worker"],
        "trustScore": attestation["trustScore"],
        "pd": attestation["pd"],
        "creditLimit": str(attestation["creditLimit"]),  # String for large numbers
        "aprBps": attestation["aprBps"],
        "tenureDays": attestation["tenureDays"],
        "fraudFlags": attestation["fraudFlags"],
        "issuedAt": attestation["issuedAt"],
        "expiresAt": attestation["expiresAt"],
        "nonce": attestation["nonce"],
    }
