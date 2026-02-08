"""
Database models and session management for UnEmpower API.

Tables:
- workproof_events: Indexed WorkProofSubmitted events
- loan_events: Indexed LoanApproved events
- repay_events: Indexed Repaid events
- indexer_state: Block tracking for indexer
- work_types: Work type definitions (HOURS, SHIFTS, TASKS, SQFT, KM)
- projects: Projects with work type support
- workers: Workers managed off-chain
- shift_logs: Work logs with rich unit/rate/earned tracking
- performance_reviews: Reviews with tags and source
"""

from sqlalchemy import create_engine, Column, String, Integer, BigInteger, Boolean, DateTime, Text, Index, Float, JSON, Date, ForeignKey, Enum as SAEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import enum
import uuid as uuid_pkg

from settings import get_settings

Base = declarative_base()


# ── Unit type enum ──────────────────────────────────────────────────

class UnitType(str, enum.Enum):
    HOURS = "HOURS"
    SHIFTS = "SHIFTS"
    TASKS = "TASKS"
    SQFT = "SQFT"
    KM = "KM"


# ── Existing chain event tables (unchanged) ─────────────────────────

class WorkProofEvent(Base):
    """Indexed WorkProofSubmitted events."""
    __tablename__ = "workproof_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    proof_id = Column(BigInteger, nullable=False, index=True)
    worker = Column(String(42), nullable=False, index=True)
    proof_hash = Column(String(66), nullable=False)
    work_units = Column(BigInteger, nullable=False)
    earned_amount = Column(String(78), nullable=False)
    event_timestamp = Column(BigInteger, nullable=False)
    block_number = Column(BigInteger, nullable=False, index=True)
    tx_hash = Column(String(66), nullable=False, unique=True)
    log_index = Column(Integer, nullable=False)
    indexed_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_workproof_worker_block', 'worker', 'block_number'),
    )


class LoanEvent(Base):
    """Indexed LoanApproved events."""
    __tablename__ = "loan_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    borrower = Column(String(42), nullable=False, index=True)
    principal = Column(String(78), nullable=False)
    interest_amount = Column(String(78), nullable=False)
    due_date = Column(BigInteger, nullable=False)
    nonce = Column(BigInteger, nullable=False)
    block_number = Column(BigInteger, nullable=False, index=True)
    tx_hash = Column(String(66), nullable=False, unique=True)
    log_index = Column(Integer, nullable=False)
    indexed_at = Column(DateTime, default=datetime.utcnow)


class RepayEvent(Base):
    """Indexed Repaid events."""
    __tablename__ = "repay_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    borrower = Column(String(42), nullable=False, index=True)
    amount = Column(String(78), nullable=False)
    remaining = Column(String(78), nullable=False)
    block_number = Column(BigInteger, nullable=False, index=True)
    tx_hash = Column(String(66), nullable=False, unique=True)
    log_index = Column(Integer, nullable=False)
    indexed_at = Column(DateTime, default=datetime.utcnow)


class IndexerState(Base):
    """Indexer state tracking."""
    __tablename__ = "indexer_state"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chain_id = Column(Integer, nullable=False, unique=True)
    last_processed_block = Column(BigInteger, nullable=False, default=0)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# === AI Feature Tables ===

class FraudSignal(Base):
    __tablename__ = "fraud_signals"
    id = Column(Integer, primary_key=True, autoincrement=True)
    worker = Column(String(42), nullable=False, index=True)
    anomaly_score = Column(Integer, nullable=False)
    risk_level = Column(String(20), nullable=False)
    reasons = Column(JSON, nullable=True)
    signals = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class WorkProofFlag(Base):
    __tablename__ = "workproof_flags"
    id = Column(Integer, primary_key=True, autoincrement=True)
    worker = Column(String(42), nullable=False, index=True)
    flag_score = Column(Integer, nullable=False)
    risk_level = Column(String(20), nullable=False)
    flags = Column(JSON, nullable=True)
    event_ids = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class RiskAlert(Base):
    __tablename__ = "risk_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    worker = Column(String(42), nullable=False, index=True)
    risk_score = Column(Integer, nullable=False)
    risk_level = Column(String(20), nullable=False)
    default_risk_7d = Column(Float, nullable=True)
    default_risk_14d = Column(Float, nullable=True)
    reasons = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class OfferHistory(Base):
    __tablename__ = "offer_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    worker = Column(String(42), nullable=False, index=True)
    credit_limit = Column(String(78), nullable=False)
    apr_bps = Column(Integer, nullable=False)
    tenure_days = Column(Integer, nullable=False)
    pd = Column(Integer, nullable=False)
    trust_score = Column(Integer, nullable=False)
    fraud_flags = Column(Integer, nullable=False, default=0)
    risk_score = Column(Integer, nullable=True)
    forecast_14d = Column(Float, nullable=True)
    anomaly_score = Column(Integer, nullable=True)
    integrity_score = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index('ix_offer_history_worker_date', 'worker', 'created_at'),
    )


