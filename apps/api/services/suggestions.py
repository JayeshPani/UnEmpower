"""
Suggestions Engine - Smart recommendations for workers and managers.
"""

from typing import List, Dict, Any, Optional
from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import (
    Worker, ShiftLog, PerformanceReview, Project,
    OfferHistory, LoanEvent, RepayEvent, FraudSignal,
)


def _parse_date(d) -> Optional[date]:
    if isinstance(d, date):
        return d
    if isinstance(d, str):
        try:
            return date.fromisoformat(d)
        except (ValueError, TypeError):
            return None
    return None


def get_worker_suggestions(wallet: str, db: Session) -> List[Dict[str, Any]]:
    suggestions = []
    wl = wallet.lower()

    worker = db.query(Worker).filter(func.lower(Worker.wallet_address) == wl).first()

    if not worker:
        suggestions.append({
            "id": "link_wallet",
            "title": "Link your wallet to a worker profile",
            "why": "You need a linked profile to see work history, earnings, and generate credit offers.",
            "impact": "HIGH",
            "action": {"type": "NAVIGATE", "to": "/manager"},
        })
        suggestions.append({
            "id": "quick_demo",
            "title": "Try Quick Demo Setup",
            "why": "Generate sample work data to explore all features instantly.",
            "impact": "MED",
            "action": {"type": "NAVIGATE", "to": "/workproofs"},
        })
        return suggestions

    today = date.today()
    d7 = today - timedelta(days=7)

    shifts = db.query(ShiftLog).filter(ShiftLog.worker_id == worker.id).all()
    total_shifts = len(shifts)
    recent = [s for s in shifts if _parse_date(s.date) and _parse_date(s.date) >= d7]
    total_earned = sum(s.earned or 0 for s in shifts)

    reviews = db.query(PerformanceReview).filter(PerformanceReview.worker_id == worker.id).all()
    avg_r = sum(r.rating for r in reviews) / len(reviews) if reviews else 0

    offer = db.query(OfferHistory).filter(func.lower(OfferHistory.worker) == wl).order_by(OfferHistory.created_at.desc()).first()
    has_loan = db.query(LoanEvent).filter(func.lower(LoanEvent.borrower) == wl).first() is not None
    has_repay = db.query(RepayEvent).filter(func.lower(RepayEvent.borrower) == wl).first() is not None
    fraud = db.query(FraudSignal).filter(func.lower(FraudSignal.worker) == wl).order_by(FraudSignal.created_at.desc()).first()

    if total_shifts == 0:
        suggestions.append({"id": "first_worklog", "title": "Submit your first work log", "why": "Work logs are the foundation of your credit score. More logs = better offers.", "impact": "HIGH", "action": {"type": "NAVIGATE", "to": "/workproofs"}})
    elif len(recent) == 0:
        suggestions.append({"id": "resume_activity", "title": "Log recent work activity", "why": "No work logged in the past 7 days. Recent activity improves your credit score.", "impact": "HIGH", "action": {"type": "NAVIGATE", "to": "/workproofs"}})

    if total_shifts >= 3 and not offer:
        suggestions.append({"id": "generate_offer", "title": "Generate your credit offer", "why": f"You have {total_shifts} work logs and Rs.{total_earned:,} earned. You qualify!", "impact": "HIGH", "action": {"type": "NAVIGATE", "to": "/offer"}})

    if offer and not has_loan:
        suggestions.append({"id": "take_loan", "title": "Borrow against your credit offer", "why": "You have an approved credit offer. Borrow funds instantly.", "impact": "MED", "action": {"type": "NAVIGATE", "to": "/loan"}})

    if has_loan and not has_repay:
        suggestions.append({"id": "make_repayment", "title": "Make a loan repayment", "why": "Timely repayments improve your trust score and unlock better offers.", "impact": "HIGH", "action": {"type": "NAVIGATE", "to": "/loan"}})

    if reviews and avg_r < 3.0:
        suggestions.append({"id": "improve_rating", "title": "Improve your performance rating", "why": f"Your average rating is {avg_r:.1f}/5. Higher ratings improve credit terms.", "impact": "MED", "action": {"type": "NAVIGATE", "to": "/workproofs"}})

    if total_shifts >= 5 and total_earned > 0:
        suggestions.append({"id": "view_analysis", "title": "View AI earnings analysis", "why": f"Get AI-powered insights on your Rs.{total_earned:,} earnings and 30-day forecast.", "impact": "LOW", "action": {"type": "NAVIGATE", "to": "/workproofs"}})

    if fraud and fraud.anomaly_score and fraud.anomaly_score > 50:
        suggestions.append({"id": "risk_alert", "title": "Review your risk profile", "why": "Your anomaly score is elevated. Consistent work patterns help lower it.", "impact": "HIGH", "action": {"type": "NAVIGATE", "to": "/workproofs"}})

    if offer and total_shifts < 10:
        suggestions.append({"id": "more_work", "title": "Add more work history for better terms", "why": f"You have {total_shifts} logs. 10+ logs typically unlock better rates.", "impact": "MED", "action": {"type": "NAVIGATE", "to": "/workproofs"}})

    if not worker.project_id:
        suggestions.append({"id": "assign_project", "title": "Get assigned to a project", "why": "Workers assigned to projects earn more consistently.", "impact": "MED", "action": {"type": "NAVIGATE", "to": "/manager"}})

    return suggestions


