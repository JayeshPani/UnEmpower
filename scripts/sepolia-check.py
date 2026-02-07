
# Sepolia Check Script
# Validates environment and contract setup for Sepolia

import os
import sys
import json
from web3 import Web3
from dotenv import load_dotenv

# Load env from apps/api/.env
load_dotenv("apps/api/.env")

def check_env_var(name):
    val = os.getenv(name)
    if not val:
        print(f"❌ Missing {name}")
        return False
    print(f"✅ {name}: {val[:10]}...")
    return True

def main():
    print("🔍 UnEmpower Sepolia Preflight Check")
    print("=" * 40)
    
    # Check Env Vars
    required_vars = [
        "RPC_URL", "CHAIN_ID", 
        "WORKER_REGISTRY_ADDRESS", "WORKPROOF_ADDRESS",
        "ATTESTATION_VERIFIER_ADDRESS", "LOAN_VAULT_ADDRESS",
        "MOCK_USDC_ADDRESS",
        "AI_SIGNER_PRIVATE_KEY", "WORKPROOF_VERIFIER_PRIVATE_KEY"
    ]
    
    all_vars_ok = all(check_env_var(v) for v in required_vars)
    if not all_vars_ok:
        sys.exit(1)
        
    rpc_url = os.getenv("RPC_URL")
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    
    # Check Connection
    if not w3.is_connected():
        print("❌ Cannot connect to RPC_URL")
        sys.exit(1)
    
    chain_id = w3.eth.chain_id
    if str(chain_id) != os.getenv("CHAIN_ID"):
        print(f"❌ Chain ID mismatch: Expected {os.getenv('CHAIN_ID')}, got {chain_id}")
        sys.exit(1)
    print(f"✅ Connected to chain {chain_id}")
    
    # Check Contracts
    contracts = [
        "WORKER_REGISTRY_ADDRESS", "WORKPROOF_ADDRESS",
        "ATTESTATION_VERIFIER_ADDRESS", "LOAN_VAULT_ADDRESS",
        "MOCK_USDC_ADDRESS"
    ]
    
    for c in contracts:
        addr = os.getenv(c)
        if not w3.is_address(addr):
            print(f"❌ Invalid address for {c}: {addr}")
            sys.exit(1)
        code = w3.eth.get_code(addr)
        if len(code) <= 2:
            print(f"❌ No code at {c}: {addr}")
            sys.exit(1)
        print(f"✅ Contract code found at {c}")
            
    print("\n✅ Sepolia Preflight Passed!")
    
if __name__ == "__main__":
    main()
