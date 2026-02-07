
# Sepolia Smoke Test
# Runs a full flow on Sepolia

import os
import sys
import time
import requests
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

# Load env from apps/api/.env
load_dotenv("apps/api/.env")

API_URL = "http://localhost:8000"

def main():
    print("🔥 UnEmpower Sepolia Smoke Test")
    print("=" * 40)
    
    # 1. Check API Health
    try:
        r = requests.get(f"{API_URL}/health")
        if r.status_code != 200:
            print("❌ API not healthy")
            sys.exit(1)
        print("✅ API Healthy")
    except Exception as e:
        print(f"❌ API connection failed: {e}")
        sys.exit(1)
        
    # 2. Simulate WorkProof (Admin)
    print("\nSimulating Work Proof...")
    worker = Account.create()
    payload = {
        "worker_address": worker.address,
        "work_units": 10,
        "earned_amount": "50000000" # 50 USDC
    }
    r = requests.post(f"{API_URL}/workproof/simulate", json=payload)
    if r.status_code != 200:
        print(f"❌ Simulation failed: {r.text}")
        sys.exit(1)
    print(f"✅ Work Proof Submitted: {r.json()['tx_hash']}")
    
    # Wait for indexing
    print("Waiting for indexing (15s)...")
    time.sleep(15)
    
    # 3. Generate Offer
    print("\nGenerating Offer...")
    r = requests.post(f"{API_URL}/ai/offer", json={"worker_address": worker.address})
    if r.status_code != 200:
        print(f"❌ Offer generation failed: {r.text}")
        sys.exit(1)
    offer = r.json()
    print(f"✅ Offer Generated: Credit Limit {int(offer['attestation']['creditLimit'])/1e6} USDC")
    
    print("\n✅ Smoke Test Passed!")

if __name__ == "__main__":
    main()
