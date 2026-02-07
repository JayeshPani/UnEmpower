#!/usr/bin/env python3
"""
Debug Worker Script - AI Feature Pack v1 Validation

Tests all AI features for a given worker address.
Usage: python scripts/debug_worker.py --worker 0x...
"""

import argparse
import sys
import os

# Add apps/api to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'api'))


def main():
    parser = argparse.ArgumentParser(description='Debug AI features for a worker')
    parser.add_argument('--worker', required=True, help='Worker address (0x...)')
    parser.add_argument('--api-url', default='http://localhost:8000', help='API base URL')
    parser.add_argument('--offline', action='store_true', help='Use offline mode (direct service calls)')
    args = parser.parse_args()
    
    worker = args.worker.lower()
    
    print("=" * 70)
    print(f"🔍 AI Feature Pack v1 - Worker Debug Report")
    print(f"   Worker: {worker}")
    print("=" * 70)
    
    if args.offline:
        run_offline_debug(worker)
    else:
        run_api_debug(worker, args.api_url)


def run_offline_debug(worker: str):
    """Run debug using direct service calls (no API server needed)."""
    print("\n📡 Mode: OFFLINE (direct service calls)")
    print("-" * 70)
    
    try:
        # Import services
        from services.features import get_worker_features
        from services.forecasting import forecast_income
        from services.fraud import compute_anomaly_score
        from services.workproof_integrity import check_workproof_integrity
        from services.early_warning import compute_early_warning
        
        # 1. Features
        print("\n📊 STEP 1: Feature Extraction")
        print("-" * 40)
        features = get_worker_features(worker)
        print_dict(features, indent=2)
        
        # 2. Forecast
        print("\n📈 STEP 2: Income Forecast")
        print("-" * 40)
        forecast = forecast_income(worker)
        print_dict({
            "expectedIncome_14d": forecast.get("expectedIncome_14d"),
            "expectedIncome_30d": forecast.get("expectedIncome_30d"),
            "incomeVolatility": forecast.get("incomeVolatility"),
            "volatilityLabel": forecast.get("incomeVolatilityLabel"),
            "confidence": forecast.get("confidence"),
            "confidenceLabel": forecast.get("confidenceLabel"),
        }, indent=2)
        
        # 3. Fraud Detection
        print("\n🔴 STEP 3: Fraud Anomaly Detection")
        print("-" * 40)
        fraud = compute_anomaly_score(worker)
        print_dict({
            "anomalyScore": fraud.get("anomalyScore"),
            "riskLevel": fraud.get("riskLevel"),
            "reasons": fraud.get("reasons"),
        }, indent=2)
        
        # 4. WorkProof Integrity
        print("\n🔍 STEP 4: WorkProof Integrity Check")
        print("-" * 40)
        integrity = check_workproof_integrity(worker)
        print_dict({
            "flagScore": integrity.get("flagScore"),
            "riskLevel": integrity.get("riskLevel"),
            "flags": integrity.get("flags"),
            "proofCount": integrity.get("proofCount"),
        }, indent=2)
        
        # 5. Early Warning
        print("\n⚠️ STEP 5: Default Early Warning")
        print("-" * 40)
        warning = compute_early_warning(worker)
        print_dict({
            "riskScore": warning.get("riskScore"),
            "riskLevel": warning.get("riskLevel"),
            "defaultRiskNext7d": warning.get("defaultRiskNext7d"),
            "defaultRiskNext14d": warning.get("defaultRiskNext14d"),
            "reasons": warning.get("reasons"),
        }, indent=2)
        
        # 6. Compute fraudFlags
        print("\n🚩 STEP 6: fraudFlags Bitmask")
        print("-" * 40)
        fraud_flags = compute_fraud_flags(
            fraud.get("anomalyScore", 0),
            integrity.get("flagScore", 0),
            warning.get("riskScore", 0)
        )
        print_dict(fraud_flags, indent=2)
        
        print("\n" + "=" * 70)
        print("✅ Debug complete!")
        print("=" * 70)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def run_api_debug(worker: str, api_url: str):
    """Run debug using API calls."""
    import requests
    
    print(f"\n📡 Mode: API ({api_url})")
    print("-" * 70)
    
    try:
        # 1. Stats
        print("\n📊 STEP 1: /stats/worker")
        print("-" * 40)
        r = requests.get(f"{api_url}/stats/worker", params={"worker": worker})
        if r.ok:
            print_dict(r.json().get("features", {}), indent=2)
        else:
            print(f"  ❌ Error: {r.status_code} - {r.text}")
        
        # 2. Forecast
        print("\n📈 STEP 2: /forecast/worker")
        print("-" * 40)
        r = requests.get(f"{api_url}/forecast/worker", params={"worker": worker})
        if r.ok:
            print_dict(r.json().get("forecast", {}), indent=2)
        else:
            print(f"  ❌ Error: {r.status_code} - {r.text}")
        
        # 3. Fraud
        print("\n🔴 STEP 3: /fraud/worker")
        print("-" * 40)
        r = requests.get(f"{api_url}/fraud/worker", params={"worker": worker})
        if r.ok:
            print_dict(r.json().get("fraud", {}), indent=2)
        else:
            print(f"  ❌ Error: {r.status_code} - {r.text}")
        
        # 4. Integrity
        print("\n🔍 STEP 4: /workproof/integrity")
        print("-" * 40)
        r = requests.get(f"{api_url}/workproof/integrity", params={"worker": worker})
        if r.ok:
            print_dict(r.json().get("integrity", {}), indent=2)
        else:
            print(f"  ❌ Error: {r.status_code} - {r.text}")
        
        # 5. Alerts
        print("\n⚠️ STEP 5: /alerts/worker")
        print("-" * 40)
        r = requests.get(f"{api_url}/alerts/worker", params={"worker": worker})
        if r.ok:
            print_dict(r.json().get("alert", {}), indent=2)
        else:
            print(f"  ❌ Error: {r.status_code} - {r.text}")
        
        # 6. Full Offer
        print("\n💰 STEP 6: /ai/offer (Full AI Integration)")
        print("-" * 40)
        r = requests.post(f"{api_url}/ai/offer", json={"worker_address": worker})
        if r.ok:
            data = r.json()
            print("  Attestation:")
            print_dict(data.get("attestation", {}), indent=4)
            print("\n  fraudFlagsBitmask:")
            print_dict(data.get("fraudFlagsBitmask", {}), indent=4)
            print("\n  AI Signals:")
            print(f"    forecast: {data.get('forecast', {})}")
            print(f"    earlyWarning: {data.get('earlyWarning', {})}")
            print(f"    fraudSignal: {data.get('fraudSignal', {})}")
            print(f"    workproofIntegrity: {data.get('workproofIntegrity', {})}")
            print(f"    coach: {data.get('coach', {})}")
        else:
            print(f"  ❌ Error: {r.status_code} - {r.text}")
        
        print("\n" + "=" * 70)
        print("✅ Debug complete!")
        print("=" * 70)
        
    except requests.exceptions.ConnectionError:
        print(f"\n❌ Cannot connect to API at {api_url}")
        print("   Make sure the API is running: pnpm api:dev")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


