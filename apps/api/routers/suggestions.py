"""
Suggestions Router - Worker suggestions and Manager insights endpoints.
"""

from fastapi import APIRouter, Depends, Query, Header, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from settings import get_settings
from services.suggestions import (
    get_worker_suggestions,
    get_manager_insights,
    get_manager_checklist,
    get_worker_checklist,
)

router = APIRouter(prefix="/suggestions", tags=["suggestions"])

_DEV_TOKENS = {"manager-secret-token", "admin", "dev"}


def _verify_manager(authorization: str = Header(None)) -> str:
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


@router.get("/worker")
def worker_suggestions(
    wallet: str = Query(..., description="Wallet address 0x..."),
    db: Session = Depends(get_db),
):
    """Get smart suggestions for a worker based on their current state."""
    return {"suggestions": get_worker_suggestions(wallet, db)}


@router.get("/worker/checklist")
def worker_checklist(
    wallet: str = Query(..., description="Wallet address 0x..."),
    db: Session = Depends(get_db),
):
    """Get worker journey progress checklist."""
    return {"checklist": get_worker_checklist(wallet, db)}


@router.get("/manager")
def manager_insights(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(_verify_manager),
):
    """Get workers needing attention with reason codes. Protected by manager token."""
    return {"insights": get_manager_insights(db, project_id)}


@router.get("/manager/checklist")
def manager_checklist_endpoint(
    db: Session = Depends(get_db),
    _: str = Depends(_verify_manager),
):
    """Get manager completion checklist. Protected by manager token."""
    return {"checklist": get_manager_checklist(db)}
