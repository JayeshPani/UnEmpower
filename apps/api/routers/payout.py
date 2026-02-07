"""
Payout Router

Simulates UPI payouts (event-driven design ready for real integration).
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime

from settings import get_settings
from database import get_db

router = APIRouter(prefix="/payout", tags=["payout"])


# In-memory payout log (would be DB in production)
_payout_log: List[dict] = []


class SimulatePayoutRequest(BaseModel):
    """Request to simulate payout."""
    borrower: str
    amount: str  # In USDC decimals
    loan_nonce: int


class PayoutResponse(BaseModel):
    """Payout response."""
    success: bool
    payout_id: str
    borrower: str
    amount: str
    upi_id: Optional[str] = None
    status: str
    timestamp: datetime


@router.post("/simulate", response_model=PayoutResponse)
async def simulate_payout(request: SimulatePayoutRequest):
    """
    Simulate a UPI payout after loan approval.
    
    In production, this would:
    1. Receive LoanApproved event from indexer
    2. Trigger actual UPI transfer via payment gateway
    3. Log transaction for reconciliation
    
    For demo, we just log and return success.
    """
    import uuid
    
    payout_id = str(uuid.uuid4())[:8]
    
    payout = {
        "payout_id": payout_id,
        "borrower": request.borrower.lower(),
        "amount": request.amount,
        "loan_nonce": request.loan_nonce,
        "upi_id": "demo@upi",  # Would come from worker profile
        "status": "SIMULATED",
        "timestamp": datetime.utcnow(),
    }
    
    _payout_log.append(payout)
    
    print(f"💸 Simulated payout: {payout_id} to {request.borrower[:10]}... for {int(request.amount)/1_000_000:.2f} USDC")
    
    return PayoutResponse(
        success=True,
        payout_id=payout_id,
        borrower=request.borrower,
        amount=request.amount,
        upi_id="demo@upi",
        status="SIMULATED",
        timestamp=payout["timestamp"],
    )


@router.get("/status/{borrower}", response_model=List[PayoutResponse])
async def get_payout_status(
    borrower: str,
    limit: int = Query(10, le=50),
):
    """
    Get payout history for a borrower.
    """
    borrower = borrower.lower()
    
    payouts = [
        p for p in _payout_log
        if p["borrower"] == borrower
    ][-limit:]
    
    return [
        PayoutResponse(
            success=True,
            payout_id=p["payout_id"],
            borrower=p["borrower"],
            amount=p["amount"],
            upi_id=p.get("upi_id"),
            status=p["status"],
            timestamp=p["timestamp"],
        )
        for p in reversed(payouts)
    ]
