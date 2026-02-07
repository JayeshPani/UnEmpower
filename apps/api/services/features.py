"""
Feature extraction service for UnEmpower AI capabilities.

Extracts worker features from indexed events (PostgreSQL) for use by:
- Income forecasting
- Fraud detection
- Early warning
- Credit scoring
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from database import WorkProofEvent, LoanEvent, RepayEvent, get_session_local


def get_worker_features(worker: str, db: Optional[Session] = None) -> Dict[str, Any]:
    """
    Extract comprehensive features for a worker.
    
    Args:
        worker: Worker address (0x...)
        db: Optional database session
        
    Returns:
        Dict with all worker features
    """
    close_session = False
    if db is None:
        SessionLocal = get_session_local()
        db = SessionLocal()
        close_session = True
    
    try:
        worker_lower = worker.lower()
        now = datetime.utcnow()
        
        # Time windows
        ts_7d = int((now - timedelta(days=7)).timestamp())
        ts_14d = int((now - timedelta(days=14)).timestamp())
        ts_30d = int((now - timedelta(days=30)).timestamp())
        ts_24h = int((now - timedelta(hours=24)).timestamp())
        
        # === WorkProof Features ===
        workproofs = db.query(WorkProofEvent).filter(
            func.lower(WorkProofEvent.worker) == worker_lower
        ).order_by(WorkProofEvent.event_timestamp.desc()).all()
        
        # Shift counts by window
        shift_7d = [wp for wp in workproofs if wp.event_timestamp >= ts_7d]
        shift_14d = [wp for wp in workproofs if wp.event_timestamp >= ts_14d]
        shift_30d = [wp for wp in workproofs if wp.event_timestamp >= ts_30d]
        
        shift_count_7d = len(shift_7d)
        shift_count_14d = len(shift_14d)
        shift_count_30d = len(shift_30d)
        
        # WorkProof rate per day (7d window for fake detection)
        workproof_rate_per_day_7d = shift_count_7d / 7.0 if shift_count_7d > 0 else 0.0
        
        # Recency (hours since last workproof)
        if workproofs:
            last_ts = workproofs[0].event_timestamp
            recency_hours = (now.timestamp() - last_ts) / 3600
        else:
            recency_hours = 999999  # No workproofs
        
        # Rating bands (from work_units, normalized 1-5)
        ratings_30d = []
        for wp in shift_30d:
            # work_units encodes rating band (1-5)
            rating = min(5, max(1, wp.work_units % 10)) if wp.work_units else 3
            ratings_30d.append(rating)
        
        if ratings_30d:
            avg_rating_30d = sum(ratings_30d) / len(ratings_30d)
            # Simple trend: compare first half vs second half
            mid = len(ratings_30d) // 2
            if mid > 0:
                first_half = sum(ratings_30d[mid:]) / len(ratings_30d[mid:])
                second_half = sum(ratings_30d[:mid]) / len(ratings_30d[:mid])
                rating_trend_30d = second_half - first_half  # Positive = improving
            else:
                rating_trend_30d = 0.0
        else:
            avg_rating_30d = 3.0  # Default
            rating_trend_30d = 0.0
        
        # Earnings bands (from earned_amount, in band units)
        earnings_30d = []
        for wp in shift_30d:
            try:
                earned = int(wp.earned_amount) / 1_000_000  # Convert from micro to USDC
                # Normalize to band (0-10)
                band = min(10, earned / 10)
                earnings_30d.append(band)
            except:
                earnings_30d.append(1.0)
        
        if earnings_30d:
            earnings_mean_30d = sum(earnings_30d) / len(earnings_30d)
            # Volatility (coefficient of variation)
            if len(earnings_30d) > 1:
                mean = earnings_mean_30d
                variance = sum((e - mean) ** 2 for e in earnings_30d) / len(earnings_30d)
                std = variance ** 0.5
                earnings_vol_30d = std / mean if mean > 0 else 0.0
            else:
                earnings_vol_30d = 0.0
        else:
            earnings_mean_30d = 0.0
            earnings_vol_30d = 0.0
        
        # === Loan Features ===
        loans = db.query(LoanEvent).filter(
            func.lower(LoanEvent.borrower) == worker_lower
        ).order_by(LoanEvent.block_number.desc()).all()
        
        loans_30d = [l for l in loans if l.indexed_at and l.indexed_at >= now - timedelta(days=30)]
        loan_count_30d = len(loans_30d)
        
        # === Repayment Features ===
        repays = db.query(RepayEvent).filter(
            func.lower(RepayEvent.borrower) == worker_lower
        ).all()
        
        repays_30d = [r for r in repays if r.indexed_at and r.indexed_at >= now - timedelta(days=30)]
        repay_count_30d = len(repays_30d)
        
        # Repay ratio
        if loan_count_30d > 0:
            repay_ratio_30d = min(1.0, repay_count_30d / loan_count_30d)
        else:
            repay_ratio_30d = 1.0  # No loans = perfect ratio
        
        # === Proofs in last 24h (for burst detection) ===
        proofs_24h = [wp for wp in workproofs if wp.event_timestamp >= ts_24h]
        proofs_24h_count = len(proofs_24h)
        
        # === Build feature dict ===
        features = {
            # Shift counts
            "shiftCount_7d": shift_count_7d,
            "shiftCount_14d": shift_count_14d,
            "shiftCount_30d": shift_count_30d,
            
            # Rating
            "avgRatingBand_30d": round(avg_rating_30d, 2),
            "ratingTrend_30d": round(rating_trend_30d, 3),
            
            # Earnings
            "earningsBandMean_30d": round(earnings_mean_30d, 2),
            "earningsBandVol_30d": round(earnings_vol_30d, 3),
            
            # Recency
            "recencyHours": round(recency_hours, 1),
            
            # Loans
            "loanCount_30d": loan_count_30d,
            "repayRatio_30d": round(repay_ratio_30d, 2),
            
            # WorkProof rate (for fake detection)
            "workproofRatePerDay_7d": round(workproof_rate_per_day_7d, 2),
            
            # Additional for fraud
            "proofsInLast24h": proofs_24h_count,
            
            # Total stats
            "totalWorkProofs": len(workproofs),
            "totalLoans": len(loans),
            "totalRepays": len(repays),
            
            # Metadata
            "worker": worker,
            "extractedAt": now.isoformat(),
        }
        
        return features
        
    finally:
        if close_session:
            db.close()


def get_workproof_history(worker: str, days: int = 30, db: Optional[Session] = None) -> List[Dict]:
    """
    Get detailed workproof history for a worker.
    
    Used by forecasting and integrity checks.
    """
    close_session = False
    if db is None:
        SessionLocal = get_session_local()
        db = SessionLocal()
        close_session = True
    
    try:
        worker_lower = worker.lower()
        cutoff = datetime.utcnow() - timedelta(days=days)
        cutoff_ts = int(cutoff.timestamp())
        
        workproofs = db.query(WorkProofEvent).filter(
            and_(
                func.lower(WorkProofEvent.worker) == worker_lower,
                WorkProofEvent.event_timestamp >= cutoff_ts
            )
        ).order_by(WorkProofEvent.event_timestamp.asc()).all()
        
        history = []
        for wp in workproofs:
            history.append({
                "proofId": wp.proof_id,
                "timestamp": wp.event_timestamp,
                "datetime": datetime.fromtimestamp(wp.event_timestamp).isoformat(),
                "workUnits": wp.work_units,
                "earnedAmount": wp.earned_amount,
                "proofHash": wp.proof_hash,
                "blockNumber": wp.block_number,
                "txHash": wp.tx_hash,
            })
        
        return history
        
    finally:
        if close_session:
            db.close()


def get_loan_history(worker: str, days: int = 30, db: Optional[Session] = None) -> List[Dict]:
    """
    Get loan history for a worker.
    """
    close_session = False
    if db is None:
        SessionLocal = get_session_local()
        db = SessionLocal()
        close_session = True
    
    try:
        worker_lower = worker.lower()
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        loans = db.query(LoanEvent).filter(
            func.lower(LoanEvent.borrower) == worker_lower
        ).order_by(LoanEvent.block_number.desc()).all()
        
        history = []
        for loan in loans:
            if loan.indexed_at and loan.indexed_at >= cutoff:
                history.append({
                    "borrower": loan.borrower,
                    "principal": loan.principal,
                    "interestAmount": loan.interest_amount,
                    "dueDate": loan.due_date,
                    "nonce": loan.nonce,
                    "blockNumber": loan.block_number,
                    "txHash": loan.tx_hash,
                    "indexedAt": loan.indexed_at.isoformat() if loan.indexed_at else None,
                })
        
        return history
        
    finally:
        if close_session:
            db.close()
