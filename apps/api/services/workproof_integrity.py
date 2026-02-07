"""
WorkProof Integrity Service for UnEmpower.

Detects fake or suspicious WorkProof sequences:
- Too many proofs in short time
- Timestamp anomalies
- Duplicate proof hashes
- Impossible density
- Rating band manipulation
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import Counter

from services.features import get_workproof_history, get_worker_features


# Thresholds (configurable)
MAX_PROOFS_PER_DAY = 20  # Impossible density
MAX_PROOFS_PER_HOUR = 5  # Suspicious burst
MIN_PROOF_INTERVAL_SECONDS = 60  # Too fast between proofs
RATING_JUMP_THRESHOLD = 2  # Suspicious rating jump


def check_workproof_integrity(worker: str, db=None) -> Dict:
    """
    Check WorkProof sequence integrity for a worker.
    
    Returns:
        {
            "flagScore": int (0-100),
            "riskLevel": str,
            "flags": List[str],
            "details": Dict,
            "eventIds": List[int],
            "worker": str,
            "analyzedAt": str
        }
    """
    history = get_workproof_history(worker, days=30, db=db)
    features = get_worker_features(worker, db=db)
    
    flags = []
    flag_score = 0
    flagged_events = []
    details = {}
    
    if not history:
        return {
            "flagScore": 0,
            "riskLevel": "UNKNOWN",
            "flags": ["No workproofs to analyze"],
            "details": {},
            "eventIds": [],
            "worker": worker,
            "analyzedAt": datetime.utcnow().isoformat(),
        }
    
    # === Check 1: Proof density (too many per day) ===
    daily_counts = Counter()
    for wp in history:
        date_key = datetime.fromtimestamp(wp["timestamp"]).strftime("%Y-%m-%d")
        daily_counts[date_key] += 1
    
    high_density_days = [(d, c) for d, c in daily_counts.items() if c > MAX_PROOFS_PER_DAY]
    if high_density_days:
        density_score = min(30, len(high_density_days) * 10 + sum(c - MAX_PROOFS_PER_DAY for _, c in high_density_days))
        flag_score += density_score
        flags.append(f"Impossible density: {len(high_density_days)} days with >{MAX_PROOFS_PER_DAY} proofs")
        details["highDensityDays"] = high_density_days
    
    # === Check 2: Hourly burst ===
    hourly_counts = Counter()
    for wp in history:
        hour_key = datetime.fromtimestamp(wp["timestamp"]).strftime("%Y-%m-%d %H")
        hourly_counts[hour_key] += 1
    
    burst_hours = [(h, c) for h, c in hourly_counts.items() if c > MAX_PROOFS_PER_HOUR]
    if burst_hours:
        burst_score = min(20, len(burst_hours) * 5)
        flag_score += burst_score
        flags.append(f"Hourly bursts: {len(burst_hours)} hours with >{MAX_PROOFS_PER_HOUR} proofs")
        details["burstHours"] = len(burst_hours)
    
    # === Check 3: Timestamp out-of-order OR too fast ===
    timestamps = [wp["timestamp"] for wp in history]
    sorted_ts = sorted(timestamps)
    
    if timestamps != sorted_ts:
        flags.append("Timestamp ordering anomaly detected")
        flag_score += 15
        details["orderingAnomaly"] = True
    
    # Check for impossibly fast submissions
    fast_submissions = 0
    for i in range(1, len(sorted_ts)):
        interval = sorted_ts[i] - sorted_ts[i-1]
        if 0 < interval < MIN_PROOF_INTERVAL_SECONDS:
            fast_submissions += 1
    
    if fast_submissions > 0:
        fast_score = min(25, fast_submissions * 5)
        flag_score += fast_score
        flags.append(f"Fast submissions: {fast_submissions} proofs within {MIN_PROOF_INTERVAL_SECONDS}s of each other")
        details["fastSubmissions"] = fast_submissions
    
    # === Check 4: Duplicate proof hashes ===
    proof_hashes = [wp["proofHash"] for wp in history if wp.get("proofHash")]
    hash_counts = Counter(proof_hashes)
    duplicates = [(h, c) for h, c in hash_counts.items() if c > 1]
    
    if duplicates:
        dup_score = min(30, len(duplicates) * 10)
        flag_score += dup_score
        flags.append(f"Duplicate proof hashes: {len(duplicates)} hashes used multiple times")
        details["duplicateHashes"] = len(duplicates)
        # Mark duplicate events
        for wp in history:
            if wp["proofHash"] in [h for h, _ in duplicates]:
                flagged_events.append(wp.get("proofId", 0))
    
    # === Check 5: Rating band manipulation ===
    # Check for repeated large jumps in rating (gaming the system)
    ratings = []
    for wp in history:
        rating = wp.get("workUnits", 3) % 10
        rating = min(5, max(1, rating))
        ratings.append((wp["proofId"], rating, wp["timestamp"]))
    
    ratings_sorted = sorted(ratings, key=lambda x: x[2])  # Sort by timestamp
    
    manipulation_count = 0
    for i in range(1, len(ratings_sorted)):
        jump = abs(ratings_sorted[i][1] - ratings_sorted[i-1][1])
        if jump > RATING_JUMP_THRESHOLD:
            manipulation_count += 1
            flagged_events.append(ratings_sorted[i][0])
    
    if manipulation_count >= 3:  # At least 3 suspicious jumps
        manip_score = min(20, manipulation_count * 4)
        flag_score += manip_score
        flags.append(f"Rating manipulation: {manipulation_count} large rating jumps detected")
        details["ratingJumps"] = manipulation_count
    
    # === Cap score at 100 ===
    flag_score = min(100, flag_score)
    
    # === Risk level ===
    if flag_score >= 85:
        risk_level = "CRITICAL"
    elif flag_score >= 60:
        risk_level = "HIGH"
    elif flag_score >= 30:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"
    
    return {
        "flagScore": flag_score,
        "riskLevel": risk_level,
        "flags": flags if flags else ["No integrity issues detected"],
        "details": details,
        "eventIds": list(set(flagged_events)),
        "proofCount": len(history),
        "worker": worker,
        "analyzedAt": datetime.utcnow().isoformat(),
    }
