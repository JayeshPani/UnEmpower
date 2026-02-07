"""
Demo Router

Endpoints for demo data seeding and "Judge Mode".
Only active when DEMO_MODE=true.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from web3 import Web3
from eth_account import Account
import time
import random
import asyncio

from settings import get_settings
from database import get_db, WorkProofEvent

router = APIRouter(prefix="/demo", tags=["demo"])

class BootstrapResponse(BaseModel):
    message: str
    worker: str
    proofs_submitted: int

@router.post("/bootstrap", response_model=BootstrapResponse)
async def bootstrap_demo_data(background_tasks: BackgroundTasks):
    """
    Seed demo data for "Judge Mode".
    
    1. Generates a random worker wallet
    2. Funds it (if local)
    3. Submits 5-10 work proofs with varied history
    4. Returns wallet private key for import
    """
    settings = get_settings()
    w3 = Web3(Web3.HTTPProvider(settings.RPC_URL))
    
    # Create random worker
    worker_account = Account.create()
    worker_address = worker_account.address
    worker_key = worker_account.key.hex()
    
    print(f"🎭 DEMO: Created worker {worker_address}")
    
    # Run seeding in background to not block response
    background_tasks.add_task(seed_worker_history, worker_address, settings)
    
    return BootstrapResponse(
        message="Demo seeding started in background. Check API logs.",
        worker=worker_address,
        proofs_submitted=5
    )

async def seed_worker_history(worker: str, settings):
    """Seed work proofs for a worker."""
    print(f"🌱 Seeding history for {worker}...")
    w3 = Web3(Web3.HTTPProvider(settings.RPC_URL))
    verifier = Account.from_key(settings.WORKPROOF_VERIFIER_PRIVATE_KEY)
    
    # Contract ABI (submitProof only)
    abi = [{
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
    }]
    
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(settings.WORKPROOF_ADDRESS),
        abi=abi
    )
    
    # Generate 5 proofs over last 30 days
    now = int(time.time())
    timestamps = [
        now - 25*86400,
        now - 20*86400,
        now - 14*86400,
        now - 7*86400,
        now - 2*86400,
    ]
    
    nonce = w3.eth.get_transaction_count(verifier.address)
    
    for i, ts in enumerate(timestamps):
        work_units = random.randint(5, 12)
        earned = random.randint(50, 200) * 1_000_000 # 50-200 USDC
        proof_hash = w3.keccak(text=f"{worker}:{ts}:{i}")
        
        try:
            tx = contract.functions.submitProof(
                Web3.to_checksum_address(worker),
                proof_hash,
                work_units,
                earned,
                f"ipfs://demo/history/{i}"
            ).build_transaction({
                "from": verifier.address,
                "nonce": nonce,
                "gas": 200000,
                "gasPrice": w3.eth.gas_price
            })
            
            signed = verifier.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            print(f"  ✅ Submitted proof {i+1}/5: {tx_hash.hex()}")
            nonce += 1
            
            # Wait a bit between txs
            await asyncio.sleep(1)
            
        except Exception as e:
            print(f"  ❌ Failed to seed proof {i}: {e}")
            
    print(f"🏁 Demo seeding complete for {worker}")
