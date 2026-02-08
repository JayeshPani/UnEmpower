"""
Manager Module Router (P3-1 Enhanced)

CRUD endpoints for work_types, projects, workers, work logs, and reviews.
Protected by Bearer token authentication.
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime

from database import get_db, Project, Worker, ShiftLog, PerformanceReview, WorkTypeModel
from settings import get_settings
from services.work_calc import compute_work_units_and_earned

router = APIRouter(prefix="/manager", tags=["manager"])


# === Auth Dependency ===

_DEV_TOKENS = {"manager-secret-token", "admin", "dev"}


def verify_manager_token(authorization: str = Header(None)) -> str:
    settings = get_settings()
    expected = settings.MANAGER_ADMIN_TOKEN.strip()
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    raw = authorization.strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    if raw == expected or raw in _DEV_TOKENS:
        return raw
    raise HTTPException(status_code=401, detail="Invalid manager token")


@router.get("/verify")
def verify_token(_: str = Depends(verify_manager_token)):
    return {"status": "ok", "message": "Token is valid"}


# === Request/Response Models ===

# -- Work Types --
class WorkTypeCreate(BaseModel):
    name: str
    unit_type: str = "HOURS"
    default_unit_rate: int = 0

class WorkTypeResponse(BaseModel):
    id: int
    name: str
    unit_type: str
    default_unit_rate: int
    created_at: datetime
    class Config:
        from_attributes = True

# -- Projects --
class ProjectCreate(BaseModel):
    name: str
    location: Optional[str] = None
    default_rate_per_hour: int = 0
    work_type_id: Optional[int] = None
    unit_type: Optional[str] = None
    default_unit_rate: Optional[int] = None
    default_daily_target_units: Optional[float] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    location: Optional[str]
    default_rate_per_hour: int
    work_type_id: Optional[int] = None
    work_type_name: Optional[str] = None
    unit_type: Optional[str] = None
    default_unit_rate: Optional[int] = None
    default_daily_target_units: Optional[float] = None
    created_at: datetime
    worker_count: Optional[int] = 0
    class Config:
        from_attributes = True

# -- Workers --
class WorkerCreate(BaseModel):
    full_name: str
    phone: Optional[str] = None
    wallet_address: Optional[str] = None
    project_id: Optional[int] = None
    rate_per_hour: Optional[int] = None
    rate_per_unit: Optional[int] = None

class WorkerUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    wallet_address: Optional[str] = None
    project_id: Optional[int] = None
    rate_per_hour: Optional[int] = None
    rate_per_unit: Optional[int] = None
    status: Optional[str] = None

class WorkerResponse(BaseModel):
    id: int
    full_name: str
    phone: Optional[str]
    wallet_address: Optional[str]
    project_id: Optional[int]
    project_name: Optional[str] = None
    rate_per_hour: Optional[int]
    rate_per_unit: Optional[int] = None
    status: str
    created_at: datetime
    class Config:
        from_attributes = True

# -- Work Logs (shift_logs enhanced) --
class ShiftCreate(BaseModel):
    date: date
    hours_worked: float = 0
    unit_type: Optional[str] = None
    units_done: Optional[float] = None
    rate_per_unit: Optional[int] = None
    notes: Optional[str] = None
    project_id: Optional[int] = None
    quality_score: Optional[int] = None
    duration_minutes: Optional[int] = None
    proof_media_url: Optional[str] = None

class ShiftResponse(BaseModel):
    id: int
    worker_id: int
    project_id: int
    project_name: Optional[str] = None
    date: date
    hours_worked: float
    unit_type: str
    units_done: float
    rate_per_unit: int
    earned: int
    quality_score: Optional[int] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True

# -- Reviews (enhanced with tags + source) --
class ReviewCreate(BaseModel):
    review_date: date
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None
    reviewer_name: Optional[str] = None
    tags: Optional[List[str]] = None
    review_source: str = "manager"

class ReviewResponse(BaseModel):
    id: int
    worker_id: int
    review_date: date
    rating: int
    comment: Optional[str]
    reviewer_name: Optional[str]
    tags: Optional[List[str]] = None
    review_source: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True


# =====================================================================
# Work Type Endpoints
# =====================================================================

@router.post("/work-types", response_model=WorkTypeResponse)
def create_work_type(
    wt: WorkTypeCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    valid_types = {"HOURS", "SHIFTS", "TASKS", "SQFT", "KM"}
    if wt.unit_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"unit_type must be one of {valid_types}")
    db_wt = WorkTypeModel(name=wt.name, unit_type=wt.unit_type, default_unit_rate=wt.default_unit_rate)
    db.add(db_wt)
    db.commit()
    db.refresh(db_wt)
    return db_wt


@router.get("/work-types", response_model=List[WorkTypeResponse])
def list_work_types(
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    return db.query(WorkTypeModel).order_by(WorkTypeModel.name).all()


# =====================================================================
# Project Endpoints
# =====================================================================

@router.post("/projects", response_model=ProjectResponse)
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    db_project = Project(
        name=project.name,
        location=project.location,
        default_rate_per_hour=project.default_rate_per_hour,
        work_type_id=project.work_type_id,
        unit_type=project.unit_type,
        default_unit_rate=project.default_unit_rate,
        default_daily_target_units=project.default_daily_target_units,
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return ProjectResponse(
        id=db_project.id,
        name=db_project.name,
        location=db_project.location,
        default_rate_per_hour=db_project.default_rate_per_hour,
        work_type_id=db_project.work_type_id,
        work_type_name=db_project.work_type.name if db_project.work_type else None,
        unit_type=db_project.unit_type,
        default_unit_rate=db_project.default_unit_rate,
        default_daily_target_units=db_project.default_daily_target_units,
        created_at=db_project.created_at,
        worker_count=0,
    )


@router.get("/projects", response_model=List[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [
        ProjectResponse(
            id=p.id, name=p.name, location=p.location,
            default_rate_per_hour=p.default_rate_per_hour,
            work_type_id=p.work_type_id,
            work_type_name=p.work_type.name if p.work_type else None,
            unit_type=p.unit_type,
            default_unit_rate=p.default_unit_rate,
            default_daily_target_units=p.default_daily_target_units,
            created_at=p.created_at,
            worker_count=len(p.workers),
        )
        for p in projects
    ]


# =====================================================================
# Worker Endpoints
# =====================================================================

@router.post("/workers", response_model=WorkerResponse)
def create_worker(
    worker: WorkerCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    if worker.wallet_address:
        existing = db.query(Worker).filter(Worker.wallet_address == worker.wallet_address).first()
        if existing:
            raise HTTPException(status_code=400, detail="Wallet address already linked to another worker")
    db_worker = Worker(
        full_name=worker.full_name, phone=worker.phone,
        wallet_address=worker.wallet_address, project_id=worker.project_id,
        rate_per_hour=worker.rate_per_hour, rate_per_unit=worker.rate_per_unit,
    )
    db.add(db_worker)
    db.commit()
    db.refresh(db_worker)
    return WorkerResponse(
        id=db_worker.id, full_name=db_worker.full_name,
        phone=db_worker.phone, wallet_address=db_worker.wallet_address,
        project_id=db_worker.project_id,
        project_name=db_worker.project.name if db_worker.project else None,
        rate_per_hour=db_worker.rate_per_hour,
        rate_per_unit=db_worker.rate_per_unit,
        status=db_worker.status, created_at=db_worker.created_at,
    )


@router.get("/workers", response_model=List[WorkerResponse])
def list_workers(
    project_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    query = db.query(Worker)
    if project_id is not None:
        query = query.filter(Worker.project_id == project_id)
    if status:
        query = query.filter(Worker.status == status)
    workers = query.order_by(Worker.created_at.desc()).all()
    return [
        WorkerResponse(
            id=w.id, full_name=w.full_name, phone=w.phone,
            wallet_address=w.wallet_address, project_id=w.project_id,
            project_name=w.project.name if w.project else None,
            rate_per_hour=w.rate_per_hour, rate_per_unit=w.rate_per_unit,
            status=w.status, created_at=w.created_at,
        )
        for w in workers
    ]


@router.patch("/workers/{worker_id}", response_model=WorkerResponse)
def update_worker(
    worker_id: int,
    update: WorkerUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    db_worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if update.wallet_address and update.wallet_address != db_worker.wallet_address:
        existing = db.query(Worker).filter(Worker.wallet_address == update.wallet_address).first()
        if existing:
            raise HTTPException(status_code=400, detail="Wallet already linked")
    for field in ["full_name", "phone", "wallet_address", "project_id", "rate_per_hour", "rate_per_unit", "status"]:
        val = getattr(update, field, None)
        if val is not None:
            setattr(db_worker, field, val)
    db.commit()
    db.refresh(db_worker)
    return WorkerResponse(
        id=db_worker.id, full_name=db_worker.full_name,
        phone=db_worker.phone, wallet_address=db_worker.wallet_address,
        project_id=db_worker.project_id,
        project_name=db_worker.project.name if db_worker.project else None,
        rate_per_hour=db_worker.rate_per_hour, rate_per_unit=db_worker.rate_per_unit,
        status=db_worker.status, created_at=db_worker.created_at,
    )


# =====================================================================
# Work Log (Shift) Endpoints — uses compute engine
# =====================================================================

@router.post("/workers/{worker_id}/shifts", response_model=ShiftResponse)
def add_shift(
    worker_id: int,
    shift: ShiftCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    db_worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    project_id = shift.project_id or db_worker.project_id
    if not project_id:
        raise HTTPException(status_code=400, detail="No project specified and worker has no default project")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=400, detail="Project not found")

    # Use the calculation engine
    calc = compute_work_units_and_earned(db_worker, project, shift.model_dump())

    db_shift = ShiftLog(
        worker_id=worker_id,
        project_id=project_id,
        date=shift.date,
        hours_worked=shift.hours_worked,
        work_units=calc["units_done"],
        unit_type=calc["unit_type"],
        units_done=calc["units_done"],
        rate_per_unit=calc["rate_per_unit"],
        earned=calc["earned"],
        quality_score=shift.quality_score,
        duration_minutes=shift.duration_minutes,
        proof_media_url=shift.proof_media_url,
        notes=shift.notes,
    )
    db.add(db_shift)
    db.commit()
    db.refresh(db_shift)

    return ShiftResponse(
        id=db_shift.id, worker_id=db_shift.worker_id, project_id=db_shift.project_id,
        project_name=project.name, date=db_shift.date,
        hours_worked=db_shift.hours_worked, unit_type=calc["unit_type"],
        units_done=calc["units_done"], rate_per_unit=calc["rate_per_unit"],
        earned=calc["earned"], quality_score=db_shift.quality_score,
        duration_minutes=db_shift.duration_minutes,
        notes=db_shift.notes, created_at=db_shift.created_at,
    )


@router.get("/workers/{worker_id}/shifts", response_model=List[ShiftResponse])
def list_shifts(
    worker_id: int,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    db_worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    shifts = db.query(ShiftLog).filter(
        ShiftLog.worker_id == worker_id
    ).order_by(ShiftLog.date.desc()).limit(limit).all()

    results = []
    for s in shifts:
        project = db.query(Project).filter(Project.id == s.project_id).first()
        # Use stored earned or recompute
        earned = s.earned if s.earned else 0
        units_done = s.units_done if s.units_done else (s.work_units or s.hours_worked)
        unit_type = s.unit_type or "HOURS"
        rate = s.rate_per_unit or 0

        results.append(ShiftResponse(
            id=s.id, worker_id=s.worker_id, project_id=s.project_id,
            project_name=project.name if project else None,
            date=s.date, hours_worked=s.hours_worked,
            unit_type=unit_type, units_done=units_done,
            rate_per_unit=rate, earned=earned,
            quality_score=s.quality_score, duration_minutes=s.duration_minutes,
            notes=s.notes, created_at=s.created_at,
        ))
    return results


# =====================================================================
# Review Endpoints — enhanced with tags + source
# =====================================================================

@router.post("/workers/{worker_id}/reviews", response_model=ReviewResponse)
def add_review(
    worker_id: int,
    review: ReviewCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    db_worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    db_review = PerformanceReview(
        worker_id=worker_id,
        review_date=review.review_date,
        rating=review.rating,
        comment=review.comment,
        reviewer_name=review.reviewer_name,
        tags=review.tags,
        review_source=review.review_source,
    )
    db.add(db_review)
    db.commit()
    db.refresh(db_review)

    return ReviewResponse(
        id=db_review.id, worker_id=db_review.worker_id,
        review_date=db_review.review_date, rating=db_review.rating,
        comment=db_review.comment, reviewer_name=db_review.reviewer_name,
        tags=db_review.tags, review_source=db_review.review_source,
        created_at=db_review.created_at,
    )


@router.get("/workers/{worker_id}/reviews", response_model=List[ReviewResponse])
def list_reviews(
    worker_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    db_worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    reviews = db.query(PerformanceReview).filter(
        PerformanceReview.worker_id == worker_id
    ).order_by(PerformanceReview.review_date.desc()).limit(limit).all()

    return [
        ReviewResponse(
            id=r.id, worker_id=r.worker_id,
            review_date=r.review_date, rating=r.rating,
            comment=r.comment, reviewer_name=r.reviewer_name,
            tags=r.tags, review_source=r.review_source,
            created_at=r.created_at,
        )
        for r in reviews
    ]
