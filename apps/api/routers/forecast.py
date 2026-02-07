"""
Forecast router for income predictions.
"""

from fastapi import APIRouter, Query, HTTPException

from services.forecasting import forecast_income


router = APIRouter(prefix="/forecast", tags=["Forecast"])


@router.get("/worker")
async def get_worker_forecast(worker: str = Query(..., description="Worker address (0x...)")):
    """
    Get 14-day and 30-day income forecast for a worker.
    
    Uses exponential smoothing and weighted moving averages over historical earnings.
    """
    if not worker.startswith("0x") or len(worker) != 42:
        raise HTTPException(status_code=400, detail="Invalid worker address format")
    
    forecast = forecast_income(worker)
    return {
        "status": "success",
        "forecast": forecast,
    }
