"""
WorkProof integrity router.
"""

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session

from services.workproof_integrity import check_workproof_integrity
from database import get_db, WorkProofFlag


router = APIRouter(prefix="/workproof", tags=["WorkProof Integrity"])


@router.get("/integrity")
async def get_workproof_integrity(
    worker: str = Query(..., description="Worker address (0x...)"),
    save: bool = Query(False, description="Save result to database"),
    db: Session = Depends(get_db)
):
    """
    Check WorkProof sequence integrity for a worker.
    
    Detects:
    - Too many proofs in short time
    - Timestamp anomalies
    - Duplicate proof hashes
    - Rating manipulation
    """
    if not worker.startswith("0x") or len(worker) != 42:
        raise HTTPException(status_code=400, detail="Invalid worker address format")
    
    result = check_workproof_integrity(worker, db)
    
    # Optionally save to database
    if save:
        record = WorkProofFlag(
            worker=worker.lower(),
            flag_score=result["flagScore"],
            risk_level=result["riskLevel"],
            flags=result["flags"],
            event_ids=result["eventIds"],
        )
        db.add(record)
        db.commit()
        result["saved"] = True
    
    return {
        "status": "success",
        "integrity": result,
    }


@router.get("/integrity/history")
async def get_integrity_history(
    worker: str = Query(..., description="Worker address (0x...)"),
    limit: int = Query(10, description="Number of records to return"),
    db: Session = Depends(get_db)
):
    """
    Get historical integrity flags for a worker.
    """
    if not worker.startswith("0x") or len(worker) != 42:
        raise HTTPException(status_code=400, detail="Invalid worker address format")
    
    from sqlalchemy import func
    
    records = db.query(WorkProofFlag).filter(
        func.lower(WorkProofFlag.worker) == worker.lower()
    ).order_by(WorkProofFlag.created_at.desc()).limit(limit).all()
    
    return {
        "status": "success",
        "worker": worker,
        "history": [
            {
                "id": r.id,
                "flagScore": r.flag_score,
                "riskLevel": r.risk_level,
                "flags": r.flags,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ],
    }
