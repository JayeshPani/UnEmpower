"""
Database models and session management for UnEmpower API.

Tables:
- workproof_events: Indexed WorkProofSubmitted events
- loan_events: Indexed LoanApproved events
- repay_events: Indexed Repaid events
- indexer_state: Block tracking for indexer
"""

from sqlalchemy import create_engine, Column, String, Integer, BigInteger, Boolean, DateTime, Text, Index, Float, JSON, Date, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import uuid as uuid_pkg

from settings import get_settings

Base = declarative_base()


class WorkProofEvent(Base):
    """Indexed WorkProofSubmitted events."""
    __tablename__ = "workproof_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Event data
    proof_id = Column(BigInteger, nullable=False, index=True)
    worker = Column(String(42), nullable=False, index=True)
    proof_hash = Column(String(66), nullable=False)
    work_units = Column(BigInteger, nullable=False)
    earned_amount = Column(String(78), nullable=False)  # Store as string for large numbers
    event_timestamp = Column(BigInteger, nullable=False)
    
    # Block data
    block_number = Column(BigInteger, nullable=False, index=True)
    tx_hash = Column(String(66), nullable=False, unique=True)
    log_index = Column(Integer, nullable=False)
    
    # Indexer metadata
    indexed_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_workproof_worker_block', 'worker', 'block_number'),
    )


class LoanEvent(Base):
    """Indexed LoanApproved events."""
    __tablename__ = "loan_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Event data
    borrower = Column(String(42), nullable=False, index=True)
    principal = Column(String(78), nullable=False)
    interest_amount = Column(String(78), nullable=False)
    due_date = Column(BigInteger, nullable=False)
    nonce = Column(BigInteger, nullable=False)
    
    # Block data
    block_number = Column(BigInteger, nullable=False, index=True)
    tx_hash = Column(String(66), nullable=False, unique=True)
    log_index = Column(Integer, nullable=False)
    
    # Indexer metadata
    indexed_at = Column(DateTime, default=datetime.utcnow)


class RepayEvent(Base):
    """Indexed Repaid events."""
    __tablename__ = "repay_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Event data
    borrower = Column(String(42), nullable=False, index=True)
    amount = Column(String(78), nullable=False)
    remaining = Column(String(78), nullable=False)
    
    # Block data
    block_number = Column(BigInteger, nullable=False, index=True)
    tx_hash = Column(String(66), nullable=False, unique=True)
    log_index = Column(Integer, nullable=False)
    
    # Indexer metadata
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
    """Fraud anomaly detection results."""
    __tablename__ = "fraud_signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worker = Column(String(42), nullable=False, index=True)
    anomaly_score = Column(Integer, nullable=False)
    risk_level = Column(String(20), nullable=False)
    reasons = Column(JSON, nullable=True)
    signals = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class WorkProofFlag(Base):
    """WorkProof integrity flags."""
    __tablename__ = "workproof_flags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worker = Column(String(42), nullable=False, index=True)
    flag_score = Column(Integer, nullable=False)
    risk_level = Column(String(20), nullable=False)
    flags = Column(JSON, nullable=True)
    event_ids = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class RiskAlert(Base):
    """Default early warning alerts."""
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
    """Credit offer history for fairness auditing."""
    __tablename__ = "offer_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worker = Column(String(42), nullable=False, index=True)
    
    # Attestation fields
    credit_limit = Column(String(78), nullable=False)
    apr_bps = Column(Integer, nullable=False)
    tenure_days = Column(Integer, nullable=False)
    pd = Column(Integer, nullable=False)
    trust_score = Column(Integer, nullable=False)
    fraud_flags = Column(Integer, nullable=False, default=0)
    
    # AI signal summaries
    risk_score = Column(Integer, nullable=True)
    forecast_14d = Column(Float, nullable=True)
    anomaly_score = Column(Integer, nullable=True)
    integrity_score = Column(Integer, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index('ix_offer_history_worker_date', 'worker', 'created_at'),
    )


# === Manager Module Tables ===

class Project(Base):
    """Projects that workers are assigned to."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    location = Column(String(255), nullable=True)
    default_rate_per_hour = Column(Integer, nullable=False, default=0)  # in ₹
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
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
    rate_per_hour = Column(Integer, nullable=True)  # Override for this worker, in ₹
    status = Column(String(20), nullable=False, default="active")  # active/inactive
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="workers")
    shift_logs = relationship("ShiftLog", back_populates="worker", cascade="all, delete-orphan")
    reviews = relationship("PerformanceReview", back_populates="worker", cascade="all, delete-orphan")


class ShiftLog(Base):
    """Daily shift logs for workers."""
    __tablename__ = "shift_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worker_id = Column(Integer, ForeignKey("workers.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    date = Column(Date, nullable=False)
    hours_worked = Column(Float, nullable=False)
    work_units = Column(Float, nullable=True)  # defaults to hours_worked if not set
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    worker = relationship("Worker", back_populates="shift_logs")
    project = relationship("Project", back_populates="shift_logs")

    __table_args__ = (
        Index('ix_shift_logs_worker_date', 'worker_id', 'date'),
    )


class PerformanceReview(Base):
    """Performance reviews for workers."""
    __tablename__ = "performance_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worker_id = Column(Integer, ForeignKey("workers.id"), nullable=False)
    review_date = Column(Date, nullable=False)
    rating = Column(Integer, nullable=False)  # 1-5
    comment = Column(Text, nullable=True)
    reviewer_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    worker = relationship("Worker", back_populates="reviews")

    __table_args__ = (
        Index('ix_reviews_worker_date', 'worker_id', 'review_date'),
    )


# Engine and session factory (lazy init)
_engine = None
_SessionLocal = None


def get_engine():
    """Get or create database engine."""
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
    """Get session factory."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return _SessionLocal


def get_db():
    """Dependency for FastAPI to get DB session."""
    SessionLocal = get_session_local()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables initialized")


def check_db_connection() -> bool:
    """Check if database is accessible."""
    try:
        from sqlalchemy import text
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False
