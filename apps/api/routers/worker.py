"""
Worker Summary Router (P3-1 Enhanced)

Public endpoints to get worker summary by wallet address.
Includes totals by unit_type, by project, and Groq-powered earnings analysis.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import date, datetime, timedelta
import json
import httpx

from database import get_db, Worker, ShiftLog, PerformanceReview, Project, WorkTypeModel
from settings import get_settings

router = APIRouter(prefix="/worker", tags=["worker"])


# === Response Models ===

class WorkerInfo(BaseModel):
    id: int
    full_name: str
    project: Optional[str]
    rate_per_hour: int
    rate_per_unit: Optional[int] = None

class WorkerTotals(BaseModel):
    total_proofs: int
    work_units_total: float
    total_earned: int

class WorkerWindows(BaseModel):
    hours_7d: float
    hours_30d: float
    earned_7d: int
    earned_30d: int

class RecentReview(BaseModel):
    rating: int
    comment: Optional[str]
    reviewer_name: Optional[str]
    review_date: date
    tags: Optional[List[str]] = None
    review_source: Optional[str] = None

class ReviewStats(BaseModel):
    avg_rating: Optional[float]
    count: int = 0
    recent: List[RecentReview]

class RecentShift(BaseModel):
    date: date
    project: str
    hours: float
    unit_type: str
    units_done: float
    rate_per_unit: int
    earned: int
    quality_score: Optional[int] = None
    notes: Optional[str]

class WorkHistory(BaseModel):
    recent_shifts: List[RecentShift]

class ProjectSummary(BaseModel):
    project_id: int
    project_name: str
    unit_type: str
    total_units: float
    total_earned: int
    log_count: int

class UnitTypeSummary(BaseModel):
    unit_type: str
    total_units: float
    total_earned: int
    log_count: int

class WorkerSummaryResponse(BaseModel):
    linked: bool
    message: Optional[str] = None
    worker: Optional[WorkerInfo] = None
    totals: Optional[WorkerTotals] = None
    windows: Optional[WorkerWindows] = None
    reviews: Optional[ReviewStats] = None
    history: Optional[WorkHistory] = None
    by_project: Optional[List[ProjectSummary]] = None
    by_unit_type: Optional[List[UnitTypeSummary]] = None
    last_activity: Optional[str] = None

class EarningsAnalysis(BaseModel):
    summary: str
    prediction_30d: Optional[int] = None
    insights: List[str] = []
    recommendations: List[str] = []


# === Helpers ===

def _shift_date(s) -> date:
    if isinstance(s.date, str):
        return date.fromisoformat(s.date)
    return s.date


def _get_shift_earned(s, worker, db) -> int:
    """Get earned from stored value or recompute."""
    if s.earned and s.earned > 0:
        return s.earned
    project = db.query(Project).filter(Project.id == s.project_id).first()
    rate = s.rate_per_unit or 0
    if not rate:
        rate = getattr(worker, "rate_per_unit", 0) or 0
    if not rate:
        rate = getattr(worker, "rate_per_hour", 0) or 0
    if not rate and project:
        rate = project.default_unit_rate or project.default_rate_per_hour or 0
    units = s.units_done or s.work_units or s.hours_worked or 0
    return round(units * rate)


# === Worker Summary Endpoint ===

@router.get("/summary", response_model=WorkerSummaryResponse)
def get_worker_summary(
    wallet: str = Query(..., description="Worker wallet address (0x...)"),
    db: Session = Depends(get_db)
):
    wallet = wallet.lower() if wallet else wallet
    db_worker = db.query(Worker).filter(
        func.lower(Worker.wallet_address) == wallet
    ).first()

    if not db_worker:
        return WorkerSummaryResponse(
            linked=False,
            message="Wallet not linked to a worker profile. Ask manager to link."
        )

    project_name = db_worker.project.name if db_worker.project else "Unassigned"
    rate = db_worker.rate_per_unit or db_worker.rate_per_hour or (
        db_worker.project.default_unit_rate or db_worker.project.default_rate_per_hour if db_worker.project else 0
    )

    # All shifts
    shifts = db.query(ShiftLog).filter(ShiftLog.worker_id == db_worker.id).all()

    today = date.today()
    seven_days_ago = today - timedelta(days=7)
    thirty_days_ago = today - timedelta(days=30)

    total_work_units = 0.0
    total_earned = 0
    earned_7d = 0
    earned_30d = 0
    hours_7d = 0.0
    hours_30d = 0.0
    last_activity = None

    # By project and by unit_type aggregations
    proj_agg: Dict[int, Dict[str, Any]] = {}
    unit_agg: Dict[str, Dict[str, Any]] = {}

    for s in shifts:
        earned = _get_shift_earned(s, db_worker, db)
        units = s.units_done or s.work_units or s.hours_worked or 0
        ut = s.unit_type or "HOURS"
        sd = _shift_date(s)

        total_earned += earned
        total_work_units += units

        if sd >= seven_days_ago:
            hours_7d += s.hours_worked or 0
            earned_7d += earned
        if sd >= thirty_days_ago:
            hours_30d += s.hours_worked or 0
            earned_30d += earned

        if last_activity is None or sd > last_activity:
            last_activity = sd

        # By project
        pid = s.project_id
        if pid not in proj_agg:
            proj = db.query(Project).filter(Project.id == pid).first()
            proj_agg[pid] = {"name": proj.name if proj else "Unknown", "unit_type": ut, "units": 0, "earned": 0, "count": 0}
        proj_agg[pid]["units"] += units
        proj_agg[pid]["earned"] += earned
        proj_agg[pid]["count"] += 1

        # By unit type
        if ut not in unit_agg:
            unit_agg[ut] = {"units": 0, "earned": 0, "count": 0}
        unit_agg[ut]["units"] += units
        unit_agg[ut]["earned"] += earned
        unit_agg[ut]["count"] += 1

    # Reviews
    all_reviews = db.query(PerformanceReview).filter(
        PerformanceReview.worker_id == db_worker.id
    ).order_by(PerformanceReview.review_date.desc()).all()
    avg_rating = sum(r.rating for r in all_reviews) / len(all_reviews) if all_reviews else None
    recent_reviews = [
        RecentReview(
            rating=r.rating, comment=r.comment,
            reviewer_name=r.reviewer_name, review_date=r.review_date,
            tags=r.tags if hasattr(r, "tags") else None,
            review_source=r.review_source if hasattr(r, "review_source") else None,
        )
        for r in all_reviews[:5]
    ]

    # Recent shifts
    recent_shifts_db = db.query(ShiftLog).filter(
        ShiftLog.worker_id == db_worker.id
    ).order_by(ShiftLog.date.desc()).limit(20).all()

    recent_shift_list = []
    for s in recent_shifts_db:
        proj = db.query(Project).filter(Project.id == s.project_id).first()
        earned = _get_shift_earned(s, db_worker, db)
        recent_shift_list.append(RecentShift(
            date=s.date, project=proj.name if proj else "Unknown",
            hours=s.hours_worked or 0,
            unit_type=s.unit_type or "HOURS",
            units_done=s.units_done or s.work_units or s.hours_worked or 0,
            rate_per_unit=s.rate_per_unit or 0,
            earned=earned,
            quality_score=s.quality_score if hasattr(s, "quality_score") else None,
            notes=s.notes,
        ))

    by_project = [
        ProjectSummary(
            project_id=pid, project_name=v["name"],
            unit_type=v["unit_type"], total_units=round(v["units"], 2),
            total_earned=v["earned"], log_count=v["count"],
        )
        for pid, v in proj_agg.items()
    ]

    by_unit_type = [
        UnitTypeSummary(
            unit_type=ut, total_units=round(v["units"], 2),
            total_earned=v["earned"], log_count=v["count"],
        )
        for ut, v in unit_agg.items()
    ]

    return WorkerSummaryResponse(
        linked=True,
        worker=WorkerInfo(
            id=db_worker.id, full_name=db_worker.full_name,
            project=project_name, rate_per_hour=rate or 0,
            rate_per_unit=db_worker.rate_per_unit,
        ),
        totals=WorkerTotals(
            total_proofs=len(shifts),
            work_units_total=round(total_work_units, 2),
            total_earned=total_earned,
        ),
        windows=WorkerWindows(
            hours_7d=round(hours_7d, 1), hours_30d=round(hours_30d, 1),
            earned_7d=earned_7d, earned_30d=earned_30d,
        ),
        reviews=ReviewStats(
            avg_rating=round(avg_rating, 1) if avg_rating else None,
            count=len(all_reviews),
            recent=recent_reviews,
        ),
        history=WorkHistory(recent_shifts=recent_shift_list),
        by_project=by_project,
        by_unit_type=by_unit_type,
        last_activity=last_activity.isoformat() if last_activity else None,
    )


# === By-Project Summary (for charts) ===

@router.get("/summary/by-project")
def get_summary_by_project(
    wallet: str = Query(...),
    db: Session = Depends(get_db)
):
    wallet = wallet.lower()
    db_worker = db.query(Worker).filter(func.lower(Worker.wallet_address) == wallet).first()
    if not db_worker:
        return {"linked": False, "projects": []}

    shifts = db.query(ShiftLog).filter(ShiftLog.worker_id == db_worker.id).all()
    proj_agg: Dict[int, Dict[str, Any]] = {}
    for s in shifts:
        pid = s.project_id
        earned = _get_shift_earned(s, db_worker, db)
        units = s.units_done or s.work_units or s.hours_worked or 0
        if pid not in proj_agg:
            proj = db.query(Project).filter(Project.id == pid).first()
            proj_agg[pid] = {"name": proj.name if proj else "Unknown", "unit_type": s.unit_type or "HOURS", "units": 0, "earned": 0, "count": 0}
        proj_agg[pid]["units"] += units
        proj_agg[pid]["earned"] += earned
        proj_agg[pid]["count"] += 1

    return {
        "linked": True,
        "projects": [
            {"project_id": pid, "project_name": v["name"], "unit_type": v["unit_type"],
             "total_units": round(v["units"], 2), "total_earned": v["earned"], "log_count": v["count"]}
            for pid, v in proj_agg.items()
        ]
    }


# === Groq-Powered Earnings Analysis ===

@router.get("/analysis", response_model=EarningsAnalysis)
async def get_earnings_analysis(
    wallet: str = Query(...),
    db: Session = Depends(get_db)
):
    """Use Groq LLM to analyze worker earnings and predict future income."""
    settings = get_settings()
    wallet = wallet.lower()

    db_worker = db.query(Worker).filter(func.lower(Worker.wallet_address) == wallet).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    shifts = db.query(ShiftLog).filter(ShiftLog.worker_id == db_worker.id).order_by(ShiftLog.date.desc()).limit(30).all()
    reviews = db.query(PerformanceReview).filter(PerformanceReview.worker_id == db_worker.id).all()

    if not shifts:
        return EarningsAnalysis(
            summary="No work logs found. Start logging work to get earnings analysis.",
            insights=["No data available yet"],
            recommendations=["Ask your manager to log your shifts"],
        )

    # Build data summary for Groq
    total_earned = sum(_get_shift_earned(s, db_worker, db) for s in shifts)
    total_units = sum(s.units_done or s.work_units or s.hours_worked or 0 for s in shifts)
    avg_quality = 0
    quality_count = 0
    for s in shifts:
        if hasattr(s, "quality_score") and s.quality_score:
            avg_quality += s.quality_score
            quality_count += 1
    avg_quality = round(avg_quality / quality_count) if quality_count else 0

    avg_rating = round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else 0

    today = date.today()
    days_active = (today - _shift_date(shifts[-1])).days + 1 if shifts else 1
    daily_avg_earned = round(total_earned / max(days_active, 1))

    data_summary = f"""Worker: {db_worker.full_name}
