"""
Audit router for fairness analysis.
"""

from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session

from services.fairness import run_fairness_audit
from database import get_db, OfferHistory


router = APIRouter(prefix="/audit", tags=["Fairness Audit"])


@router.get("/fairness")
async def get_fairness_audit(
    windowDays: int = Query(30, description="Number of days to analyze"),
    db: Session = Depends(get_db)
):
    """
    Run fairness audit on recent credit offers.
    
    Checks for disparities across behavioral cohorts:
    - Activity level (shift count)
    - Rating bands
    - Risk levels
    
    Reports APR and credit limit disparities.
    """
    audit = run_fairness_audit(window_days=windowDays, db=db)
    return {
        "status": "success",
        "audit": audit,
    }


@router.get("/offer/history")
async def get_offer_history(
    worker: str = Query(None, description="Filter by worker address"),
    limit: int = Query(20, description="Number of records to return"),
    db: Session = Depends(get_db)
):
    """
    Get credit offer history.
    """
    from sqlalchemy import func
    
    query = db.query(OfferHistory)
    
    if worker:
        if not worker.startswith("0x") or len(worker) != 42:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Invalid worker address format")
        query = query.filter(func.lower(OfferHistory.worker) == worker.lower())
    
    records = query.order_by(OfferHistory.created_at.desc()).limit(limit).all()
    
    return {
        "status": "success",
        "offers": [
            {
                "id": r.id,
                "worker": r.worker,
                "creditLimit": r.credit_limit,
                "aprBps": r.apr_bps,
                "tenureDays": r.tenure_days,
                "pd": r.pd,
                "trustScore": r.trust_score,
                "fraudFlags": r.fraud_flags,
                "riskScore": r.risk_score,
                "forecastIncome14d": r.forecast_14d,
                "anomalyScore": r.anomaly_score,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ],
        "count": len(records),
    }
