"""
WorkProof Router

Handles work proof simulation, on-chain submission, and full demo data generation.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, String
from web3 import Web3
from eth_account import Account
import time
import random
from datetime import date, timedelta, datetime

from settings import get_settings
from database import get_db, WorkProofEvent, Worker, Project, ShiftLog, PerformanceReview, WorkTypeModel
from services.work_calc import compute_work_units_and_earned

router = APIRouter(prefix="/workproof", tags=["workproof"])


# WorkProof contract ABI (minimal for submission)
WORKPROOF_ABI = [
    {
        "name": "submitProof",
        "type": "function",
        "inputs": [
            {"name": "_worker", "type": "address"},
            {"name": "_proofHash", "type": "bytes32"},
            {"name": "_workUnits", "type": "uint256"},
            {"name": "_earnedAmount", "type": "uint256"},
            {"name": "_proofURI", "type": "string"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "nonpayable",
    },
    {
        "name": "getWorkerProofIds",
        "type": "function",
        "inputs": [{"name": "_worker", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256[]"}],
        "stateMutability": "view",
    },
    {
        "name": "getProof",
        "type": "function",
        "inputs": [{"name": "_proofId", "type": "uint256"}],
        "outputs": [
            {"name": "", "type": "tuple", "components": [
                {"name": "worker", "type": "address"},
                {"name": "proofHash", "type": "bytes32"},
                {"name": "workUnits", "type": "uint256"},
                {"name": "earnedAmount", "type": "uint256"},
                {"name": "timestamp", "type": "uint256"},
                {"name": "proofURI", "type": "string"},
            ]},
        ],
        "stateMutability": "view",
    },
]


class SimulateRequest(BaseModel):
    """Request to simulate a work proof."""
    worker_address: str
    work_units: Optional[int] = 10
    earned_amount: Optional[str] = "100000000"  # 100 USDC in decimals
    proof_uri: Optional[str] = "ipfs://demo"


class SimulateResponse(BaseModel):
    """Response from simulating a work proof."""
    success: bool
    tx_hash: Optional[str] = None
    proof_id: Optional[int] = None
    message: str


class ProofResponse(BaseModel):
    """Work proof data."""
    proof_id: int
    worker: str
    work_units: int
    earned_amount: str
    timestamp: int
    tx_hash: Optional[str] = None


@router.post("/simulate", response_model=SimulateResponse)
async def simulate_workproof(request: SimulateRequest):
    """
    Simulate a work proof submission on-chain.
    
    This endpoint uses the backend verifier key to submit a work proof
    for a given worker. Used for demo/testing purposes.
    """
    settings = get_settings()
    
    if not Web3.is_address(request.worker_address):
        raise HTTPException(status_code=400, detail="Invalid worker address")
    
    try:
        w3 = Web3(Web3.HTTPProvider(settings.RPC_URL))
        
        # Get verifier account
        verifier = Account.from_key(settings.WORKPROOF_VERIFIER_PRIVATE_KEY)
        
        # Create contract instance
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(settings.WORKPROOF_ADDRESS),
            abi=WORKPROOF_ABI,
        )
        
        # Generate proof hash
        proof_data = f"{request.worker_address}:{time.time()}:{request.work_units}"
        proof_hash = w3.keccak(text=proof_data)
        
        # Build transaction
        earned_amount = int(request.earned_amount)
        
        tx = contract.functions.submitProof(
            Web3.to_checksum_address(request.worker_address),
            proof_hash,
            request.work_units,
            earned_amount,
            request.proof_uri or f"ipfs://demo/{int(time.time())}",
        ).build_transaction({
            "from": verifier.address,
            "nonce": w3.eth.get_transaction_count(verifier.address),
            "gas": 200000,
            "gasPrice": w3.eth.gas_price,
        })
        
        # Sign and send
        signed = verifier.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        
        # Wait for receipt
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
        
        if receipt["status"] == 1:
            # Try to get proof ID from logs
            proof_id = None
            if receipt["logs"]:
                # First topic is event sig, second is proofId (indexed)
                log = receipt["logs"][0]
                if len(log["topics"]) > 1:
                    proof_id = int(log["topics"][1].hex(), 16)
            
            return SimulateResponse(
                success=True,
                tx_hash=tx_hash.hex(),
                proof_id=proof_id,
                message="Work proof submitted successfully",
            )
        else:
            return SimulateResponse(
                success=False,
                tx_hash=tx_hash.hex(),
                message="Transaction reverted",
            )
            
    except Exception as e:
        print(f"❌ WorkProof simulation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@router.get("/worker/{address}", response_model=List[ProofResponse])
async def get_worker_proofs(
    address: str,
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
):
    """
    Get work proofs for a worker from indexed database.
    """
    worker = address.lower()
    
    proofs = db.query(WorkProofEvent).filter(
        WorkProofEvent.worker == worker
    ).order_by(desc(WorkProofEvent.event_timestamp)).limit(limit).all()
    
    return [
        ProofResponse(
            proof_id=p.proof_id,
            worker=p.worker,
            work_units=p.work_units,
            earned_amount=p.earned_amount,
            timestamp=p.event_timestamp,
            tx_hash=p.tx_hash,
        )
        for p in proofs
    ]


@router.get("/stats/{address}")
async def get_worker_stats(
    address: str,
    db: Session = Depends(get_db),
):
    """
    Get summary statistics for a worker.
    """
    worker = address.lower()
    
    proofs = db.query(WorkProofEvent).filter(
        WorkProofEvent.worker == worker
    ).all()
    
    if not proofs:
        return {
            "worker": worker,
            "total_proofs": 0,
            "total_work_units": 0,
            "total_earned": "0",
            "has_indexed_data": False,
        }
    
    total_work_units = sum(p.work_units for p in proofs)
    total_earned = sum(int(p.earned_amount) for p in proofs)
    
    return {
        "worker": worker,
        "total_proofs": len(proofs),
        "total_work_units": total_work_units,
        "total_earned": str(total_earned),
        "has_indexed_data": True,
    }


# =====================================================================
# Full Simulation — creates off-chain worker + project + work logs
# =====================================================================

_DEMO_PROJECTS = [
    {"name": "Metro Bridge Construction", "location": "Mumbai", "unit_type": "HOURS", "rate": 180, "work_type": "Construction"},
    {"name": "Warehouse Security", "location": "Pune", "unit_type": "SHIFTS", "rate": 600, "work_type": "Security"},
    {"name": "Last-Mile Delivery", "location": "Delhi", "unit_type": "KM", "rate": 14, "work_type": "Delivery"},
    {"name": "Site Inspection", "location": "Bangalore", "unit_type": "TASKS", "rate": 350, "work_type": "Inspection"},
]

_DEMO_NAMES = ["Rajesh Kumar", "Priya Sharma", "Amit Patel", "Sunita Devi", "Vikram Singh", "Meena Rao"]

_DEMO_REVIEW_TAGS = [
    (["excellent", "safe"], 5, "Outstanding performance, follows all safety protocols"),
    (["punctual", "reliable"], 4, "Always on time, consistent quality"),
    (["hardworking"], 4, "Very dedicated worker, good effort"),
    (["safe"], 3, "Adequate work, meets basic requirements"),
    (["late"], 2, "Was late multiple times this week"),
    (["excellent", "fast"], 5, "Completed ahead of schedule with excellent quality"),
]


class FullSimulateRequest(BaseModel):
    wallet_address: str
    num_days: int = 14
    project_name: Optional[str] = None


class FullSimulateResponse(BaseModel):
    success: bool
    message: str
    worker_id: int
    worker_name: str
    project_name: str
    logs_created: int
    reviews_created: int
    total_earned: int
    total_units: float


@router.post("/simulate-full", response_model=FullSimulateResponse)
def simulate_full_workproof(
    request: FullSimulateRequest,
    db: Session = Depends(get_db),
):
    """
    Create a complete demo worker profile with realistic work history.

    Auto-creates:
    - Work type (if needed)
    - Project (if needed)
    - Worker (linked to wallet)
    - 7-14 days of work logs with varied unit types, rates, quality
    - 2-3 performance reviews with tags

    All data flows into /worker/summary and the WorkProofs page.
    """
    if not Web3.is_address(request.wallet_address):
        raise HTTPException(status_code=400, detail="Invalid wallet address")

    wallet = Web3.to_checksum_address(request.wallet_address)

    # Check if worker already exists for this wallet
    existing = db.query(Worker).filter(
        func.lower(Worker.wallet_address) == wallet.lower()
    ).first()

    if existing:
        # Worker exists — add more work logs with a fresh demo project for variety
        worker = existing
        # Always create a new demo project (different unit type) for richer data
        project = _create_demo_project(db)
        # Keep the worker's primary project assignment
        if not worker.project_id:
            worker.project_id = project.id
            db.commit()
    else:
        # Create fresh demo data
        project = None
        if request.project_name:
            project = db.query(Project).filter(Project.name == request.project_name).first()

        if not project:
            project = _create_demo_project(db)

        worker_name = random.choice(_DEMO_NAMES)
        worker = Worker(
            full_name=worker_name,
            phone=f"98{random.randint(10000000, 99999999)}",
            wallet_address=wallet,
            project_id=project.id,
            rate_per_unit=project.default_unit_rate or project.default_rate_per_hour or 150,
            status="active",
        )
        db.add(worker)
        db.commit()
        db.refresh(worker)

    # Get project unit type
    proj_unit_type = project.unit_type or "HOURS"
    proj_rate = project.default_unit_rate or project.default_rate_per_hour or 150

    # Generate work logs for the past N days
    today = date.today()
    num_days = min(request.num_days, 30)
    logs_created = 0
    total_earned = 0
    total_units = 0.0

    for day_offset in range(num_days):
        d = today - timedelta(days=day_offset)
        # Skip some days randomly (weekends / rest)
        if random.random() < 0.2:
            continue

        # Check if log already exists for this day + project combo
        d_str = d.isoformat()
        exists = db.query(ShiftLog).filter(
            ShiftLog.worker_id == worker.id,
            ShiftLog.project_id == project.id,
            func.cast(ShiftLog.date, String) == d_str,
        ).first()
        if exists:
            continue

        # Generate realistic values based on unit type
        if proj_unit_type == "HOURS":
            hours = round(random.uniform(4, 9), 1)
            units = hours
            rate = proj_rate + random.randint(-20, 20)
        elif proj_unit_type == "SHIFTS":
            hours = round(random.uniform(8, 12), 1)
            units = 1.0
            rate = proj_rate + random.randint(-50, 50)
        elif proj_unit_type == "KM":
            hours = round(random.uniform(3, 8), 1)
            units = round(random.uniform(15, 60), 1)
            rate = proj_rate + random.randint(-2, 3)
        elif proj_unit_type == "TASKS":
            hours = round(random.uniform(2, 6), 1)
            units = random.randint(1, 5)
            rate = proj_rate + random.randint(-30, 50)
        else:
            hours = round(random.uniform(4, 8), 1)
            units = hours
            rate = proj_rate

        earned = round(units * rate)
        quality = random.randint(55, 98)

        notes_options = [
            "Regular shift completed", "Morning shift", "Afternoon work",
            "Site A work done", "Good progress today", "Material handling",
            "Quality inspection done", "Completed on time", "Extra hours logged",
            "Team coordination", "Safety briefing attended", "Equipment maintenance",
        ]

        log = ShiftLog(
            worker_id=worker.id,
            project_id=project.id,
            date=d_str,
            hours_worked=hours,
            work_units=units,
            unit_type=proj_unit_type,
            units_done=units,
            rate_per_unit=rate,
            earned=earned,
            quality_score=quality,
            notes=random.choice(notes_options),
        )
        db.add(log)
        logs_created += 1
        total_earned += earned
        total_units += units

    # Generate reviews
    reviews_created = 0
    num_reviews = random.randint(2, 4)
    for i in range(num_reviews):
        review_day = today - timedelta(days=random.randint(1, num_days))
        # Check if review already exists for this day
        r_str = review_day.isoformat()
        exists = db.query(PerformanceReview).filter(
            PerformanceReview.worker_id == worker.id,
            func.cast(PerformanceReview.review_date, String) == r_str,
        ).first()
        if exists:
            continue

        tags, rating, comment = random.choice(_DEMO_REVIEW_TAGS)
        reviewer_names = ["Sunil Foreman", "Anita Manager", "Ravi Supervisor", "Deepak Lead"]

        review = PerformanceReview(
            worker_id=worker.id,
            review_date=r_str,
            rating=rating,
            comment=comment,
            reviewer_name=random.choice(reviewer_names),
            tags=tags,
            review_source="manager",
        )
        db.add(review)
        reviews_created += 1

    db.commit()

    print(f"  [SIMULATE] Created {logs_created} logs, {reviews_created} reviews for wallet={wallet[:10]}... earned={total_earned}")

    return FullSimulateResponse(
        success=True,
        message=f"Demo data created: {logs_created} work logs, {reviews_created} reviews",
        worker_id=worker.id,
        worker_name=worker.full_name,
        project_name=project.name,
        logs_created=logs_created,
        reviews_created=reviews_created,
        total_earned=total_earned,
        total_units=round(total_units, 2),
    )


def _create_demo_project(db: Session) -> Project:
    """Create a random demo project with a work type. Avoids duplicates."""
    # Try to find a template that doesn't already exist
    existing_names = {p.name for p in db.query(Project.name).all()}
    available = [t for t in _DEMO_PROJECTS if t["name"] not in existing_names]
    if not available:
        # All templates used — add a numbered suffix
        template = random.choice(_DEMO_PROJECTS)
        template = dict(template)  # copy
        template["name"] = f"{template['name']} #{random.randint(2, 99)}"
    else:
        template = random.choice(available)

    # Get or create work type
    wt = db.query(WorkTypeModel).filter(WorkTypeModel.name == template["work_type"]).first()
    if not wt:
        wt = WorkTypeModel(
            name=template["work_type"],
            unit_type=template["unit_type"],
            default_unit_rate=template["rate"],
        )
        db.add(wt)
        db.commit()
        db.refresh(wt)

    project = Project(
        name=template["name"],
        location=template["location"],
        default_rate_per_hour=template["rate"],
        work_type_id=wt.id,
        unit_type=template["unit_type"],
        default_unit_rate=template["rate"],
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project
