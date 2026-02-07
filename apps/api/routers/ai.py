"""
AI Offer Router

Generates credit offers using indexed events or on-chain fallback.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc
from web3 import Web3

from settings import get_settings
from database import get_db, WorkProofEvent
from typing import Generator
from services.scoring import generate_credit_offer
from services.signer import (
    create_attestation,
    sign_attestation,
    format_attestation_for_response,
    get_eip712_hashes,
)

router = APIRouter(prefix="/ai", tags=["ai"])


class OfferRequest(BaseModel):
    """Request for credit offer."""
    worker_address: str


class AttestationData(BaseModel):
    """Attestation data for response."""
    worker: str
    trustScore: int
    pd: int
    creditLimit: str
    aprBps: int
    tenureDays: int
    fraudFlags: int
    issuedAt: int
    expiresAt: int
    nonce: int


class OfferResponse(BaseModel):
    """Credit offer response."""
    attestation: AttestationData
    signature: str
    signer: str
    explanation: str


class HashDebugResponse(BaseModel):
    """EIP-712 hash debug response."""
    domain_hash: str
    struct_hash: str
    message_digest: str
    attestation: dict


def get_optional_db():
    """Get DB session or None if database is not available."""
    try:
        from database import get_session_local
        SessionLocal = get_session_local()
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()
    except Exception:
        yield None


@router.post("/offer", response_model=OfferResponse)
async def generate_offer(
    request: OfferRequest,
    db: Optional[Session] = Depends(get_optional_db),
):
    """
    Generate AI-powered credit offer for a worker.
    
    1. Fetches WorkProof events from DB (falls back to on-chain if empty)
    2. Extracts features and computes credit score
    3. Signs EIP-712 attestation
    4. Returns offer with explanation
    """
    settings = get_settings()
    worker = request.worker_address.lower()
    
    if not Web3.is_address(worker):
        raise HTTPException(status_code=400, detail="Invalid worker address")
    
    # Get events from DB (if available)
    events = []
    if db is not None:
        try:
            events = get_worker_events_from_db(db, worker)
        except Exception as e:
            print(f"⚠️ Database query failed: {e}")
    
    # Fallback to on-chain if no indexed events or no DB
    if not events:
        print(f"ℹ️ Using on-chain fallback for {worker}...")
        events = get_worker_events_from_chain(worker)
    
    # Generate credit offer
    offer = generate_credit_offer(events, Web3.to_checksum_address(worker))
    
    # Create attestation
    attestation = create_attestation(
        worker=Web3.to_checksum_address(worker),
        trust_score=offer["trust_score"],
        pd=offer["pd"],
        credit_limit=offer["credit_limit"],
        apr_bps=offer["apr_bps"],
        tenure_days=offer["tenure_days"],
        fraud_flags=offer["fraud_flags"],
        expires_in_seconds=900,  # 15 minutes
    )
    
    # Sign attestation
    signature, signer = sign_attestation(attestation)
    
    return OfferResponse(
        attestation=AttestationData(**format_attestation_for_response(attestation)),
        signature=f"0x{signature}" if not signature.startswith("0x") else signature,
        signer=signer,
        explanation=offer["explanation"],
    )


@router.get("/explain/{worker}")
async def explain_scoring(
    worker: str,
    db: Optional[Session] = Depends(get_optional_db),
):
    """
    Get detailed explanation of scoring factors for a worker.
    """
    worker = worker.lower()
    
    events = []
    if db is not None:
        try:
            events = get_worker_events_from_db(db, worker)
        except Exception:
            pass
    if not events:
        events = get_worker_events_from_chain(worker)
    
    offer = generate_credit_offer(events, worker)
    
    return {
        "worker": worker,
        "features": offer["features"],
        "trust_score": offer["trust_score"],
        "pd": offer["pd"],
        "credit_limit": offer["credit_limit"],
        "apr_bps": offer["apr_bps"],
        "tenure_days": offer["tenure_days"],
        "explanation": offer["explanation"],
    }


def get_worker_events_from_db(db: Session, worker: str) -> List[Dict[str, Any]]:
    """Get worker events from indexed DB."""
    proofs = db.query(WorkProofEvent).filter(
        WorkProofEvent.worker == worker
    ).order_by(desc(WorkProofEvent.event_timestamp)).limit(100).all()
    
    return [
        {
            "proof_id": p.proof_id,
            "worker": p.worker,
            "work_units": p.work_units,
            "earned_amount": p.earned_amount,
            "event_timestamp": p.event_timestamp,
            "timestamp": p.event_timestamp,
        }
        for p in proofs
    ]


def get_worker_events_from_chain(worker: str) -> List[Dict[str, Any]]:
    """Fallback: Get worker events directly from chain."""
    settings = get_settings()
    
    try:
        w3 = Web3(Web3.HTTPProvider(settings.RPC_URL))
        
        # WorkProofSubmitted event signature
        event_sig = w3.keccak(
            text="WorkProofSubmitted(uint256,address,bytes32,uint256,uint256,uint256)"
        )
        
        # Get logs (last 10000 blocks max)
        current_block = w3.eth.block_number
        from_block = max(0, current_block - 10000)
        
        logs = w3.eth.get_logs({
            "address": Web3.to_checksum_address(settings.WORKPROOF_ADDRESS),
            "fromBlock": from_block,
            "toBlock": "latest",
            "topics": [
                event_sig,
                None,  # proofId (indexed)
                "0x" + "0" * 24 + worker[2:].lower(),  # worker (indexed, padded)
            ],
        })
        
        events = []
        for log in logs:
            # Decode basic data (simplified)
            # In production, use proper ABI decoding
            data = log["data"]
            if len(data) >= 130:  # 0x + 64*2 chars minimum
                earned_amount = int(data[66:130], 16)
                timestamp = int(data[130:194], 16) if len(data) >= 194 else 0
                events.append({
                    "earned_amount": str(earned_amount),
                    "event_timestamp": timestamp,
                    "timestamp": timestamp,
                })
        
        return events
        
    except Exception as e:
        print(f"⚠️ On-chain fallback failed: {e}")
        return []


@router.get("/debug/eip712-hash", response_model=HashDebugResponse)
async def debug_eip712_hash(
    worker: str = Query(..., description="Worker address"),
    nonce: int = Query(..., description="Nonce value"),
):
    """
    Debug endpoint to verify EIP-712 hash computation.
    
    Returns struct_hash and digest for comparison with on-chain values.
    """
    settings = get_settings()
    
    # Create a test attestation
    attestation = create_attestation(
        worker=Web3.to_checksum_address(worker),
        trust_score=5000,
        pd=100000,
        credit_limit=500_000_000,  # 500 USDC
        apr_bps=1200,
        tenure_days=14,
        fraud_flags=0,
    )
    attestation["nonce"] = nonce  # Override with provided nonce
    
    # Get hashes
    hashes = get_eip712_hashes(attestation)
    
    return HashDebugResponse(
        domain_hash=hashes["domain_hash"],
        struct_hash=hashes["struct_hash"],
        message_digest=hashes["message_digest"],
        attestation=format_attestation_for_response(attestation),
    )
