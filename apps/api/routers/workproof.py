"""
WorkProof Router

Handles work proof simulation and on-chain submission.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from web3 import Web3
from eth_account import Account
import time

from settings import get_settings
from database import get_db, WorkProofEvent

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
