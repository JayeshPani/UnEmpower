"""
Coach router for borrowing nudges.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.coach import generate_coach_nudge


router = APIRouter(prefix="/coach", tags=["Borrowing Coach"])


class CoachRequest(BaseModel):
    worker: str
    requestedAmount: str  # Amount in micro USDC (string for large numbers)
    offer: dict  # {creditLimit, aprBps, tenureDays}


@router.post("/nudge")
async def get_coach_nudge(request: CoachRequest):
    """
    Get borrowing coach recommendations.
    
    Provides personalized nudges based on:
    - Income forecast vs requested amount
    - Risk signals
    - Safe borrowing thresholds
    """
    if not request.worker.startswith("0x") or len(request.worker) != 42:
        raise HTTPException(status_code=400, detail="Invalid worker address format")
    
    try:
        requested_amount = int(request.requestedAmount)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid requestedAmount format")
    
    # Validate offer fields
    if "creditLimit" not in request.offer:
        raise HTTPException(status_code=400, detail="offer.creditLimit is required")
    
    try:
        offer = {
            "creditLimit": int(request.offer.get("creditLimit", 0)),
            "aprBps": int(request.offer.get("aprBps", 1800)),
            "tenureDays": int(request.offer.get("tenureDays", 14)),
        }
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid offer field format")
    
    nudge = generate_coach_nudge(
        worker=request.worker,
        requested_amount=requested_amount,
        offer=offer,
    )
    
    return {
        "status": "success",
        "nudge": nudge,
    }