def get_manager_insights(db: Session, project_id: Optional[int] = None) -> List[Dict[str, Any]]:
    q = db.query(Worker)
    if project_id:
        q = q.filter(Worker.project_id == project_id)
    workers = q.all()

    today = date.today()
    d7 = today - timedelta(days=7)
    insights = []

    for w in workers:
        reasons = []
        sev = 0
        shifts = db.query(ShiftLog).filter(ShiftLog.worker_id == w.id).all()
        recent = [s for s in shifts if _parse_date(s.date) and _parse_date(s.date) >= d7]
        total_earned = sum(s.earned or 0 for s in shifts)
        reviews = db.query(PerformanceReview).filter(PerformanceReview.worker_id == w.id).all()
        avg_r = sum(r.rating for r in reviews) / len(reviews) if reviews else None

        if not w.wallet_address:
            reasons.append({"code": "NO_WALLET", "label": "Missing wallet link", "detail": "Cannot access credit features."})
            sev += 3
        if len(shifts) > 0 and len(recent) == 0:
            ls = max(shifts, key=lambda s: str(s.date))
            reasons.append({"code": "INACTIVE", "label": "Inactive > 7 days", "detail": f"Last shift: {ls.date}"})
            sev += 4
        elif len(shifts) == 0:
            reasons.append({"code": "NO_LOGS", "label": "No work logs", "detail": "No recorded work logs."})
            sev += 5
        if len(recent) > 0:
            wu = sum(s.units_done or s.hours_worked or 0 for s in recent)
            if wu < 10:
                reasons.append({"code": "LOW_UNITS", "label": "Low work this week", "detail": f"Only {wu:.1f} units."})
                sev += 2
        if avg_r is not None and avg_r < 3.0:
            reasons.append({"code": "POOR_REVIEWS", "label": "Low rating", "detail": f"Avg: {avg_r:.1f}/5"})
            sev += 3
        elif len(reviews) == 0 and len(shifts) > 3:
            reasons.append({"code": "NO_REVIEWS", "label": "No reviews", "detail": "Has shifts but no reviews."})
            sev += 1
        if not w.project_id:
            reasons.append({"code": "UNASSIGNED", "label": "Not assigned to project", "detail": "No project assignment."})
            sev += 2

        if reasons:
            proj = db.query(Project).filter(Project.id == w.project_id).first() if w.project_id else None
            insights.append({
                "worker_id": w.id, "worker_name": w.full_name,
                "project_name": proj.name if proj else None,
                "wallet_linked": bool(w.wallet_address), "status": w.status,
                "total_shifts": len(shifts), "total_earned": total_earned,
                "avg_rating": round(avg_r, 1) if avg_r else None,
                "reasons": reasons, "severity_score": sev,
            })

    insights.sort(key=lambda x: x["severity_score"], reverse=True)
    return insights[:10]


def get_manager_checklist(db: Session) -> List[Dict[str, Any]]:
    pc = db.query(Project).count()
    wc = db.query(Worker).count()
    sc = db.query(ShiftLog).count()
    rc = db.query(PerformanceReview).count()
    lc = db.query(Worker).filter(Worker.wallet_address.isnot(None)).count()
    return [
        {"id": "project_created", "label": "Create at least 1 project", "done": pc > 0, "detail": f"{pc} projects"},
        {"id": "worker_created", "label": "Add at least 1 worker", "done": wc > 0, "detail": f"{wc} workers"},
        {"id": "shift_logged", "label": "Log at least 1 work shift", "done": sc > 0, "detail": f"{sc} shifts"},
        {"id": "review_added", "label": "Add a performance review", "done": rc > 0, "detail": f"{rc} reviews"},
        {"id": "wallet_linked", "label": "Link a worker wallet", "done": lc > 0, "detail": f"{lc}/{wc} linked" if wc > 0 else "No workers", "optional": True},
    ]


def get_worker_checklist(wallet: str, db: Session) -> List[Dict[str, Any]]:
    wl = wallet.lower()
    worker = db.query(Worker).filter(func.lower(Worker.wallet_address) == wl).first()
    has_worker = worker is not None
    sc = db.query(ShiftLog).filter(ShiftLog.worker_id == worker.id).count() if worker else 0
    has_offer = db.query(OfferHistory).filter(func.lower(OfferHistory.worker) == wl).first() is not None
    has_loan = db.query(LoanEvent).filter(func.lower(LoanEvent.borrower) == wl).first() is not None
    has_repay = db.query(RepayEvent).filter(func.lower(RepayEvent.borrower) == wl).first() is not None
    return [
        {"id": "wallet_connected", "label": "Connect wallet", "done": True, "detail": f"{wallet[:6]}...{wallet[-4:]}"},
        {"id": "profile_linked", "label": "Worker profile linked", "done": has_worker, "detail": worker.full_name if worker else "Not linked"},
        {"id": "work_logged", "label": "At least 1 work log", "done": sc > 0, "detail": f"{sc} logs" if sc > 0 else "No logs yet"},
        {"id": "offer_generated", "label": "Credit offer generated", "done": has_offer, "detail": "Offer available" if has_offer else "Generate from /offer"},
        {"id": "loan_borrowed", "label": "Loan borrowed", "done": has_loan, "detail": "Active loan" if has_loan else "Optional", "optional": True},
        {"id": "repayment_made", "label": "Repayment made", "done": has_repay, "detail": "Repaid" if has_repay else "Optional", "optional": True},
    ]
