"""
AI Offer Router

Generates credit offers using indexed events or on-chain fallback.
Includes AI Feature Pack v1: forecasting, fraud detection, early warning,
workproof integrity, coach nudges, and fairness auditing.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc
from web3 import Web3

from settings import get_settings
from database import get_db, WorkProofEvent, OfferHistory
from typing import Generator
from services.scoring import generate_credit_offer
from services.signer import (
    create_attestation,
    sign_attestation,
    format_attestation_for_response,
    get_eip712_hashes,
)
# AI Feature Pack v1 imports
from services.features import get_worker_features
from services.forecasting import forecast_income
from services.fraud import compute_anomaly_score
from services.workproof_integrity import check_workproof_integrity
from services.early_warning import compute_early_warning
from services.coach import generate_coach_nudge


router = APIRouter(prefix="/ai", tags=["ai"])


# === fraudFlags Bitmask Specification ===
# bit0 (1):  HARD_BLOCK - loan must revert on-chain
# bit1 (2):  ANOMALY_SUSPECT - fraud anomaly detected
# bit2 (4):  WORKPROOF_SUSPECT - fake workproof suspected
# bit3 (8):  EARLY_WARNING_HIGH - high default risk
# bit4 (16): FAIRNESS_REVIEW - informational flag
FLAG_HARD_BLOCK = 1
FLAG_ANOMALY_SUSPECT = 2
FLAG_WORKPROOF_SUSPECT = 4
FLAG_EARLY_WARNING_HIGH = 8
FLAG_FAIRNESS_REVIEW = 16


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
    """Credit offer response with AI signals."""
    attestation: AttestationData
    signature: str
    signer: str
    explanation: str
    # AI Feature Pack v1 - additional fields (outside attestation)
    forecast: Optional[Dict] = None
    earlyWarning: Optional[Dict] = None
    fraudSignal: Optional[Dict] = None
    workproofIntegrity: Optional[Dict] = None
    coach: Optional[Dict] = None
    explanations: Optional[List[str]] = None
    fraudFlagsBitmask: Optional[Dict] = None


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
    
    AI Feature Pack v1:
    1. Fetches WorkProof events from DB (falls back to on-chain if empty)
    2. Extracts features and computes credit score
    3. Integrates forecasting, fraud, integrity, early warning signals
    4. Dynamically adjusts credit terms based on risk signals
    5. Computes fraudFlags bitmask
    6. Signs EIP-712 attestation
    7. Saves offer to history for fairness auditing
    8. Returns offer with all AI signal details
    """
    settings = get_settings()
    worker = request.worker_address.lower()
    checksum_worker = Web3.to_checksum_address(worker)
    
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
    
    # === AI Feature Pack v1: Gather all signals ===
    # 1. Forecast income
    forecast = forecast_income(worker, db)
    
    # 2. Fraud anomaly detection
    fraud_signal = compute_anomaly_score(worker, db)
    
    # 3. WorkProof integrity check
    integrity = check_workproof_integrity(worker, db)
    
    # 4. Early warning / default risk
    early_warning = compute_early_warning(worker, db)
    
    # === Generate base credit offer ===
    offer = generate_credit_offer(events, checksum_worker)
    
    # === Dynamic Credit Line Adjustment (Step H) ===
    base_credit_limit = offer["credit_limit"]
    base_apr = offer["apr_bps"]
    base_tenure = offer["tenure_days"]
    
    # Adjustment factors based on AI signals
    adjustment_factor = 1.0
    apr_adjustment = 0
    tenure_adjustment = 0
    explanations = list(offer.get("explanations", []) or [offer["explanation"]])
    
    # Adjust based on forecast confidence
    if forecast.get("confidence", 0) >= 0.6:
        adjustment_factor *= 1.1  # Boost for confident forecast
        explanations.append("✓ Good income forecast confidence (+10% credit)")
    elif forecast.get("confidence", 0) < 0.3:
        adjustment_factor *= 0.9  # Reduce for low confidence
        explanations.append("⚠ Low forecast confidence (-10% credit)")
    
    # Adjust based on anomaly score
    anomaly_score = fraud_signal.get("anomalyScore", 0)
    if anomaly_score >= 60:
        adjustment_factor *= 0.7
        apr_adjustment += 300  # +3% APR
        explanations.append(f"⚠ Elevated anomaly score ({anomaly_score}) - reduced credit, higher APR")
    elif anomaly_score >= 30:
        adjustment_factor *= 0.9
        apr_adjustment += 150  # +1.5% APR
        explanations.append(f"⚠ Moderate anomaly detected (-10% credit)")
    
    # Adjust based on integrity score
    integrity_score = integrity.get("flagScore", 0)
    if integrity_score >= 60:
        adjustment_factor *= 0.7
        explanations.append(f"⚠ WorkProof integrity concerns ({integrity_score}) - reduced credit")
    elif integrity_score >= 30:
        adjustment_factor *= 0.9
        explanations.append("⚠ Minor integrity flags detected")
    
    # Adjust based on early warning
    risk_score = early_warning.get("riskScore", 0)
    if risk_score >= 60:
        adjustment_factor *= 0.6
        tenure_adjustment = -7  # Shorter tenure
        apr_adjustment += 200
        explanations.append(f"⚠ High default risk ({risk_score}) - reduced credit, shorter tenure")
    elif risk_score >= 30:
        adjustment_factor *= 0.85
        explanations.append("⚠ Elevated default risk detected")
    
    # Apply adjustments
    adjusted_credit = int(base_credit_limit * adjustment_factor)
    adjusted_apr = min(3600, max(500, base_apr + apr_adjustment))  # Cap APR 5-36%
    adjusted_tenure = max(7, base_tenure + tenure_adjustment)  # Min 7 days
    
    # === Compute fraudFlags Bitmask (Step I) ===
    fraud_flags = 0
    
    # HARD_BLOCK: anomalyScore >= 85 OR flagScore >= 85
    if anomaly_score >= 85 or integrity_score >= 85:
        fraud_flags |= FLAG_HARD_BLOCK
        explanations.append("🚫 HARD BLOCK: Critical risk detected")
    
    # Individual severity flags
    if anomaly_score >= 50:
        fraud_flags |= FLAG_ANOMALY_SUSPECT
    
    if integrity_score >= 50:
        fraud_flags |= FLAG_WORKPROOF_SUSPECT
    
    if risk_score >= 60:
        fraud_flags |= FLAG_EARLY_WARNING_HIGH
    
    # === Create attestation with adjusted values ===
    attestation = create_attestation(
        worker=checksum_worker,
        trust_score=offer["trust_score"],
        pd=offer["pd"],
        credit_limit=adjusted_credit,
        apr_bps=adjusted_apr,
        tenure_days=adjusted_tenure,
        fraud_flags=fraud_flags,
        expires_in_seconds=900,  # 15 minutes
    )
    
    # Sign attestation
    signature, signer = sign_attestation(attestation)
    
    # === Generate coach nudge preview ===
    coach = generate_coach_nudge(
        worker=worker,
        requested_amount=adjusted_credit,  # Use as example
        offer={
            "creditLimit": adjusted_credit,
            "aprBps": adjusted_apr,
            "tenureDays": adjusted_tenure,
        },
        db=db
    )
    
    # === Save to offer_history for fairness auditing (Step J) ===
    if db is not None:
        try:
            offer_record = OfferHistory(
                worker=worker.lower(),
                credit_limit=str(adjusted_credit),
                apr_bps=adjusted_apr,
                tenure_days=adjusted_tenure,
                pd=offer["pd"],
                trust_score=offer["trust_score"],
                fraud_flags=fraud_flags,
                risk_score=risk_score,
                forecast_14d=forecast.get("expectedIncome_14d", 0),
                anomaly_score=anomaly_score,
                integrity_score=integrity_score,
            )
            db.add(offer_record)
            db.commit()
        except Exception as e:
            print(f"⚠️ Failed to save offer history: {e}")
    
    # === Build response with AI signals ===
    return OfferResponse(
        attestation=AttestationData(**format_attestation_for_response(attestation)),
        signature=f"0x{signature}" if not signature.startswith("0x") else signature,
        signer=signer,
        explanation="; ".join(explanations[:3]),  # Short version
        # AI Feature Pack v1 - additional fields
        forecast={
            "expectedIncome_14d": forecast.get("expectedIncome_14d"),
            "expectedIncome_30d": forecast.get("expectedIncome_30d"),
            "incomeVolatility": forecast.get("incomeVolatility"),
            "confidence": forecast.get("confidence"),
        },
        earlyWarning={
            "riskScore": risk_score,
            "riskLevel": early_warning.get("riskLevel"),
            "defaultRiskNext7d": early_warning.get("defaultRiskNext7d"),
            "defaultRiskNext14d": early_warning.get("defaultRiskNext14d"),
        },
        fraudSignal={
            "anomalyScore": anomaly_score,
            "riskLevel": fraud_signal.get("riskLevel"),
            "reasons": fraud_signal.get("reasons", []),
        },
        workproofIntegrity={
            "flagScore": integrity_score,
            "riskLevel": integrity.get("riskLevel"),
            "flags": integrity.get("flags", []),
        },
        coach={
            "recommendedAmount": coach.get("recommendedAmount"),
            "riskLabel": coach.get("riskLabel"),
            "tips": coach.get("tips", [])[:3],
        },
        explanations=explanations,
        fraudFlagsBitmask={
            "value": fraud_flags,
            "HARD_BLOCK": bool(fraud_flags & FLAG_HARD_BLOCK),
            "ANOMALY_SUSPECT": bool(fraud_flags & FLAG_ANOMALY_SUSPECT),
            "WORKPROOF_SUSPECT": bool(fraud_flags & FLAG_WORKPROOF_SUSPECT),
            "EARLY_WARNING_HIGH": bool(fraud_flags & FLAG_EARLY_WARNING_HIGH),
            "FAIRNESS_REVIEW": bool(fraud_flags & FLAG_FAIRNESS_REVIEW),
        },
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
