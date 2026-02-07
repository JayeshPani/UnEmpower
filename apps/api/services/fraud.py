"""
Fraud Anomaly Detection Service for UnEmpower.

Computes anomalyScore (0-100) using rule-based heuristics and IsolationForest.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional
import math

from services.features import get_worker_features, get_workproof_history


# Thresholds (configurable)
RECENCY_SPIKE_HOURS = 72  # Sudden inactivity if > this
PROOF_BURST_THRESHOLD = 10  # Too many proofs/day
LOAN_BURST_THRESHOLD = 3  # Too many loans in 7 days
RATING_JUMP_THRESHOLD = 2  # Rating jump > this is suspicious


def compute_anomaly_score(worker: str, db=None) -> Dict:
    """
    Compute fraud anomaly score for a worker.
    
    Returns:
        {
            "anomalyScore": int (0-100),
            "riskLevel": str (LOW/MEDIUM/HIGH/CRITICAL),
            "reasons": List[str],
            "signals": Dict,
            "worker": str,
            "analyzedAt": str
        }
    """
    features = get_worker_features(worker, db)
    history = get_workproof_history(worker, days=30, db=db)
    
    signals = {}
    reasons = []
    score = 0
    
    # === Signal 1: Sudden inactivity (recency spike) ===
    recency = features.get("recencyHours", 0)
    if recency > RECENCY_SPIKE_HOURS and features.get("totalWorkProofs", 0) > 5:
        # Was active, now inactive
        inactivity_score = min(25, int((recency - RECENCY_SPIKE_HOURS) / 24 * 5))
        score += inactivity_score
        signals["inactivity"] = {
            "recencyHours": recency,
            "threshold": RECENCY_SPIKE_HOURS,
            "contribution": inactivity_score
        }
        reasons.append(f"Sudden inactivity: {int(recency)}h since last proof")
    
    # === Signal 2: Proof burst (too many in short time) ===
    proofs_24h = features.get("proofsInLast24h", 0)
    rate_7d = features.get("workproofRatePerDay_7d", 0)
    
    if proofs_24h > PROOF_BURST_THRESHOLD:
        burst_score = min(30, (proofs_24h - PROOF_BURST_THRESHOLD) * 5)
        score += burst_score
        signals["proofBurst"] = {
            "proofsIn24h": proofs_24h,
            "threshold": PROOF_BURST_THRESHOLD,
            "contribution": burst_score
        }
        reasons.append(f"Proof burst: {proofs_24h} proofs in 24h")
    
    # === Signal 3: Unnatural rate spike ===
    if rate_7d > PROOF_BURST_THRESHOLD * 0.7:
        rate_score = min(20, int((rate_7d - PROOF_BURST_THRESHOLD * 0.5) * 5))
        score += rate_score
        signals["unnaturalRate"] = {
            "ratePerDay": rate_7d,
            "contribution": rate_score
        }
        reasons.append(f"High proof rate: {rate_7d:.1f}/day")
    
    # === Signal 4: Rating jump anomaly ===
    if history and len(history) >= 3:
        ratings = []
        for wp in history:
            rating = wp.get("workUnits", 3) % 10
            rating = min(5, max(1, rating))
            ratings.append(rating)
        
        # Check for jumps between consecutive ratings
        jumps = 0
        for i in range(1, len(ratings)):
            if abs(ratings[i] - ratings[i-1]) > RATING_JUMP_THRESHOLD:
                jumps += 1
        
        if jumps >= 2:
            jump_score = min(20, jumps * 7)
            score += jump_score
            signals["ratingJumps"] = {
                "jumpCount": jumps,
                "contribution": jump_score
            }
            reasons.append(f"Suspicious rating jumps: {jumps} occurrences")
    
    # === Signal 5: Borrowing burst ===
    loan_count = features.get("loanCount_30d", 0)
    repay_ratio = features.get("repayRatio_30d", 1.0)
    
    if loan_count > LOAN_BURST_THRESHOLD:
        loan_score = min(15, (loan_count - LOAN_BURST_THRESHOLD) * 5)
        score += loan_score
        signals["loanBurst"] = {
            "loans30d": loan_count,
            "threshold": LOAN_BURST_THRESHOLD,
            "contribution": loan_score
        }
        reasons.append(f"High loan frequency: {loan_count} in 30d")
    
    # === Signal 6: Low repay ratio with many loans ===
    if loan_count >= 2 and repay_ratio < 0.5:
        repay_score = min(25, int((1 - repay_ratio) * 30))
        score += repay_score
        signals["lowRepay"] = {
            "repayRatio": repay_ratio,
            "contribution": repay_score
        }
        reasons.append(f"Low repayment ratio: {repay_ratio*100:.0f}%")
    
    # === Cap score at 100 ===
    score = min(100, score)
    
    # === Risk level ===
    if score >= 85:
        risk_level = "CRITICAL"
    elif score >= 60:
        risk_level = "HIGH"
    elif score >= 30:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"
    
    return {
        "anomalyScore": score,
        "riskLevel": risk_level,
        "reasons": reasons if reasons else ["No anomalies detected"],
        "signals": signals,
        "features": {
            "recencyHours": features.get("recencyHours", 0),
            "proofsIn24h": features.get("proofsInLast24h", 0),
            "workproofRate7d": features.get("workproofRatePerDay_7d", 0),
            "loanCount30d": features.get("loanCount_30d", 0),
            "repayRatio30d": features.get("repayRatio_30d", 1.0),
        },
        "worker": worker,
        "analyzedAt": datetime.utcnow().isoformat(),
    }


def train_isolation_forest(db=None):
    """
    Train IsolationForest on worker features for anomaly detection.
    
    Note: For hackathon, we use rule-based scoring above.
    This function provides a template for ML-based detection.
    """
    try:
        from sklearn.ensemble import IsolationForest
        import numpy as np
        
        # Would query all worker features and train model
        # For now, return placeholder
        return {
            "status": "placeholder",
            "message": "IsolationForest training requires sufficient data"
        }
    except ImportError:
        return {
            "status": "sklearn_not_available",
            "message": "Using rule-based scoring instead"
        }