# ══════════════════════════════════════════════════════════════════════
# Manager Module Tables (P3-1 — enhanced)
# ══════════════════════════════════════════════════════════════════════

class WorkTypeModel(Base):
    """Work type definitions (Delivery, Construction, Security, etc.)."""
    __tablename__ = "work_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    unit_type = Column(String(10), nullable=False, default="HOURS")   # HOURS/SHIFTS/TASKS/SQFT/KM
    default_unit_rate = Column(Integer, nullable=False, default=0)    # ₹ per unit
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    projects = relationship("Project", back_populates="work_type")


class Project(Base):
    """Projects that workers are assigned to."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    location = Column(String(255), nullable=True)
    default_rate_per_hour = Column(Integer, nullable=False, default=0)        # legacy ₹/hr
    work_type_id = Column(Integer, ForeignKey("work_types.id"), nullable=True)
    unit_type = Column(String(10), nullable=True)                             # override project unit_type
    default_unit_rate = Column(Integer, nullable=True)                        # ₹ per unit (overrides work_type)
    default_daily_target_units = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    work_type = relationship("WorkTypeModel", back_populates="projects")
    workers = relationship("Worker", back_populates="project")
    shift_logs = relationship("ShiftLog", back_populates="project")


class Worker(Base):
    """Workers managed off-chain (may or may not have wallets)."""
    __tablename__ = "workers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    wallet_address = Column(String(42), nullable=True, unique=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    rate_per_hour = Column(Integer, nullable=True)    # legacy ₹/hr override
    rate_per_unit = Column(Integer, nullable=True)    # ₹ per unit override
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="workers")
    shift_logs = relationship("ShiftLog", back_populates="worker", cascade="all, delete-orphan")
    reviews = relationship("PerformanceReview", back_populates="worker", cascade="all, delete-orphan")


class ShiftLog(Base):
    """Work logs for workers (enhanced from shift_logs)."""
    __tablename__ = "shift_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worker_id = Column(Integer, ForeignKey("workers.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    date = Column(Date, nullable=False)
    hours_worked = Column(Float, nullable=False, default=0)
    work_units = Column(Float, nullable=True)
    # ── New P3-1 fields ──
    unit_type = Column(String(10), nullable=True, default="HOURS")    # HOURS/SHIFTS/TASKS/SQFT/KM
    units_done = Column(Float, nullable=True)                         # computed or provided
    rate_per_unit = Column(Integer, nullable=True)                    # ₹ per unit used
    earned = Column(Integer, nullable=True, default=0)                # ₹ earned (computed, stored)
    duration_minutes = Column(Integer, nullable=True)
    proof_media_url = Column(String(500), nullable=True)
    quality_score = Column(Integer, nullable=True)                    # 0–100
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    worker = relationship("Worker", back_populates="shift_logs")
    project = relationship("Project", back_populates="shift_logs")

    __table_args__ = (
        Index('ix_shift_logs_worker_date', 'worker_id', 'date'),
    )


class PerformanceReview(Base):
    """Performance reviews for workers (enhanced with tags + source)."""
    __tablename__ = "performance_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worker_id = Column(Integer, ForeignKey("workers.id"), nullable=False)
    review_date = Column(Date, nullable=False)
    rating = Column(Integer, nullable=False)          # 1-5
    comment = Column(Text, nullable=True)
    reviewer_name = Column(String(255), nullable=True)
    # ── New P3-1 fields ──
    tags = Column(JSON, nullable=True)                # e.g. ["late", "excellent", "safe"]
    review_source = Column(String(20), nullable=True, default="manager")  # manager/system
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    worker = relationship("Worker", back_populates="reviews")

    __table_args__ = (
        Index('ix_reviews_worker_date', 'worker_id', 'review_date'),
    )


# ══════════════════════════════════════════════════════════════════════
# Engine and session factory
# ══════════════════════════════════════════════════════════════════════

_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_engine(
            settings.POSTGRES_URL,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10
        )
    return _engine


def get_session_local():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return _SessionLocal


def get_db():
    SessionLocal = get_session_local()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables initialized (P3-1 enhanced schema)")


def check_db_connection() -> bool:
    try:
        from sqlalchemy import text
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False
