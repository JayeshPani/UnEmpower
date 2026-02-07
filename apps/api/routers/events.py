"""
Events API Router

Provides endpoints for querying indexed events:
- GET /events/latest - Merged timeline of all events
- GET /stats/worker - Computed features for scoring
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from database import get_db, WorkProofEvent, LoanEvent, RepayEvent

router = APIRouter(prefix="/events", tags=["events"])


class EventResponse(BaseModel):
    """Unified event response."""
    type: str
    tx_hash: str
    block_number: int
    timestamp: Optional[int] = None
    indexed_at: datetime
    data: dict


class WorkerStatsResponse(BaseModel):
    """Worker statistics for scoring."""
    worker: str
    total_proofs: int
    features: dict
    last_proof_at: Optional[datetime] = None


@router.get("/latest", response_model=List[EventResponse])
async def get_latest_events(
    worker: Optional[str] = Query(None, description="Filter by worker address"),
    limit: int = Query(20, le=100, description="Max events to return"),
    db: Session = Depends(get_db),
):
    """
    Get latest events merged from all sources.
    
    Returns WorkProof, Loan, and Repay events sorted by block number descending.
    """
    events: List[EventResponse] = []
    
    # Normalize worker address
    if worker:
        worker = worker.lower()
    
    # Query WorkProof events
    wp_query = db.query(WorkProofEvent).order_by(desc(WorkProofEvent.block_number))
    if worker:
        wp_query = wp_query.filter(WorkProofEvent.worker == worker)
    workproofs = wp_query.limit(limit).all()
    
    for wp in workproofs:
        events.append(EventResponse(
            type="WorkProofSubmitted",
            tx_hash=wp.tx_hash,
            block_number=wp.block_number,
            timestamp=wp.event_timestamp,
            indexed_at=wp.indexed_at,
            data={
                "proofId": wp.proof_id,
                "worker": wp.worker,
                "workUnits": wp.work_units,
                "earnedAmount": wp.earned_amount,
            },
        ))
    
    # Query Loan events
    loan_query = db.query(LoanEvent).order_by(desc(LoanEvent.block_number))
    if worker:
        loan_query = loan_query.filter(LoanEvent.borrower == worker)
    loans = loan_query.limit(limit).all()
    
    for loan in loans:
        events.append(EventResponse(
            type="LoanApproved",
            tx_hash=loan.tx_hash,
            block_number=loan.block_number,
            timestamp=None,
            indexed_at=loan.indexed_at,
            data={
                "borrower": loan.borrower,
                "principal": loan.principal,
                "interestAmount": loan.interest_amount,
                "dueDate": loan.due_date,
                "nonce": loan.nonce,
            },
        ))
    
    # Query Repay events
    repay_query = db.query(RepayEvent).order_by(desc(RepayEvent.block_number))
    if worker:
        repay_query = repay_query.filter(RepayEvent.borrower == worker)
    repays = repay_query.limit(limit).all()
    
    for repay in repays:
        events.append(EventResponse(
            type="Repaid",
            tx_hash=repay.tx_hash,
            block_number=repay.block_number,
            timestamp=None,
            indexed_at=repay.indexed_at,
            data={
                "borrower": repay.borrower,
                "amount": repay.amount,
                "remaining": repay.remaining,
            },
        ))
    
    # Sort by block number descending
    events.sort(key=lambda e: e.block_number, reverse=True)
    
    return events[:limit]


@router.get("/stats/worker", response_model=WorkerStatsResponse)
async def get_worker_stats(
    worker: str = Query(..., description="Worker address"),
    db: Session = Depends(get_db),
):
    """
    Get computed statistics and features for a worker.
    
    Used by the scoring service and for UI display.
    """
    from services.scoring import extract_features_from_events
    
    worker = worker.lower()
    
    # Get all work proofs for this worker
    proofs = db.query(WorkProofEvent).filter(
        WorkProofEvent.worker == worker
    ).order_by(desc(WorkProofEvent.event_timestamp)).all()
    
    if not proofs:
        return WorkerStatsResponse(
            worker=worker,
            total_proofs=0,
            features={
                "shift_count_7d": 0,
                "shift_count_30d": 0,
                "avg_rating_band": 2.5,
                "earnings_consistency": 0.5,
                "recency_days": 30,
            },
            last_proof_at=None,
        )
    
    # Convert to dict format for feature extraction
    events = [
        {
            "event_timestamp": p.event_timestamp,
            "earned_amount": p.earned_amount,
        }
        for p in proofs
    ]
    
    features = extract_features_from_events(events)
    
    return WorkerStatsResponse(
        worker=worker,
        total_proofs=len(proofs),
        features=features,
        last_proof_at=proofs[0].indexed_at if proofs else None,
    )
