#!/bin/bash
# clean-local.sh
# Stops all services and optionally resets data

HARD=false
for arg in "$@"
do
    if [ "$arg" == "--hard" ]; then
        HARD=true
    fi
done

echo "🧹 Stopping UnEmpower Services..."

# 1. Stop Docker containers (DB)
if [ "$HARD" = true ]; then
    echo "🧨 --hard detected: Removing volumes..."
    docker compose -f infra/docker-compose.yml down -v
else
    pnpm db:down
fi

# 2. Kill stray processes on ports
echo "🔫 Killing processes on ports 3000, 8000, 8545..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:8545 | xargs kill -9 2>/dev/null

echo "✅ Environment Cleaned."
