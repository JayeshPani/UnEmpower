"""
Credit Scoring Service

Hybrid scoring using:
1. Feature extraction from WorkProof events (DB or on-chain fallback)
2. Sklearn LogisticRegression for PD estimation
3. Policy mapping for credit terms
"""

import numpy as np
from sklearn.linear_model import LogisticRegression
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import pickle
import os

# Model file path
MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/credit_model.pkl")

# Singleton model instance
_model: Optional[LogisticRegression] = None


def get_or_train_model() -> LogisticRegression:
    """Get or train the credit scoring model."""
    global _model
    
    if _model is not None:
        return _model
    
    # Try to load from file
    if os.path.exists(MODEL_PATH):
        try:
            with open(MODEL_PATH, "rb") as f:
                _model = pickle.load(f)
                print("✅ Loaded credit model from disk")
                return _model
        except Exception as e:
            print(f"⚠️ Failed to load model: {e}")
    
    # Train on synthetic data with deterministic seed
    _model = train_synthetic_model()
    
    # Save for future use
    try:
        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(_model, f)
            print("✅ Saved credit model to disk")
    except Exception as e:
        print(f"⚠️ Failed to save model: {e}")
    
    return _model


def train_synthetic_model() -> LogisticRegression:
    """Train model on synthetic data for demo."""
    print("🔧 Training credit model on synthetic data...")
    
    np.random.seed(42)  # Deterministic
    n_samples = 1000
    
    # Generate synthetic features
    # Features: [shift_count_7d, shift_count_30d, avg_rating, earnings_consistency, recency_days]
    
    # Good workers
    n_good = 700
    good_features = np.column_stack([
        np.random.poisson(5, n_good),      # shift_count_7d
        np.random.poisson(20, n_good),     # shift_count_30d
        np.random.uniform(3.5, 5.0, n_good),  # avg_rating
        np.random.uniform(0.6, 1.0, n_good),  # earnings_consistency
        np.random.uniform(0, 3, n_good),   # recency_days
    ])
    good_labels = np.zeros(n_good)  # 0 = no default
    
    # Risky workers
    n_risky = 300
    risky_features = np.column_stack([
        np.random.poisson(2, n_risky),
        np.random.poisson(8, n_risky),
        np.random.uniform(2.0, 4.0, n_risky),
        np.random.uniform(0.2, 0.7, n_risky),
        np.random.uniform(5, 30, n_risky),
    ])
    risky_labels = np.ones(n_risky)  # 1 = default
    
    X = np.vstack([good_features, risky_features])
    y = np.hstack([good_labels, risky_labels])
    
    # Shuffle
    indices = np.random.permutation(n_samples)
    X, y = X[indices], y[indices]
    
    # Train
    model = LogisticRegression(random_state=42, max_iter=1000)
    model.fit(X, y)
    
    print(f"✅ Model trained with accuracy: {model.score(X, y):.2%}")
    return model


