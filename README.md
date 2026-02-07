# UnEmpower

**AI-First + Blockchain-Enforced Worker Lending MVP**

Workers earn verifiable work proofs on-chain, AI generates credit attestations (EIP-712), and smart contracts enable trustless borrowing.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  Next.js    │────▶│  FastAPI    │────▶│  PostgreSQL         │
│  Frontend   │     │  Backend    │     │  (Event Index)      │
└──────┬──────┘     └──────┬──────┘     └─────────────────────┘
       │                   │
       │    ┌──────────────┴──────────────┐
       ▼    ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Sepolia / Hardhat                         │
│  WorkerRegistry  WorkProof  CreditAttestationVerifier       │
│  LoanVault       MockUSDC                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 One-Command Local Start (Judge Mode)

The easiest way to run the full stack locally:

```bash
pnpm dev:all
```

This will:
1. Start PostgreSQL
2. Start Hardhat node
3. Deploy contracts & seed liquidity
4. Start API, Indexer, and Frontend

**App**: [http://localhost:3000](http://localhost:3000)  
**API**: [http://localhost:8000/docs](http://localhost:8000/docs)

To reset everything (clean DB):
```bash
pnpm dev:all:clean
```

---

## 🎭 Demo & QA Scripts

### Seed Demo Data
Populate the app with a worker history for testing:

```bash
pnpm demo:bootstrap
```

### Run E2E Smoke Tests
Verify the core flow (Register -> WorkProof -> Offer -> Borrow -> Repay):

```bash
pnpm test:e2e
```

---

## 🌐 Sepolia Backend Bring-up (Recommended)

### 1. One-Command Backend Start

Start PostgreSQL, API, and Indexer with a single command:

```bash
pnpm backend:sepolia
```

This command:
- ✅ Checks Docker daemon is running
- ✅ Validates required env vars in `apps/api/.env`
- ✅ Starts PostgreSQL container
- ✅ Waits for DB to be ready
- ✅ Starts API + Indexer concurrently

**If Docker is not running**, the script will exit with instructions.

### 2. Validate Backend

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "chain": "connected",
  "chain_id": 11155111,
  "current_block": 7700000
}
```

### 3. Start Frontend

In a separate terminal:

```bash
pnpm web:dev
```

**Web App**: [http://localhost:3001](http://localhost:3001)

### 4. Complete the E2E Flow

| Step | Action | Notes |
|------|--------|-------|
| 1 | Connect MetaMask to Sepolia | Switch network in MetaMask |
| 2 | Register as Worker | Click "Get Started" → Register |
| 3 | Simulate WorkProof | Use Admin "Simulate Work" button (requires backend) |
| 4 | Generate Credit Offer | Navigate to "Get Offer" |
| 5 | Borrow | Accept offer and sign transaction |
| 6 | Repay | Navigate to "Loan" → Repay |

> **Note**: The "Simulate WorkProof" feature requires the backend to be running, as it uses the verifier key to submit work proofs on-chain.

---

## 🔧 Sepolia Deploy & Setup

If contracts are not yet deployed:

```bash
# 1. Set credentials in root .env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
DEPLOYER_PRIVATE_KEY=0x...

# 2. Deploy contracts
pnpm contracts:deploy:sepolia

# 3. Setup roles and seed liquidity
pnpm contracts:setup:sepolia
pnpm contracts:seed:sepolia

# 4. Copy addresses to apps/api/.env and apps/web/.env.local
```

### Smoke Test

```bash
pnpm sepolia:smoke
```

---

## Environment Variables

### `apps/api/.env`

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
POSTGRES_URL=postgresql://unempower:unempower123@localhost:5432/unempower
CORS_ORIGINS=http://localhost:3000
DEMO_MODE=true
```

### `apps/web/.env.local`

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

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (DB status) |
| `/demo/bootstrap` | POST | Seed demo data |
| `/events/latest` | GET | Merged event timeline |
| `/workproof/simulate` | POST | Submit work proof on-chain |
| `/ai/offer` | POST | Generate signed credit offer |

---

## License

MIT
