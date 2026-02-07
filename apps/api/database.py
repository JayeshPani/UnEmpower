"""
Database models and session management for UnEmpower API.

Tables:
- workproof_events: Indexed WorkProofSubmitted events
- loan_events: Indexed LoanApproved events
- repay_events: Indexed Repaid events
- indexer_state: Block tracking for indexer
"""

from sqlalchemy import create_engine, Column, String, Integer, BigInteger, Boolean, DateTime, Text, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

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
