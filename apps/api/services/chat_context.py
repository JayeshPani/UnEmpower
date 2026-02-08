"""
Chat Context Provider

Fetches relevant user context (worker profile, shifts, reviews, offers)
to feed into the Groq LLM for better chatbot responses.
"""

from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from typing import Optional, Dict, Any

from database import Worker, ShiftLog, PerformanceReview, Project, OfferHistory, WorkProofEvent


def get_chat_context(wallet: Optional[str], db: Session) -> Dict[str, Any]:
    """Build context dict for the chatbot from DB data."""
    ctx: Dict[str, Any] = {
        "wallet_connected": bool(wallet),
        "linked": False,
    }

    if not wallet:
        return ctx

    wallet_lower = wallet.lower()

    # --- Worker profile ---
    worker = db.query(Worker).filter(
        func.lower(Worker.wallet_address) == wallet_lower
    ).first()

    if not worker:
        ctx["linked"] = False
        ctx["message"] = "Wallet not linked to a worker profile."
        return ctx

    ctx["linked"] = True
    ctx["worker"] = {
        "id": worker.id,
        "full_name": worker.full_name,
        "project": worker.project.name if worker.project else "Unassigned",
        "rate_per_hour": worker.rate_per_hour or (worker.project.default_rate_per_hour if worker.project else 0),
        "status": worker.status,
        "has_wallet": True,
    }

    # --- Shift totals ---
    shifts = db.query(ShiftLog).filter(ShiftLog.worker_id == worker.id).all()
    today = date.today()
    seven_days_ago = today - timedelta(days=7)
    thirty_days_ago = today - timedelta(days=30)

    total_hours = 0.0
    total_earned = 0
    hours_7d = 0.0
    hours_30d = 0.0

    for s in shifts:
        rate = worker.rate_per_hour or 0
        if not rate and worker.project:
            rate = worker.project.default_rate_per_hour
        earned = int(s.hours_worked * rate)
        total_earned += earned
        total_hours += s.hours_worked

        shift_date = s.date if isinstance(s.date, date) else date.fromisoformat(str(s.date))
        if shift_date >= seven_days_ago:
            hours_7d += s.hours_worked
        if shift_date >= thirty_days_ago:
            hours_30d += s.hours_worked

    ctx["totals"] = {
        "total_proofs": len(shifts),
        "total_hours": round(total_hours, 1),
        "total_earned": total_earned,
        "hours_7d": round(hours_7d, 1),
        "hours_30d": round(hours_30d, 1),
    }

    # --- Reviews ---
    reviews = db.query(PerformanceReview).filter(
        PerformanceReview.worker_id == worker.id
    ).all()
    if reviews:
        avg_rating = sum(r.rating for r in reviews) / len(reviews)
        ctx["reviews"] = {
            "count": len(reviews),
            "avg_rating": round(avg_rating, 1),
        }

    # --- On-chain work proofs ---
    on_chain_proofs = db.query(WorkProofEvent).filter(
        func.lower(WorkProofEvent.worker) == wallet_lower
    ).count()
    ctx["on_chain_proofs"] = on_chain_proofs

    # --- Latest offer (if any) ---
    latest_offer = db.query(OfferHistory).filter(
        func.lower(OfferHistory.worker) == wallet_lower
    ).order_by(OfferHistory.created_at.desc()).first()

    if latest_offer:
        ctx["latest_offer"] = {
            "credit_limit": latest_offer.credit_limit,
            "apr_bps": latest_offer.apr_bps,
            "tenure_days": latest_offer.tenure_days,
            "trust_score": latest_offer.trust_score,
        }

    return ctx
