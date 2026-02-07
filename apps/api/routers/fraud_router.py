"""
Fraud detection router.
"""

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session

from services.fraud import compute_anomaly_score
from database import get_db, FraudSignal


router = APIRouter(prefix="/fraud", tags=["Fraud Detection"])


@router.get("/worker")
async def get_fraud_analysis(
    worker: str = Query(..., description="Worker address (0x...)"),
    save: bool = Query(False, description="Save result to database"),
    db: Session = Depends(get_db)
):
    """
    Get fraud anomaly analysis for a worker.
    
    Computes anomaly score (0-100) based on:
    - Sudden inactivity
    - Proof bursts
    - Rating anomalies
    - Borrowing patterns
    """
    if not worker.startswith("0x") or len(worker) != 42:
        raise HTTPException(status_code=400, detail="Invalid worker address format")
    
    fraud_signal = compute_anomaly_score(worker, db)
    
    # Optionally save to database
    if save:
        record = FraudSignal(
            worker=worker.lower(),
            anomaly_score=fraud_signal["anomalyScore"],
            risk_level=fraud_signal["riskLevel"],
            reasons=fraud_signal["reasons"],
            signals=fraud_signal["signals"],
        )
        db.add(record)
        db.commit()
        fraud_signal["saved"] = True
    
    return {
        "status": "success",
        "fraud": fraud_signal,
    }


@router.get("/history")
async def get_fraud_history(
    worker: str = Query(..., description="Worker address (0x...)"),
    limit: int = Query(10, description="Number of records to return"),
    db: Session = Depends(get_db)
):
    """
    Get historical fraud signals for a worker.
    """
    if not worker.startswith("0x") or len(worker) != 42:
        raise HTTPException(status_code=400, detail="Invalid worker address format")
    
    from sqlalchemy import func
    
    records = db.query(FraudSignal).filter(
        func.lower(FraudSignal.worker) == worker.lower()
    ).order_by(FraudSignal.created_at.desc()).limit(limit).all()
    
    return {
        "status": "success",
        "worker": worker,
        "history": [
            {
                "id": r.id,
                "anomalyScore": r.anomaly_score,
                "riskLevel": r.risk_level,
                "reasons": r.reasons,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ],
    }
