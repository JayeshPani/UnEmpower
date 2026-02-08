"""
Manager Module Router

CRUD endpoints for projects, workers, shifts, and reviews.
Protected by Bearer token authentication.
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime

from database import get_db, Project, Worker, ShiftLog, PerformanceReview
from settings import get_settings

router = APIRouter(prefix="/manager", tags=["manager"])


# === Auth Dependency ===

# Hardcoded dev fallback tokens (always accepted alongside MANAGER_ADMIN_TOKEN)
_DEV_TOKENS = {"manager-secret-token", "admin", "dev"}


def verify_manager_token(authorization: str = Header(None)) -> str:
    """Verify the manager admin token.
    
    Accepts:
    - The MANAGER_ADMIN_TOKEN from environment
    - Any of the hardcoded dev fallback tokens
    """
    settings = get_settings()
    expected = settings.MANAGER_ADMIN_TOKEN.strip()

    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    # Extract the raw token from "Bearer <token>"
    raw = authorization.strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()

    # Accept either the env token OR any dev fallback token
    if raw == expected or raw in _DEV_TOKENS:
        return raw

    print(f"  [AUTH] Token mismatch: received '{raw[:6]}...' (len={len(raw)}), expected env token or one of {_DEV_TOKENS}")
    raise HTTPException(status_code=401, detail="Invalid manager token")


# === Verify Endpoint ===

@router.get("/verify")
def verify_token(_: str = Depends(verify_manager_token)):
    """Verify the manager token is valid. Returns 200 if OK, 401 if not."""
    return {"status": "ok", "message": "Token is valid"}


# === Request/Response Models ===

class ProjectCreate(BaseModel):
    name: str
    location: Optional[str] = None
    default_rate_per_hour: int = 0


class ProjectResponse(BaseModel):
    id: int
    name: str
    location: Optional[str]
    default_rate_per_hour: int
    created_at: datetime
    worker_count: Optional[int] = 0

    class Config:
        from_attributes = True


class WorkerCreate(BaseModel):
    full_name: str
    phone: Optional[str] = None
    wallet_address: Optional[str] = None
    project_id: Optional[int] = None
    rate_per_hour: Optional[int] = None


class WorkerUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    wallet_address: Optional[str] = None
    project_id: Optional[int] = None
    rate_per_hour: Optional[int] = None
    status: Optional[str] = None  # active/inactive


class WorkerResponse(BaseModel):
    id: int
    full_name: str
    phone: Optional[str]
    wallet_address: Optional[str]
    project_id: Optional[int]
    project_name: Optional[str] = None
    rate_per_hour: Optional[int]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ShiftCreate(BaseModel):
    date: date
    hours_worked: float
    work_units: Optional[float] = None  # defaults to hours_worked
    notes: Optional[str] = None
    project_id: Optional[int] = None  # optional override, else use worker's project


class ShiftResponse(BaseModel):
    id: int
    worker_id: int
    project_id: int
    project_name: Optional[str] = None
    date: date
    hours_worked: float
    work_units: float
    earned: int  # calculated
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewCreate(BaseModel):
    review_date: date
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None
    reviewer_name: Optional[str] = None


class ReviewResponse(BaseModel):
    id: int
    worker_id: int
    review_date: date
    rating: int
    comment: Optional[str]
    reviewer_name: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# === Project Endpoints ===

@router.post("/projects", response_model=ProjectResponse)
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    """Create a new project."""
    db_project = Project(
        name=project.name,
        location=project.location,
        default_rate_per_hour=project.default_rate_per_hour
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    return ProjectResponse(
        id=db_project.id,
        name=db_project.name,
        location=db_project.location,
        default_rate_per_hour=db_project.default_rate_per_hour,
        created_at=db_project.created_at,
        worker_count=0
    )


@router.get("/projects", response_model=List[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    """List all projects."""
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    
    return [
        ProjectResponse(
            id=p.id,
            name=p.name,
            location=p.location,
            default_rate_per_hour=p.default_rate_per_hour,
            created_at=p.created_at,
            worker_count=len(p.workers)
        )
        for p in projects
    ]


# === Worker Endpoints ===

@router.post("/workers", response_model=WorkerResponse)
def create_worker(
    worker: WorkerCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    """Create a new worker."""
    # Check if wallet already exists
    if worker.wallet_address:
        existing = db.query(Worker).filter(Worker.wallet_address == worker.wallet_address).first()
        if existing:
            raise HTTPException(status_code=400, detail="Wallet address already linked to another worker")
    
    db_worker = Worker(
        full_name=worker.full_name,
        phone=worker.phone,
        wallet_address=worker.wallet_address,
        project_id=worker.project_id,
        rate_per_hour=worker.rate_per_hour
    )
    db.add(db_worker)
    db.commit()
    db.refresh(db_worker)
    
    project_name = None
    if db_worker.project:
        project_name = db_worker.project.name
    
    return WorkerResponse(
        id=db_worker.id,
        full_name=db_worker.full_name,
        phone=db_worker.phone,
        wallet_address=db_worker.wallet_address,
        project_id=db_worker.project_id,
        project_name=project_name,
        rate_per_hour=db_worker.rate_per_hour,
        status=db_worker.status,
        created_at=db_worker.created_at
    )


@router.get("/workers", response_model=List[WorkerResponse])
def list_workers(
    project_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    """List workers, optionally filtered by project or status."""
    query = db.query(Worker)
    
    if project_id is not None:
        query = query.filter(Worker.project_id == project_id)
    if status:
        query = query.filter(Worker.status == status)
    
    workers = query.order_by(Worker.created_at.desc()).all()
    
    return [
        WorkerResponse(
            id=w.id,
            full_name=w.full_name,
            phone=w.phone,
            wallet_address=w.wallet_address,
            project_id=w.project_id,
            project_name=w.project.name if w.project else None,
            rate_per_hour=w.rate_per_hour,
            status=w.status,
            created_at=w.created_at
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
    """Update a worker (link wallet, change project, rate, status)."""
    db_worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    # Check wallet uniqueness if updating
    if update.wallet_address and update.wallet_address != db_worker.wallet_address:
        existing = db.query(Worker).filter(Worker.wallet_address == update.wallet_address).first()
        if existing:
            raise HTTPException(status_code=400, detail="Wallet address already linked to another worker")
    
    # Apply updates
    if update.full_name is not None:
        db_worker.full_name = update.full_name
    if update.phone is not None:
        db_worker.phone = update.phone
    if update.wallet_address is not None:
        db_worker.wallet_address = update.wallet_address
    if update.project_id is not None:
        db_worker.project_id = update.project_id
    if update.rate_per_hour is not None:
        db_worker.rate_per_hour = update.rate_per_hour
    if update.status is not None:
        db_worker.status = update.status
    
    db.commit()
    db.refresh(db_worker)
    
    return WorkerResponse(
        id=db_worker.id,
        full_name=db_worker.full_name,
        phone=db_worker.phone,
        wallet_address=db_worker.wallet_address,
        project_id=db_worker.project_id,
        project_name=db_worker.project.name if db_worker.project else None,
        rate_per_hour=db_worker.rate_per_hour,
        status=db_worker.status,
        created_at=db_worker.created_at
    )


# === Shift Endpoints ===

@router.post("/workers/{worker_id}/shifts", response_model=ShiftResponse)
def add_shift(
    worker_id: int,
    shift: ShiftCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    """Add a shift log for a worker."""
    db_worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    # Determine project_id
    project_id = shift.project_id or db_worker.project_id
    if not project_id:
        raise HTTPException(status_code=400, detail="No project specified and worker has no default project")
    
    # Get project to calculate earnings
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=400, detail="Project not found")
    
    # Calculate work_units (default to hours_worked)
    work_units = shift.work_units if shift.work_units is not None else shift.hours_worked
    
    # Calculate earnings: hours * rate
    rate = db_worker.rate_per_hour if db_worker.rate_per_hour else project.default_rate_per_hour
    earned = int(shift.hours_worked * rate)
    
    db_shift = ShiftLog(
        worker_id=worker_id,
        project_id=project_id,
        date=shift.date,
        hours_worked=shift.hours_worked,
        work_units=work_units,
        notes=shift.notes
    )
    db.add(db_shift)
    db.commit()
    db.refresh(db_shift)
    
    return ShiftResponse(
        id=db_shift.id,
        worker_id=db_shift.worker_id,
        project_id=db_shift.project_id,
        project_name=project.name,
        date=db_shift.date,
        hours_worked=db_shift.hours_worked,
        work_units=db_shift.work_units,
        earned=earned,
        notes=db_shift.notes,
        created_at=db_shift.created_at
    )


@router.get("/workers/{worker_id}/shifts", response_model=List[ShiftResponse])
def list_shifts(
    worker_id: int,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    """Get shift logs for a worker."""
    db_worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    shifts = db.query(ShiftLog).filter(
        ShiftLog.worker_id == worker_id
    ).order_by(ShiftLog.date.desc()).limit(limit).all()
    
    results = []
    for s in shifts:
        project = db.query(Project).filter(Project.id == s.project_id).first()
        rate = db_worker.rate_per_hour if db_worker.rate_per_hour else (project.default_rate_per_hour if project else 0)
        earned = int(s.hours_worked * rate)
        
        results.append(ShiftResponse(
            id=s.id,
            worker_id=s.worker_id,
            project_id=s.project_id,
            project_name=project.name if project else None,
            date=s.date,
            hours_worked=s.hours_worked,
            work_units=s.work_units or s.hours_worked,
            earned=earned,
            notes=s.notes,
            created_at=s.created_at
        ))
    
    return results


# === Review Endpoints ===

@router.post("/workers/{worker_id}/reviews", response_model=ReviewResponse)
def add_review(
    worker_id: int,
    review: ReviewCreate,
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    """Add a performance review for a worker."""
    db_worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    db_review = PerformanceReview(
        worker_id=worker_id,
        review_date=review.review_date,
        rating=review.rating,
        comment=review.comment,
        reviewer_name=review.reviewer_name
    )
    db.add(db_review)
    db.commit()
    db.refresh(db_review)
    
    return ReviewResponse(
        id=db_review.id,
        worker_id=db_review.worker_id,
        review_date=db_review.review_date,
        rating=db_review.rating,
        comment=db_review.comment,
        reviewer_name=db_review.reviewer_name,
        created_at=db_review.created_at
    )


@router.get("/workers/{worker_id}/reviews", response_model=List[ReviewResponse])
def list_reviews(
    worker_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: str = Depends(verify_manager_token)
):
    """Get performance reviews for a worker."""
    db_worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not db_worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    reviews = db.query(PerformanceReview).filter(
        PerformanceReview.worker_id == worker_id
    ).order_by(PerformanceReview.review_date.desc()).limit(limit).all()
    
    return [
        ReviewResponse(
            id=r.id,
            worker_id=r.worker_id,
            review_date=r.review_date,
            rating=r.rating,
            comment=r.comment,
            reviewer_name=r.reviewer_name,
            created_at=r.created_at
        )
        for r in reviews
    ]
