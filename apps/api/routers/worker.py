"""
Worker Summary Router

Public endpoint to get worker summary by wallet address.
Used by the Work Proofs frontend page.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timedelta

from database import get_db, Worker, ShiftLog, PerformanceReview, Project

router = APIRouter(prefix="/worker", tags=["worker"])


# === Response Models ===

class WorkerInfo(BaseModel):
    id: int
    full_name: str
    project: Optional[str]
    rate_per_hour: int


class WorkerTotals(BaseModel):
    total_proofs: int  # number of shifts
    work_units_total: float
    total_earned: int  # in ₹


class WorkerWindows(BaseModel):
    hours_7d: float
    hours_30d: float


class RecentReview(BaseModel):
    rating: int
    comment: Optional[str]
    reviewer_name: Optional[str]
    review_date: date


class ReviewStats(BaseModel):
    avg_rating: Optional[float]
    recent: List[RecentReview]


class RecentShift(BaseModel):
    date: date
    project: str
    hours: float
    earned: int
    notes: Optional[str]


class WorkHistory(BaseModel):
    recent_shifts: List[RecentShift]


class WorkerSummaryResponse(BaseModel):
    linked: bool
    message: Optional[str] = None
    worker: Optional[WorkerInfo] = None
    totals: Optional[WorkerTotals] = None
    windows: Optional[WorkerWindows] = None
    reviews: Optional[ReviewStats] = None
    history: Optional[WorkHistory] = None


# === Worker Summary Endpoint ===

@router.get("/summary", response_model=WorkerSummaryResponse)
def get_worker_summary(
    wallet: str = Query(..., description="Worker wallet address (0x...)"),
    db: Session = Depends(get_db)
):
    """
    Get worker summary by wallet address.
    Returns linked status and worker details if wallet is linked.
    """
    # Normalize wallet address
    wallet = wallet.lower() if wallet else wallet
    
    # Find worker by wallet
    db_worker = db.query(Worker).filter(
        func.lower(Worker.wallet_address) == wallet
    ).first()
    
    if not db_worker:
        return WorkerSummaryResponse(
            linked=False,
            message="Wallet not linked to a worker profile. Ask manager to link."
        )
    
    # Get project info
    project_name = db_worker.project.name if db_worker.project else "Unassigned"
    rate = db_worker.rate_per_hour or (db_worker.project.default_rate_per_hour if db_worker.project else 0)
    
    # Get all shifts for this worker
    shifts = db.query(ShiftLog).filter(ShiftLog.worker_id == db_worker.id).all()
    
    # Calculate totals
    total_work_units = 0.0
    total_earned = 0
    
    for shift in shifts:
        shift_project = db.query(Project).filter(Project.id == shift.project_id).first()
        shift_rate = db_worker.rate_per_hour or (shift_project.default_rate_per_hour if shift_project else 0)
        earned = int(shift.hours_worked * shift_rate)
        total_earned += earned
        total_work_units += shift.work_units or shift.hours_worked
    
    # Calculate time windows
    today = date.today()
    seven_days_ago = today - timedelta(days=7)
    thirty_days_ago = today - timedelta(days=30)
    
    def _shift_date(s) -> date:
        """Ensure shift date is a date object (handles string from DB)."""
        if isinstance(s.date, str):
            return date.fromisoformat(s.date)
        return s.date
    
    hours_7d = sum(s.hours_worked for s in shifts if _shift_date(s) >= seven_days_ago)
    hours_30d = sum(s.hours_worked for s in shifts if _shift_date(s) >= thirty_days_ago)
    
    # Get reviews
    reviews = db.query(PerformanceReview).filter(
        PerformanceReview.worker_id == db_worker.id
    ).order_by(PerformanceReview.review_date.desc()).limit(5).all()
    
    avg_rating = None
    if reviews:
        all_reviews = db.query(PerformanceReview).filter(
            PerformanceReview.worker_id == db_worker.id
        ).all()
        avg_rating = sum(r.rating for r in all_reviews) / len(all_reviews) if all_reviews else None
    
    recent_reviews = [
        RecentReview(
            rating=r.rating,
            comment=r.comment,
            reviewer_name=r.reviewer_name,
            review_date=r.review_date
        )
        for r in reviews
    ]
    
    # Get recent shifts with earnings
    recent_shifts = db.query(ShiftLog).filter(
        ShiftLog.worker_id == db_worker.id
    ).order_by(ShiftLog.date.desc()).limit(20).all()
    
    recent_shift_responses = []
    for s in recent_shifts:
        shift_project = db.query(Project).filter(Project.id == s.project_id).first()
        shift_rate = db_worker.rate_per_hour or (shift_project.default_rate_per_hour if shift_project else 0)
        earned = int(s.hours_worked * shift_rate)
        
        recent_shift_responses.append(RecentShift(
            date=s.date,
            project=shift_project.name if shift_project else "Unknown",
            hours=s.hours_worked,
            earned=earned,
            notes=s.notes
        ))
    
    return WorkerSummaryResponse(
        linked=True,
        worker=WorkerInfo(
            id=db_worker.id,
            full_name=db_worker.full_name,
            project=project_name,
            rate_per_hour=rate
        ),
        totals=WorkerTotals(
            total_proofs=len(shifts),
            work_units_total=total_work_units,
            total_earned=total_earned
        ),
        windows=WorkerWindows(
            hours_7d=hours_7d,
            hours_30d=hours_30d
        ),
        reviews=ReviewStats(
            avg_rating=round(avg_rating, 1) if avg_rating else None,
            recent=recent_reviews
        ),
        history=WorkHistory(
            recent_shifts=recent_shift_responses
        )
    )
