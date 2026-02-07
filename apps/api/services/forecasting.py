"""
Income Forecasting Service for UnEmpower.

Provides 14-day and 30-day income forecasts using exponential smoothing
and weighted moving averages over worker's historical earnings.
"""

from datetime import datetime, timedelta
from typing import Dict, Optional, List
import math

from services.features import get_worker_features, get_workproof_history


# Deterministic seed for reproducibility
RANDOM_SEED = 42


def exponential_smoothing(data: List[float], alpha: float = 0.3) -> List[float]:
    """
    Simple exponential smoothing.
    
    Args:
        data: Time series data
        alpha: Smoothing factor (0-1), higher = more weight on recent
        
    Returns:
        Smoothed series
    """
    if not data:
        return []
    
    smoothed = [data[0]]
    for i in range(1, len(data)):
        smoothed.append(alpha * data[i] + (1 - alpha) * smoothed[-1])
    
    return smoothed


def weighted_moving_average(data: List[float], window: int = 7) -> float:
    """
    Weighted moving average with more weight on recent values.
    """
    if not data:
        return 0.0
    
    # Take last 'window' items
    recent = data[-window:] if len(data) >= window else data
    
    # Linear weights: [1, 2, 3, ..., n]
    weights = list(range(1, len(recent) + 1))
    weight_sum = sum(weights)
    
    weighted_sum = sum(v * w for v, w in zip(recent, weights))
    return weighted_sum / weight_sum if weight_sum > 0 else 0.0


def forecast_income(worker: str, db=None) -> Dict:
    """
    Generate income forecast for a worker.
    
    Returns:
        {
            "expectedIncome_14d": float,
            "expectedIncome_30d": float,
            "incomeVolatility": float (0-1),
            "confidence": float (0-1),
            "method": str,
            "dataPoints": int
        }
    """
    # Get features and history
    features = get_worker_features(worker, db)
    history = get_workproof_history(worker, days=60, db=db)  # Use 60 days for better forecast
    
    # If no history, return zero forecast
    if not history:
        return {
            "expectedIncome_14d": 0.0,
            "expectedIncome_30d": 0.0,
            "incomeVolatility": 0.0,
            "incomeVolatilityLabel": "UNKNOWN",
            "confidence": 0.0,
            "confidenceLabel": "NO_DATA",
            "method": "no_data",
            "dataPoints": 0,
            "worker": worker,
            "forecastedAt": datetime.utcnow().isoformat(),
        }
    
    # === Extract daily earnings time series ===
    # Group earnings by day
    daily_earnings: Dict[str, float] = {}
    for wp in history:
        try:
            earned = int(wp["earnedAmount"]) / 1_000_000  # Convert to USDC
            date_key = datetime.fromtimestamp(wp["timestamp"]).strftime("%Y-%m-%d")
            daily_earnings[date_key] = daily_earnings.get(date_key, 0) + earned
        except:
            pass
    
    if not daily_earnings:
        return {
            "expectedIncome_14d": 0.0,
            "expectedIncome_30d": 0.0,
            "incomeVolatility": 0.0,
            "incomeVolatilityLabel": "UNKNOWN",
            "confidence": 0.0,
            "confidenceLabel": "NO_DATA",
            "method": "no_earnings",
            "dataPoints": 0,
            "worker": worker,
            "forecastedAt": datetime.utcnow().isoformat(),
        }
    
    # === Build continuous daily series (fill zeros for missing days) ===
    sorted_dates = sorted(daily_earnings.keys())
    start_date = datetime.strptime(sorted_dates[0], "%Y-%m-%d")
    end_date = datetime.strptime(sorted_dates[-1], "%Y-%m-%d")
    
    daily_series = []
    current = start_date
    while current <= end_date:
        key = current.strftime("%Y-%m-%d")
        daily_series.append(daily_earnings.get(key, 0.0))
        current += timedelta(days=1)
    
    data_points = len([d for d in daily_series if d > 0])
    
    # === Apply exponential smoothing ===
    smoothed = exponential_smoothing(daily_series, alpha=0.3)
    
    # === Calculate forecasts ===
    # Use weighted moving average of recent smoothed values
    if len(smoothed) >= 7:
        avg_daily = weighted_moving_average(smoothed, window=7)
    else:
        avg_daily = sum(smoothed) / len(smoothed) if smoothed else 0.0
    
    # Also consider work frequency trend
    work_rate = features.get("workproofRatePerDay_7d", 0)
    earnings_mean = features.get("earningsBandMean_30d", 0)
    
    # Blend: 70% time series forecast + 30% feature-based estimate
    ts_forecast_daily = avg_daily
    feature_forecast_daily = work_rate * earnings_mean * 10  # Band to approximate USDC
    
    blended_daily = 0.7 * ts_forecast_daily + 0.3 * feature_forecast_daily
    
    expected_14d = blended_daily * 14
    expected_30d = blended_daily * 30
    
    # === Calculate volatility ===
    if len(daily_series) > 1:
        mean = sum(daily_series) / len(daily_series)
        if mean > 0:
            variance = sum((d - mean) ** 2 for d in daily_series) / len(daily_series)
            std = math.sqrt(variance)
            volatility = min(1.0, std / mean)  # Coefficient of variation, capped at 1
        else:
            volatility = 0.0
    else:
        volatility = 0.0
    
    # Volatility label
    if volatility < 0.3:
        vol_label = "LOW"
    elif volatility < 0.6:
        vol_label = "MEDIUM"
    else:
        vol_label = "HIGH"
    
    # === Confidence score ===
    # Based on data quantity and consistency
    confidence = 0.0
    
    # More data = higher confidence
    if data_points >= 20:
        confidence += 0.4
    elif data_points >= 10:
        confidence += 0.3
    elif data_points >= 5:
        confidence += 0.2
    else:
        confidence += 0.1
    
    # Lower volatility = higher confidence
    confidence += 0.3 * (1 - volatility)
    
    # Recent activity boost
    recency = features.get("recencyHours", 999)
    if recency < 24:
        confidence += 0.2
    elif recency < 72:
        confidence += 0.1
    
    # Rating stability boost
    rating_trend = abs(features.get("ratingTrend_30d", 0))
    if rating_trend < 0.3:
        confidence += 0.1
    
    confidence = min(1.0, confidence)
    
    # Confidence label
    if confidence >= 0.7:
        conf_label = "HIGH"
    elif confidence >= 0.4:
        conf_label = "MEDIUM"
    else:
        conf_label = "LOW"
    
    return {
        "expectedIncome_14d": round(expected_14d, 2),
        "expectedIncome_30d": round(expected_30d, 2),
        "avgDailyIncome": round(blended_daily, 2),
        "incomeVolatility": round(volatility, 3),
        "incomeVolatilityLabel": vol_label,
        "confidence": round(confidence, 2),
        "confidenceLabel": conf_label,
        "method": "exp_smoothing_wma",
        "dataPoints": data_points,
        "seriesLength": len(daily_series),
        "worker": worker,
        "forecastedAt": datetime.utcnow().isoformat(),
    }