def compute_fraud_flags(anomaly_score: int, flag_score: int, risk_score: int) -> dict:
    """Compute fraudFlags bitmask based on scores."""
    FLAG_HARD_BLOCK = 1
    FLAG_ANOMALY_SUSPECT = 2
    FLAG_WORKPROOF_SUSPECT = 4
    FLAG_EARLY_WARNING_HIGH = 8
    FLAG_FAIRNESS_REVIEW = 16
    
    fraud_flags = 0
    
    if anomaly_score >= 85 or flag_score >= 85:
        fraud_flags |= FLAG_HARD_BLOCK
    
    if anomaly_score >= 50:
        fraud_flags |= FLAG_ANOMALY_SUSPECT
    
    if flag_score >= 50:
        fraud_flags |= FLAG_WORKPROOF_SUSPECT
    
    if risk_score >= 60:
        fraud_flags |= FLAG_EARLY_WARNING_HIGH
    
    return {
        "value": fraud_flags,
        "binary": bin(fraud_flags),
        "HARD_BLOCK": bool(fraud_flags & FLAG_HARD_BLOCK),
        "ANOMALY_SUSPECT": bool(fraud_flags & FLAG_ANOMALY_SUSPECT),
        "WORKPROOF_SUSPECT": bool(fraud_flags & FLAG_WORKPROOF_SUSPECT),
        "EARLY_WARNING_HIGH": bool(fraud_flags & FLAG_EARLY_WARNING_HIGH),
        "FAIRNESS_REVIEW": bool(fraud_flags & FLAG_FAIRNESS_REVIEW),
    }


def print_dict(d: dict, indent: int = 0):
    """Pretty print a dictionary."""
    prefix = " " * indent
    for k, v in d.items():
        if isinstance(v, dict):
            print(f"{prefix}{k}:")
            print_dict(v, indent + 2)
        elif isinstance(v, list):
            if len(v) == 0:
                print(f"{prefix}{k}: []")
            else:
                print(f"{prefix}{k}:")
                for item in v[:5]:  # Limit to 5 items
                    print(f"{prefix}  - {item}")
                if len(v) > 5:
                    print(f"{prefix}  ... and {len(v) - 5} more")
        else:
            print(f"{prefix}{k}: {v}")


if __name__ == "__main__":
    main()
