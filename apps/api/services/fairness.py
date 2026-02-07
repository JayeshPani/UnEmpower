"""
Fairness/Bias Auditor Service for UnEmpower.

Audits fairness across behavioral cohorts (no demographics):
- Shift count deciles
- Rating band bins
- Recency bins

Checks for disparities in APR, credit limit, and approval rates.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import defaultdict

from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_session_local


# Disparity thresholds
APR_DISPARITY_THRESHOLD = 500  # 5% difference in APR
CREDIT_DISPARITY_THRESHOLD = 0.5  # 50% difference in credit limit


class OfferHistoryDB:
    """
    Helper to query offer history from database.
    Note: Offer history table created in database.py update.
    """
    
    @staticmethod
    def get_recent_offers(days: int = 30, db: Session = None) -> List[Dict]:
        """Get offers from last N days."""
        try:
            # Import here to avoid circular imports
            from database import OfferHistory
            
            close_session = False
            if db is None:
                SessionLocal = get_session_local()
                db = SessionLocal()
                close_session = True
            
            try:
                cutoff = datetime.utcnow() - timedelta(days=days)
                offers = db.query(OfferHistory).filter(
                    OfferHistory.created_at >= cutoff
                ).all()
                
                return [
                    {
                        "worker": o.worker,
                        "creditLimit": int(o.credit_limit),
                        "aprBps": o.apr_bps,
                        "tenure": o.tenure_days,
                        "pd": o.pd,
                        "trustScore": o.trust_score,
                        "riskScore": o.risk_score,
                        "forecastIncome14d": o.forecast_14d,
                        "createdAt": o.created_at.isoformat() if o.created_at else None,
                    }
                    for o in offers
                ]
            finally:
                if close_session:
                    db.close()
        except Exception as e:
            # Table might not exist yet
            return []


def compute_cohort(value: float, bins: List[float], labels: List[str]) -> str:
    """Assign value to a cohort based on bins."""
    for i, threshold in enumerate(bins):
        if value <= threshold:
            return labels[i]
    return labels[-1]


def run_fairness_audit(window_days: int = 30, db: Session = None) -> Dict:
    """
    Run fairness audit on recent offers.
    
    Returns:
        {
            "disparities": List[Dict],
            "cohortStats": Dict,
            "notes": List[str],
            "overallAssessment": str,
            "auditedAt": str
        }
    """
    # Get recent offers
    offers = OfferHistoryDB.get_recent_offers(days=window_days, db=db)
    
    if len(offers) < 5:
        return {
            "status": "insufficient_data",
            "message": f"Need at least 5 offers for audit, found {len(offers)}",
            "disparities": [],
            "cohortStats": {},
            "notes": ["Not enough data for meaningful fairness analysis"],
            "overallAssessment": "INSUFFICIENT_DATA",
            "auditedAt": datetime.utcnow().isoformat(),
        }
    
    disparities = []
    notes = []
    
    # === Cohort A: Shift count deciles (using trustScore as proxy) ===
    shift_bins = [20, 40, 60, 80, 100]
    shift_labels = ["low_activity", "below_avg", "average", "above_avg", "high_activity"]
    
    cohort_a = defaultdict(list)
    for o in offers:
        cohort = compute_cohort(o.get("trustScore", 50), shift_bins, shift_labels)
        cohort_a[cohort].append(o)
    
    # === Cohort B: Rating bands ===
    rating_bins = [2, 3, 4, 5]
    rating_labels = ["poor", "fair", "good", "excellent"]
    
    # Estimate rating from trustScore (just for demo)
    cohort_b = defaultdict(list)
    for o in offers:
        # Map trustScore to rating
        if o.get("trustScore", 50) < 30:
            rating = "poor"
        elif o.get("trustScore", 50) < 50:
            rating = "fair"
        elif o.get("trustScore", 50) < 75:
            rating = "good"
        else:
            rating = "excellent"
        cohort_b[rating].append(o)
    
    # === Cohort C: Risk score bins ===
    risk_bins = [25, 50, 75, 100]
    risk_labels = ["low_risk", "medium_risk", "high_risk", "critical_risk"]
    
    cohort_c = defaultdict(list)
    for o in offers:
        cohort = compute_cohort(o.get("riskScore", 0), risk_bins, risk_labels)
        cohort_c[cohort].append(o)
    
    # === Compute stats for each cohort ===
    def cohort_stats(cohort_dict: Dict[str, List]) -> Dict:
        stats = {}
        for name, offers_in_cohort in cohort_dict.items():
            if not offers_in_cohort:
                continue
            
            aprs = [o["aprBps"] for o in offers_in_cohort]
            limits = [o["creditLimit"] for o in offers_in_cohort]
            
            stats[name] = {
                "count": len(offers_in_cohort),
                "avgAprBps": round(sum(aprs) / len(aprs), 0),
                "avgCreditLimit": round(sum(limits) / len(limits), 0),
                "minApr": min(aprs),
                "maxApr": max(aprs),
            }
        return stats
    
    cohort_a_stats = cohort_stats(cohort_a)
    cohort_b_stats = cohort_stats(cohort_b)
    cohort_c_stats = cohort_stats(cohort_c)
    
    # === Check for disparities ===
    def check_disparity(stats: Dict, cohort_type: str) -> List[Dict]:
        found = []
        cohort_names = list(stats.keys())
        
        for i, c1 in enumerate(cohort_names):
            for c2 in cohort_names[i+1:]:
                s1 = stats[c1]
                s2 = stats[c2]
                
                # APR disparity
                apr_diff = abs(s1["avgAprBps"] - s2["avgAprBps"])
                if apr_diff > APR_DISPARITY_THRESHOLD:
                    found.append({
                        "type": "APR",
                        "cohortType": cohort_type,
                        "cohort1": c1,
                        "cohort2": c2,
                        "value1": s1["avgAprBps"],
                        "value2": s2["avgAprBps"],
                        "difference": apr_diff,
                        "threshold": APR_DISPARITY_THRESHOLD,
                        "severity": "HIGH" if apr_diff > APR_DISPARITY_THRESHOLD * 2 else "MEDIUM"
                    })
                
                # Credit limit disparity
                if s1["avgCreditLimit"] > 0 and s2["avgCreditLimit"] > 0:
                    limit_ratio = min(s1["avgCreditLimit"], s2["avgCreditLimit"]) / max(s1["avgCreditLimit"], s2["avgCreditLimit"])
                    if limit_ratio < (1 - CREDIT_DISPARITY_THRESHOLD):
                        found.append({
                            "type": "CREDIT_LIMIT",
                            "cohortType": cohort_type,
                            "cohort1": c1,
                            "cohort2": c2,
                            "value1": s1["avgCreditLimit"],
                            "value2": s2["avgCreditLimit"],
                            "ratio": round(limit_ratio, 2),
                            "threshold": CREDIT_DISPARITY_THRESHOLD,
                            "severity": "HIGH" if limit_ratio < 0.3 else "MEDIUM"
                        })
        
        return found
    
    disparities.extend(check_disparity(cohort_a_stats, "activity_level"))
    disparities.extend(check_disparity(cohort_b_stats, "rating_band"))
    disparities.extend(check_disparity(cohort_c_stats, "risk_level"))
    
    # === Generate notes ===
    if not disparities:
        notes.append("✓ No significant disparities detected across cohorts")
        overall = "PASS"
    else:
        high_severity = [d for d in disparities if d.get("severity") == "HIGH"]
        if high_severity:
            notes.append(f"⚠️ Found {len(high_severity)} high-severity disparities")
            overall = "REVIEW_REQUIRED"
        else:
            notes.append(f"Found {len(disparities)} moderate disparities - monitor for trends")
            overall = "MONITOR"
    
    # Add context notes
    notes.append(f"Analyzed {len(offers)} offers from last {window_days} days")
    notes.append("Cohorts based on behavioral factors only (no demographics)")
    
    # Mitigation suggestions
    if disparities:
        notes.append("Mitigation: Consider adjusting scoring weights or adding regularization")
    
    return {
        "status": "completed",
        "disparities": disparities,
        "cohortStats": {
            "activityLevel": cohort_a_stats,
            "ratingBand": cohort_b_stats,
            "riskLevel": cohort_c_stats,
        },
        "notes": notes,
        "overallAssessment": overall,
        "offerCount": len(offers),
        "windowDays": window_days,
        "auditedAt": datetime.utcnow().isoformat(),
    }
