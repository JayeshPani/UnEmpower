"""
Alerts router for early warning.
"""

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session

from services.early_warning import compute_early_warning
from database import get_db, RiskAlert


router = APIRouter(prefix="/alerts", tags=["Early Warning"])


@router.get("/worker")
async def get_worker_alerts(
    worker: str = Query(..., description="Worker address (0x...)"),
    save: bool = Query(False, description="Save result to database"),
    db: Session = Depends(get_db)
):
    """
    Get default early warning for a worker.
    
    Predicts 7-day and 14-day default risk based on:
    - Work activity decline
    - Anomaly scores
    - Repayment history
    - Income volatility
    """
    if not worker.startswith("0x") or len(worker) != 42:
        raise HTTPException(status_code=400, detail="Invalid worker address format")
    
    warning = compute_early_warning(worker, db)
    
    # Optionally save to database
    if save:
        record = RiskAlert(
            worker=worker.lower(),
            risk_score=warning["riskScore"],
            risk_level=warning["riskLevel"],
            default_risk_7d=warning["defaultRiskNext7d"],
            default_risk_14d=warning["defaultRiskNext14d"],
            reasons=warning["reasons"],
        )
        db.add(record)
        db.commit()
        warning["saved"] = True
    
    return {
        "status": "success",
        "alert": warning,
    }


@router.get("/history")
async def get_alert_history(
    worker: str = Query(..., description="Worker address (0x...)"),
    limit: int = Query(10, description="Number of records to return"),
    db: Session = Depends(get_db)
):
    """
    Get historical risk alerts for a worker.
    """
    if not worker.startswith("0x") or len(worker) != 42:
        raise HTTPException(status_code=400, detail="Invalid worker address format")
    
    from sqlalchemy import func
    
    records = db.query(RiskAlert).filter(
        func.lower(RiskAlert.worker) == worker.lower()
    ).order_by(RiskAlert.created_at.desc()).limit(limit).all()
    
    return {
        "status": "success",
        "worker": worker,
        "history": [
            {
                "id": r.id,
                "riskScore": r.risk_score,
                "riskLevel": r.risk_level,
                "defaultRisk7d": r.default_risk_7d,
                "defaultRisk14d": r.default_risk_14d,
                "reasons": r.reasons,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ],
    }
