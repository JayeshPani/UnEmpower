#!/bin/bash
# =============================================================================
# UnEmpower Sepolia Backend Startup Script
# =============================================================================
# This script provides a bulletproof one-command backend startup for Sepolia.
# It performs preflight checks and starts all required services.
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
API_ENV="$ROOT_DIR/apps/api/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}🚀 UnEmpower Sepolia Backend Startup${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# -----------------------------------------------------------------------------
# PREFLIGHT CHECK 1: Docker daemon
# -----------------------------------------------------------------------------
echo -e "${YELLOW}📋 Preflight Check 1: Docker daemon...${NC}"

if ! docker info > /dev/null 2>&1; then
    echo ""
    echo -e "${RED}❌ Docker daemon is not running!${NC}"
    echo ""
    echo "Please start Docker Desktop and run this command again:"
    echo ""
    echo "    pnpm backend:sepolia"
    echo ""
    exit 1
fi

echo -e "${GREEN}   ✓ Docker daemon is running${NC}"

# -----------------------------------------------------------------------------
# PREFLIGHT CHECK 2: API .env file exists
# -----------------------------------------------------------------------------
echo -e "${YELLOW}📋 Preflight Check 2: API environment file...${NC}"

if [ ! -f "$API_ENV" ]; then
    echo ""
    echo -e "${RED}❌ API .env file not found at: $API_ENV${NC}"
    echo ""
    echo "Please create the .env file with Sepolia configuration:"
    echo "    cp apps/api/.env.example apps/api/.env"
    echo "    # Then edit with your Sepolia RPC and contract addresses"
    echo ""
    exit 1
fi

echo -e "${GREEN}   ✓ API .env file exists${NC}"

# -----------------------------------------------------------------------------
# PREFLIGHT CHECK 3: Required env vars
# -----------------------------------------------------------------------------
echo -e "${YELLOW}📋 Preflight Check 3: Required environment variables...${NC}"

# Source the .env file to check variables
set -a
source "$API_ENV"
set +a

MISSING_VARS=()

[ -z "$RPC_URL" ] && MISSING_VARS+=("RPC_URL")
[ -z "$CHAIN_ID" ] && MISSING_VARS+=("CHAIN_ID")
[ -z "$WORKPROOF_ADDRESS" ] && MISSING_VARS+=("WORKPROOF_ADDRESS")
[ -z "$LOAN_VAULT_ADDRESS" ] && MISSING_VARS+=("LOAN_VAULT_ADDRESS")
[ -z "$AI_SIGNER_PRIVATE_KEY" ] && MISSING_VARS+=("AI_SIGNER_PRIVATE_KEY")

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo ""
    echo -e "${RED}❌ Missing required environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Please add these to: $API_ENV"
    exit 1
fi

echo -e "${GREEN}   ✓ Required env vars present${NC}"
echo -e "${GREEN}   ✓ Chain ID: $CHAIN_ID${NC}"

# -----------------------------------------------------------------------------
# STEP 1: Start PostgreSQL via Docker
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}🐳 Step 1: Starting PostgreSQL...${NC}"

cd "$ROOT_DIR"
pnpm db:up

# -----------------------------------------------------------------------------
# STEP 2: Wait for PostgreSQL to be ready
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}⏳ Step 2: Waiting for PostgreSQL (port ${DB_PORT:-5432})...${NC}"

DB_PORT="${DB_PORT:-5432}"

# Wait for PostgreSQL using a simple loop (no external dependencies)
MAX_ATTEMPTS=30
ATTEMPT=0

while ! docker exec unempower-postgres pg_isready -U unempower > /dev/null 2>&1; do
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
        echo -e "${RED}❌ PostgreSQL did not become ready in time${NC}"
        exit 1
    fi
    echo "   Waiting for PostgreSQL... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
    sleep 1
done

echo -e "${GREEN}   ✓ PostgreSQL is ready${NC}"

# -----------------------------------------------------------------------------
# STEP 3: Start API and Indexer concurrently
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}🚀 Step 3: Starting API and Indexer...${NC}"
echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  API:     http://localhost:8000${NC}"
echo -e "${BLUE}  Health:  http://localhost:8000/health${NC}"
echo -e "${BLUE}  Docs:    http://localhost:8000/docs${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "${GREEN}Press Ctrl+C to stop all services${NC}"
echo ""

# Run API and Indexer concurrently
npx concurrently \
    --names "API,IDX" \
    --prefix "[{name}]" \
    --prefix-colors "cyan,magenta" \
    --kill-others \
    "pnpm api:dev" \
    "sleep 5 && pnpm api:indexer"
