#!/bin/bash
# start-local.sh
# Robust one-command startup for UnEmpower

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}="
echo "🚀 UNEMPOWER: ONE-COMMAND STARTUP"
echo -e "${BLUE}=${NC}\n"

# 1. Start Database
echo -e "${YELLOW}📦 [1/4] Ensuring Database is Up...${NC}"
pnpm db:up
echo "Waiting for PostgreSQL on port 5433..."
if ! npx wait-on tcp:5433 --timeout 30000; then
    echo -e "${RED}❌ Database failed to start${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Database Ready${NC}\n"

# 2. Check Chain + Deploy
echo -e "${YELLOW}⛓️  [2/4] Starting Blockhain & Deploying...${NC}"

# We use concurrently to run:
# A. Hardhat Node (persistent)
# B. Deploy Sequence (once node is ready) -> then exit
# C. API + Indexer + Web (persistent)

# The strategy:
# 1. Start Node in background via concurrently
# 2. Wait for port 8545
# 3. Run deploy scripts
# 4. If deploy success, start apps

# Define the command for the "Setup Phase"
# It waits for 8545, then deploys, sets up roles, and seeds liquidity
SETUP_CMD="npx wait-on tcp:8545 --timeout 20000 && \
echo '⛓️ Node detected, deploying contracts...' && \
pnpm contracts:deploy:local && \
pnpm contracts:setup:local && \
pnpm contracts:seed:local && \
./scripts/sync-local-env.sh && \
echo '✅ Contracts Ready!'"

# Define the command for "App Phase"
# It runs after setup is likely done (or we chain it, but concurrently runs in parallel)
# We'll use a chain: wait for 5s (let setup start) -> wait specifically for a readiness marker? 
# Simplest for this prompt: wait for 8545 + generous buffer, OR rely on the fact that API/Web will retry connection?
# Better: The API startup checks for contracts. We should ensure contracts are deployed first.
# We will use a separate wait-on approach or just simple chaining in the main concurrently block.

echo -e "${YELLOW}🚀 [3/4] Launching Stack...${NC}"
echo -e "   - Hardhat Node (:8545)"
echo -e "   - Contract Deployment & Setup"
echo -e "   - API (:8000) & Indexer"
echo -e "   - Web (:3000)"

# Run everything with concurrently
# Group 1: Infrastructure (Node)
# Group 2: Setup (Dependant on Node)
# Group 3: Services (Dependant on Setup)

# Since Group 3 needs Group 2 to FINISH, we can chain them in one long command? 
# No, we want services to run persistently.
# We can use 'wait-on' for a file? Or just a generous sleep?
# Let's use a simpler approach: 
# Run Node. Run Setup fully. THEN Run Services.
# But Node needs to stay running.

# Robust Approach:
# 1. Start Hardhat Node in background (daemon)? 
# No, we want one terminal window to kill everything easily.

# We will use concurrently with specific naming and dependencies if possible, 
# or just use sleep to stagger. Staggering is "hacky" but robust enough for this MVP "one command".
# A better way is to use `wait-on` for the deployment file to update?
# Let's stagger:
# - Node starts immediately
# - Setup waits for port 8545
# - Apps wait for... setup? 
# We'll make Apps wait for port 8545 AND a specific delay to allow deploy.

npx concurrently \
  --kill-others-on-fail \
  --names "NODE,SETUP,API,IDX,WEB" \
  --prefix-colors "blue,magenta,cyan,green,yellow" \
  "pnpm contracts:node" \
  "$SETUP_CMD" \
  "npx wait-on tcp:8545 --interval 1000 --timeout 60000 && sleep 45 && pnpm api:dev" \
  "npx wait-on tcp:8545 --interval 1000 --timeout 60000 && sleep 50 && pnpm api:indexer" \
  "npx wait-on tcp:8000 --interval 1000 --timeout 60000 && sleep 5 && (rm -rf apps/web/.next 2>/dev/null; true) && pnpm web:dev"

# Note: The 'sleep 15' in API startup gives time for 'SETUP_CMD' to run deploy/seed.
# In a true production CI we'd use a ready-file, but this is fine for dev:all.
