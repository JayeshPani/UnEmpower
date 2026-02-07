"""
Default Early Warning Service for UnEmpower.

Predicts default risk for next 7 and 14 days based on:
- Work activity decline
- Rising anomaly scores
- Low repayment ratio
- High income volatility
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional

from services.features import get_worker_features
from services.forecasting import forecast_income
from services.fraud import compute_anomaly_score


def compute_early_warning(worker: str, db=None) -> Dict:
    """
    Compute default risk prediction for a worker.
    
    Returns:
        {
            "riskScore": int (0-100),
            "riskLevel": str,
            "defaultRiskNext7d": float (0-1),
            "defaultRiskNext14d": float (0-1),
            "reasons": List[str],
            "signals": Dict,
            "worker": str,
            "analyzedAt": str
        }
    """
    # Get all input signals
    features = get_worker_features(worker, db)
    forecast = forecast_income(worker, db)
    fraud = compute_anomaly_score(worker, db)
    
    signals = {}
    reasons = []
    risk_score = 0
    
    # === Signal 1: Work activity decline ===
    shift_7d = features.get("shiftCount_7d", 0)
    shift_14d = features.get("shiftCount_14d", 0)
    shift_30d = features.get("shiftCount_30d", 0)
    
    # Compare 7d to expected (based on 30d average)
    expected_7d = (shift_30d / 30) * 7 if shift_30d > 0 else 0
    
    if expected_7d > 0 and shift_7d < expected_7d * 0.5:
        # Activity dropped significantly
        decline_pct = int((1 - shift_7d / expected_7d) * 100)
        decline_score = min(25, int(decline_pct * 0.3))
        risk_score += decline_score
        signals["activityDecline"] = {
            "shift7d": shift_7d,
            "expected7d": round(expected_7d, 1),
            "declinePercent": decline_pct,
            "contribution": decline_score
        }
        reasons.append(f"Work activity down {decline_pct}% vs expected")
    
    # === Signal 2: Anomaly score ===
    anomaly_score = fraud.get("anomalyScore", 0)
    
    if anomaly_score >= 60:
        anomaly_contribution = min(25, int(anomaly_score * 0.3))
        risk_score += anomaly_contribution
        signals["anomalyRisk"] = {
            "anomalyScore": anomaly_score,
            "contribution": anomaly_contribution
        }
        reasons.append(f"High anomaly score: {anomaly_score}")
    
    # === Signal 3: Repayment ratio ===
    repay_ratio = features.get("repayRatio_30d", 1.0)
    loan_count = features.get("loanCount_30d", 0)
    
    if loan_count >= 1 and repay_ratio < 0.7:
        repay_contribution = min(30, int((1 - repay_ratio) * 40))
        risk_score += repay_contribution
        signals["repaymentRisk"] = {
            "repayRatio": repay_ratio,
            "loanCount": loan_count,
            "contribution": repay_contribution
        }
        reasons.append(f"Low repayment history: {repay_ratio*100:.0f}%")
    
    # === Signal 4: Income volatility ===
    volatility = forecast.get("incomeVolatility", 0)
    
    if volatility > 0.5:
        vol_contribution = min(15, int(volatility * 20))
        risk_score += vol_contribution
        signals["volatilityRisk"] = {
            "incomeVolatility": volatility,
            "contribution": vol_contribution
        }
        reasons.append(f"High income volatility: {volatility*100:.0f}%")
    
    # === Signal 5: Low forecast income ===
    forecast_14d = forecast.get("expectedIncome_14d", 0)
    
    if forecast_14d < 10 and features.get("totalWorkProofs", 0) > 5:
        # Had activity but forecast is low
        forecast_contribution = min(15, int((10 - forecast_14d) * 1.5))
        risk_score += forecast_contribution
        signals["lowForecast"] = {
            "expectedIncome14d": forecast_14d,
            "contribution": forecast_contribution
        }
        reasons.append(f"Low income forecast: ${forecast_14d:.2f} next 14d")
    
    # === Signal 6: Recency (long absence) ===
    recency = features.get("recencyHours", 0)
    
    if recency > 168 and features.get("totalWorkProofs", 0) > 3:  # > 1 week
        recency_contribution = min(10, int((recency - 168) / 24 * 2))
        risk_score += recency_contribution
        signals["recencyRisk"] = {
            "recencyHours": recency,
            "contribution": recency_contribution
        }
        reasons.append(f"Inactive for {int(recency/24)} days")
    
    # === Cap and calculate probabilities ===
    risk_score = min(100, risk_score)
    
    # Convert to probability estimates
    # Simple logistic-style mapping
    default_risk_7d = min(0.99, risk_score / 120)  # 7d risk is closer
    default_risk_14d = min(0.99, risk_score / 150)  # 14d risk slightly lower
    
    # Risk level
    if risk_score >= 75:
        risk_level = "CRITICAL"
    elif risk_score >= 50:
        risk_level = "HIGH"
    elif risk_score >= 25:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"
    
    return {
        "riskScore": risk_score,
        "riskLevel": risk_level,
        "defaultRiskNext7d": round(default_risk_7d, 3),
        "defaultRiskNext14d": round(default_risk_14d, 3),
        "reasons": reasons if reasons else ["No significant risk signals detected"],
        "signals": signals,
        "inputSummary": {
            "shiftCount7d": shift_7d,
            "repayRatio30d": repay_ratio,
            "anomalyScore": anomaly_score,
            "incomeVolatility": volatility,
            "forecastIncome14d": forecast_14d,
        },
        "worker": worker,
        "analyzedAt": datetime.utcnow().isoformat(),
    }