def extract_features_from_events(events: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Extract scoring features from WorkProof events.
    
    Features:
    - shift_count_7d: Number of proofs in last 7 days
    - shift_count_30d: Number of proofs in last 30 days
    - avg_rating_band: Average earnings band (proxy for rating)
    - earnings_consistency: 1 - normalized variance
    - recency_days: Days since last proof
    """
    if not events:
        return {
            "shift_count_7d": 0,
            "shift_count_30d": 0,
            "avg_rating_band": 2.5,
            "earnings_consistency": 0.5,
            "recency_days": 30,
        }
    
    now = datetime.utcnow()
    
    # Parse timestamps
    timestamps = []
    earnings = []
    for event in events:
        ts = event.get("event_timestamp") or event.get("timestamp", 0)
        if isinstance(ts, str):
            ts = int(ts)
        timestamps.append(datetime.fromtimestamp(ts))
        
        earned = event.get("earned_amount") or event.get("earnedAmount", "0")
        if isinstance(earned, str):
            earned = int(earned)
        earnings.append(earned)
    
    # Count by period
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    
    shift_count_7d = sum(1 for ts in timestamps if ts >= seven_days_ago)
    shift_count_30d = sum(1 for ts in timestamps if ts >= thirty_days_ago)
    
    # Earnings consistency (low variance = high consistency)
    if len(earnings) > 1:
        mean_earnings = np.mean(earnings)
        if mean_earnings > 0:
            cv = np.std(earnings) / mean_earnings  # Coefficient of variation
            earnings_consistency = max(0, 1 - min(cv, 1))
        else:
            earnings_consistency = 0.5
    else:
        earnings_consistency = 0.5
    
    # Rating band (derive from earnings level)
    # Higher earnings = better rating
    avg_earnings = np.mean(earnings) if earnings else 0
    # Normalize to 1-5 scale (assuming 100-500 USDC per task)
    avg_rating_band = min(5, max(1, avg_earnings / 100_000_000))  # 100 USDC = 100M in decimals
    
    # Recency
    if timestamps:
        latest = max(timestamps)
        recency_days = (now - latest).days
    else:
        recency_days = 30
    
    return {
        "shift_count_7d": shift_count_7d,
        "shift_count_30d": shift_count_30d,
        "avg_rating_band": avg_rating_band,
        "earnings_consistency": earnings_consistency,
        "recency_days": recency_days,
    }


def compute_pd(features: Dict[str, float]) -> int:
    """
    Compute probability of default (PD).
    
    Returns:
        PD scaled to 0..1_000_000 (1M = 100%)
    """
    model = get_or_train_model()
    
    # Feature vector in model order
    X = np.array([[
        features["shift_count_7d"],
        features["shift_count_30d"],
        features["avg_rating_band"],
        features["earnings_consistency"],
        features["recency_days"],
    ]])
    
    # Get probability of default (class 1)
    pd_prob = model.predict_proba(X)[0, 1]
    
    # Scale to 0..1_000_000
    return int(pd_prob * 1_000_000)


def compute_trust_score(features: Dict[str, float], pd: int) -> int:
    """
    Compute trust score 0..10000.
    
    Weighted combination of:
    - Low PD
    - High activity
    - Good rating
    - Recent activity
    """
    # Base from PD (inverted)
    pd_score = 1 - (pd / 1_000_000)  # 0..1
    
    # Activity score
    activity = min(1, features["shift_count_30d"] / 20)  # Cap at 20 proofs
    
    # Rating score
    rating = (features["avg_rating_band"] - 1) / 4  # Normalize 1-5 to 0-1
    
    # Recency score
    recency = max(0, 1 - features["recency_days"] / 30)  # Decay over 30 days
    
    # Weighted average
    score = (
        0.40 * pd_score +
        0.25 * activity +
        0.20 * rating +
        0.15 * recency
    )
    
    return int(score * 10000)


def compute_credit_terms(trust_score: int, pd: int, features: Dict[str, float]) -> Dict[str, int]:
    """
    Compute credit terms based on score.
    
    Returns:
        credit_limit: USDC in 6 decimals (as int)
        apr_bps: APR in basis points
        tenure_days: Max loan duration
    """
    # Credit limit tiers (in USDC)
    if trust_score >= 8000:
        base_limit = 1000  # $1000
    elif trust_score >= 6000:
        base_limit = 500   # $500
    elif trust_score >= 4000:
        base_limit = 250   # $250
    elif trust_score >= 2000:
        base_limit = 100   # $100
    else:
        base_limit = 50    # $50
    
    # Adjust by activity
    activity_mult = min(1.5, 1 + features["shift_count_30d"] / 40)
    credit_limit = int(base_limit * activity_mult * 1_000_000)  # Convert to 6 decimals
    
    # APR based on PD (higher risk = higher rate)
    pd_pct = pd / 10_000  # 0..100
    if pd_pct < 5:
        apr_bps = 800   # 8%
    elif pd_pct < 10:
        apr_bps = 1200  # 12%
    elif pd_pct < 20:
        apr_bps = 1800  # 18%
    elif pd_pct < 40:
        apr_bps = 2400  # 24%
    else:
        apr_bps = 3600  # 36%
    
    # Tenure based on trust
    if trust_score >= 7000:
        tenure_days = 30
    elif trust_score >= 5000:
        tenure_days = 21
    elif trust_score >= 3000:
        tenure_days = 14
    else:
        tenure_days = 7
    
    return {
        "credit_limit": credit_limit,
        "apr_bps": apr_bps,
        "tenure_days": tenure_days,
    }


def generate_credit_offer(events: List[Dict[str, Any]], worker: str) -> Dict[str, Any]:
    """
    Generate full credit offer for a worker.
    
    Args:
        events: List of WorkProof events
        worker: Worker address
        
    Returns:
        Complete offer with attestation data (ready for signing)
    """
    # Extract features
    features = extract_features_from_events(events)
    
    # Compute PD
    pd = compute_pd(features)
    
    # Compute trust score
    trust_score = compute_trust_score(features, pd)
    
    # Get credit terms
    terms = compute_credit_terms(trust_score, pd, features)
    
    # Build explanation
    explanation = generate_explanation(features, trust_score, pd, terms)
    
    return {
        "worker": worker,
        "trust_score": trust_score,
        "pd": pd,
        "credit_limit": terms["credit_limit"],
        "apr_bps": terms["apr_bps"],
        "tenure_days": terms["tenure_days"],
        "fraud_flags": 0,  # Placeholder for anomaly detection
        "features": features,
        "explanation": explanation,
    }


def generate_explanation(features: Dict[str, float], trust_score: int, pd: int, terms: Dict[str, int]) -> str:
    """Generate human-readable explanation of scoring."""
    lines = [
        "📊 Credit Scoring Analysis",
        "=" * 40,
        "",
        "📈 Work History Features:",
        f"  • Proofs (7 days):   {features['shift_count_7d']:.0f}",
        f"  • Proofs (30 days):  {features['shift_count_30d']:.0f}",
        f"  • Rating Band:       {features['avg_rating_band']:.2f}/5.0",
        f"  • Consistency:       {features['earnings_consistency']:.1%}",
        f"  • Days Since Last:   {features['recency_days']:.0f}",
        "",
        "🎯 Risk Assessment:",
        f"  • Trust Score:       {trust_score}/10000",
        f"  • Default Prob:      {pd/10000:.2f}%",
        "",
        "💰 Approved Terms:",
        f"  • Credit Limit:      ${terms['credit_limit']/1_000_000:,.2f}",
        f"  • APR:               {terms['apr_bps']/100:.2f}%",
        f"  • Max Tenure:        {terms['tenure_days']} days",
    ]
    
    return "\n".join(lines)