Total work logs: {len(shifts)}
Total earned: Rs.{total_earned}
Total units: {total_units}
Days active: {days_active}
Daily avg earned: Rs.{daily_avg_earned}
Avg quality score: {avg_quality}/100
Avg review rating: {avg_rating}/5
Reviews count: {len(reviews)}
Recent shifts (last 5):
"""
    for s in shifts[:5]:
        earned = _get_shift_earned(s, db_worker, db)
        data_summary += f"  - {s.date}: {s.units_done or s.hours_worked} {s.unit_type or 'HOURS'}, earned Rs.{earned}, quality={s.quality_score or 'N/A'}\n"

    # Call Groq for analysis
    api_key = settings.GROQ_API_KEY
    if not api_key:
        return EarningsAnalysis(
            summary=f"Worker has earned Rs.{total_earned} from {len(shifts)} logs over {days_active} days (Rs.{daily_avg_earned}/day avg).",
            prediction_30d=daily_avg_earned * 30,
            insights=[f"Average daily earnings: Rs.{daily_avg_earned}", f"Quality score: {avg_quality}/100"],
            recommendations=["Configure GROQ_API_KEY for AI-powered analysis"],
        )

    system_prompt = """You are a financial analyst for worker earnings. Analyze the data and return JSON:
{
  "summary": "2-3 sentence analysis of earnings pattern",
  "prediction_30d": integer predicted earnings for next 30 days in rupees,
  "insights": ["insight1", "insight2", "insight3"],
  "recommendations": ["rec1", "rec2"]
}
Be specific with numbers. Base prediction on actual daily averages and trends. Return ONLY valid JSON."""

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": data_summary},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 400,
                    "response_format": {"type": "json_object"},
                },
            )

        if resp.status_code == 200:
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
            parsed = json.loads(content)
            return EarningsAnalysis(
                summary=parsed.get("summary", f"Earned Rs.{total_earned} total"),
                prediction_30d=parsed.get("prediction_30d", daily_avg_earned * 30),
                insights=parsed.get("insights", [])[:5],
                recommendations=parsed.get("recommendations", [])[:3],
            )
    except Exception as e:
        print(f"  [ANALYSIS] Groq error: {e}")

    # Fallback
    return EarningsAnalysis(
        summary=f"Worker has earned Rs.{total_earned} from {len(shifts)} work logs over {days_active} days.",
        prediction_30d=daily_avg_earned * 30,
        insights=[f"Daily average: Rs.{daily_avg_earned}", f"Quality: {avg_quality}/100", f"Rating: {avg_rating}/5"],
        recommendations=["Maintain consistency to improve credit score"],
    )
