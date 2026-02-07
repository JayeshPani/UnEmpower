---
description: How to run the UnEmpower project locally
---

# UnEmpower: Step-by-Step Local Setup Guide

This guide is for Cursor AI or any developer to run the **UnEmpower** project—an AI-first, blockchain-enforced worker lending MVP.

---

## Prerequisites Checklist

Before running any commands, ensure the following are installed:

| Requirement       | Version   | Check Command          |
|-------------------|-----------|------------------------|
| Node.js           | ≥18.0.0   | `node -v`              |
| pnpm              | ≥8.0.0    | `pnpm -v`              |
| Docker Desktop    | Latest    | `docker --version`     |
| Python 3          | ≥3.9      | `python3 --version`    |

> [!IMPORTANT]
> Docker Desktop must be **running** before starting. The database runs in a Docker container.

---

## Quick Start (One Command)

For the fastest setup, run this from the project root:

```bash
// turbo
pnpm dev:all
```

This single command will:
1. ✅ Start PostgreSQL database (Docker container on port 5433)
2. ✅ Start Hardhat local blockchain node (port 8545)
3. ✅ Compile and deploy smart contracts
4. ✅ Setup roles and seed liquidity
5. ✅ Start FastAPI backend (port 8000)
6. ✅ Start blockchain event indexer
7. ✅ Start Next.js frontend (port 3000)

**Access Points:**
- **Web App**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs

---

## Manual Step-by-Step Setup

If the one-command approach fails or you need finer control, follow these steps:

### Step 1: Install Dependencies

```bash
// turbo
pnpm install
```

### Step 2: Start Database

```bash
// turbo
pnpm db:up
```

Wait for PostgreSQL to be ready on port **5433**.

### Step 3: Start Hardhat Node

Open a **new terminal** and run:

```bash
// turbo
pnpm contracts:node
```

Keep this terminal running. The local blockchain runs on **port 8545**.

### Step 4: Deploy Contracts

In another terminal:

```bash
// turbo
pnpm contracts:deploy:local
```

### Step 5: Setup Roles & Seed Liquidity

```bash
// turbo
pnpm contracts:setup:local
pnpm contracts:seed:local
```

### Step 6: Sync Environment Variables

The deploy script should auto-generate addresses. If not, manually copy contract addresses from the deployment output to:
- `apps/api/.env` (copy from `.env.example` if missing)
- `apps/web/.env.local`

### Step 7: Start API Backend

```bash
// turbo
pnpm api:dev
```

API will be available at **http://localhost:8000**.

### Step 8: Start Event Indexer (Optional but Recommended)

In a new terminal:

```bash
// turbo
pnpm api:indexer
```

### Step 9: Start Frontend

```bash
// turbo
pnpm web:dev
```

Frontend will be available at **http://localhost:3000**.

---

## Environment Configuration

### Root `.env` (for contract deployment)

```bash
LOCAL_RPC_URL=http://127.0.0.1:8545
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
AI_SIGNER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

### `apps/api/.env` (backend)

```bash
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
WORKER_REGISTRY_ADDRESS=0x...
WORKPROOF_ADDRESS=0x...
ATTESTATION_VERIFIER_ADDRESS=0x...
LOAN_VAULT_ADDRESS=0x...
MOCK_USDC_ADDRESS=0x...
AI_SIGNER_PRIVATE_KEY=0x...
WORKPROOF_VERIFIER_PRIVATE_KEY=0x...
POSTGRES_URL=postgresql://unempower:unempower123@localhost:5433/unempower
CORS_ORIGINS=http://localhost:3000
DEMO_MODE=true
```

### `apps/web/.env.local` (frontend)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_CONTRACT_WORKER_REGISTRY=0x...
NEXT_PUBLIC_CONTRACT_WORKPROOF=0x...
NEXT_PUBLIC_CONTRACT_ATTESTATION_VERIFIER=0x...
NEXT_PUBLIC_CONTRACT_LOAN_VAULT=0x...
NEXT_PUBLIC_CONTRACT_MOCK_USDC=0x...
NEXT_PUBLIC_DEMO_ADMIN=true
```

---

## Verification & Testing

### Health Check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "chain": "connected",
  "chain_id": 31337
}
```

### Seed Demo Data

```bash
// turbo
pnpm demo:bootstrap
```

### Run E2E Tests

```bash
// turbo
pnpm test:e2e
```

---

## Clean Restart

To reset all state (database + contracts):

```bash
// turbo
pnpm dev:all:clean
```

Or manually:

```bash
// turbo
pnpm db:reset
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Docker not running | Start Docker Desktop first |
| Port 5433 in use | Stop other Postgres instances or change port in `docker-compose.yml` |
| Port 8545 in use | Stop other blockchain nodes |
| Contract addresses missing | Re-run `pnpm contracts:deploy:local` and check output |
| API fails to start | Ensure correct contract addresses in `apps/api/.env` |
| Frontend 500 errors | Check API is running on port 8000 |

---

## Architecture Summary

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  Next.js    │────▶│  FastAPI    │────▶│  PostgreSQL         │
│  :3000      │     │  :8000      │     │  :5433              │
└──────┬──────┘     └──────┬──────┘     └─────────────────────┘
       │                   │
       └───────────────────┴──────────────────┐
                                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Hardhat Node :8545                        │
│  WorkerRegistry  WorkProof  CreditAttestationVerifier       │
│  LoanVault       MockUSDC                                   │
└─────────────────────────────────────────────────────────────┘
```
