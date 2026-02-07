"""
Borrowing Coach Service for UnEmpower.

Provides personalized borrowing nudges and recommendations based on:
- Worker's income forecast
- Credit risk signals
- Requested amount vs safe limits
"""

from datetime import datetime
from typing import Dict, List, Optional

from services.features import get_worker_features
from services.forecasting import forecast_income
from services.early_warning import compute_early_warning


# Policy thresholds
SAFE_BORROW_RATIO = 0.5  # Max borrow = 50% of forecasted 14d income
HIGH_RISK_BORROW_RATIO = 0.3  # If high risk, lower to 30%


def generate_coach_nudge(
    worker: str,
    requested_amount: int,  # In USDC (6 decimals)
    offer: Dict,  # {creditLimit, aprBps, tenureDays}
    db=None
) -> Dict:
    """
    Generate borrowing coach recommendations.
    
    Args:
        worker: Worker address
        requested_amount: Amount worker wants to borrow (in micro USDC)
        offer: Current offer terms
        
    Returns:
        {
            "recommendedAmount": int,
            "message": str,
            "riskLabel": str,
            "tips": List[str],
            "analysis": Dict
        }
    """
    # Get signals
    features = get_worker_features(worker, db)
    forecast = forecast_income(worker, db)
    warning = compute_early_warning(worker, db)
    
    # Parse offer
    credit_limit = offer.get("creditLimit", 0)
    apr_bps = offer.get("aprBps", 1800)
    tenure_days = offer.get("tenureDays", 14)
    
    # Convert to USDC units (assuming amounts in micro USDC = 6 decimals)
    requested_usdc = requested_amount / 1_000_000
    credit_limit_usdc = credit_limit / 1_000_000
    
    # Get forecast income
    forecast_14d = forecast.get("expectedIncome_14d", 0)
    forecast_30d = forecast.get("expectedIncome_30d", 0)
    
    # Risk assessment
    risk_score = warning.get("riskScore", 0)
    
    # Determine risk label and borrow ratio
    if risk_score >= 60:
        risk_label = "HIGH"
        safe_ratio = HIGH_RISK_BORROW_RATIO
    elif risk_score >= 30:
        risk_label = "MEDIUM"
        safe_ratio = 0.4
    else:
        risk_label = "LOW"
        safe_ratio = SAFE_BORROW_RATIO
    
    # Calculate safe amount (based on forecast)
    safe_amount_usdc = forecast_14d * safe_ratio
    safe_amount = int(safe_amount_usdc * 1_000_000)
    
    # Cap at credit limit
    recommended_usdc = min(safe_amount_usdc, credit_limit_usdc)
    recommended = int(recommended_usdc * 1_000_000)
    
    # Generate message and tips
    tips = []
    
    # Tip 1: Forecast-based
    if forecast_14d > 0:
        tips.append(f"Your expected income next 14 days is ${forecast_14d:.2f}")
    else:
        tips.append("Build more work history to get better loan terms")
    
    # Tip 2: Amount recommendation
    if requested_usdc > recommended_usdc:
        tips.append(f"Consider borrowing ${recommended_usdc:.2f} or less to stay safe")
        if requested_usdc > credit_limit_usdc:
            tips.append(f"Your request exceeds your credit limit of ${credit_limit_usdc:.2f}")
    else:
        tips.append("Your requested amount is within safe limits ✓")
    
    # Tip 3: Risk-based
    if risk_label == "HIGH":
        tips.append("⚠️ High risk detected - consider a smaller loan or shorter tenure")
    elif risk_label == "MEDIUM":
        tips.append("Your risk level is moderate - maintain consistent work to improve terms")
    else:
        tips.append("Your risk profile is good - you may qualify for better rates over time")
    
    # Tip 4: APR awareness
    apr_pct = apr_bps / 100
    if tenure_days > 0:
        interest_estimate = (requested_usdc * (apr_bps / 10000) * tenure_days / 365)
        tips.append(f"Interest on ${requested_usdc:.2f} for {tenure_days} days: ~${interest_estimate:.2f}")
    
    # Tip 5: Repayment
    repay_ratio = features.get("repayRatio_30d", 1.0)
    if repay_ratio < 0.8:
        tips.append("💡 Repaying on time will improve your credit score and lower your APR")
    
    # Generate main message
    if requested_usdc <= recommended_usdc and requested_usdc <= credit_limit_usdc:
        if risk_label == "LOW":
            message = f"Great choice! Borrowing ${requested_usdc:.2f} is well within your means."
        else:
            message = f"${requested_usdc:.2f} is within limits, but consider your risk level."
    elif requested_usdc > credit_limit_usdc:
        message = f"Your request of ${requested_usdc:.2f} exceeds your credit limit. Maximum available: ${credit_limit_usdc:.2f}"
    else:
        message = f"We recommend borrowing ${recommended_usdc:.2f} instead of ${requested_usdc:.2f} based on your income forecast."
    
    return {
        "recommendedAmount": recommended,
        "recommendedAmountUSDC": round(recommended_usdc, 2),
        "message": message,
        "riskLabel": risk_label,
        "tips": tips[:5],  # Max 5 tips
        "analysis": {
            "requestedAmount": requested_amount,
            "requestedAmountUSDC": round(requested_usdc, 2),
            "creditLimit": credit_limit,
            "creditLimitUSDC": round(credit_limit_usdc, 2),
            "safeAmount": safe_amount,
            "safeAmountUSDC": round(safe_amount_usdc, 2),
            "forecastIncome14d": forecast_14d,
            "safeRatio": safe_ratio,
            "riskScore": risk_score,
            "aprBps": apr_bps,
            "tenureDays": tenure_days,
        },
        "worker": worker,
        "generatedAt": datetime.utcnow().isoformat(),
    }
