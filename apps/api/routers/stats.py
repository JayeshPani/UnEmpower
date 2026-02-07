"""
Stats router for worker feature extraction.
"""

from fastapi import APIRouter, Query, HTTPException

from services.features import get_worker_features, get_workproof_history, get_loan_history


router = APIRouter(prefix="/stats", tags=["Stats"])


@router.get("/worker")
async def get_worker_stats(worker: str = Query(..., description="Worker address (0x...)")):
    """
    Get comprehensive feature extraction for a worker.
    
    Returns shift counts, ratings, earnings, recency, loan stats.
    """
    if not worker.startswith("0x") or len(worker) != 42:
        raise HTTPException(status_code=400, detail="Invalid worker address format")
    
    features = get_worker_features(worker)
    return {
        "status": "success",
        "features": features,
    }


@router.get("/worker/history")
async def get_worker_history(
    worker: str = Query(..., description="Worker address (0x...)"),
    days: int = Query(30, description="Number of days to include")
):
    """
    Get detailed workproof and loan history for a worker.
    """
    if not worker.startswith("0x") or len(worker) != 42:
        raise HTTPException(status_code=400, detail="Invalid worker address format")
    
    workproofs = get_workproof_history(worker, days=days)
    loans = get_loan_history(worker, days=days)
    
    return {
        "status": "success",
        "worker": worker,
        "days": days,
        "workproofs": workproofs,
        "loans": loans,
        "workproofCount": len(workproofs),
        "loanCount": len(loans),
    }
