#!/bin/bash
# Monitor development servers without killing them

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== IntelliFlow Dev Server Monitor ===${NC}\n"

# Function to check if a process is running on a port
check_port() {
    local port=$1
    local name=$2

    if netstat -ano | grep ":$port" | grep LISTENING > /dev/null 2>&1; then
        local pid=$(netstat -ano | grep ":$port" | grep LISTENING | awk '{print $5}' | head -1)
        echo -e "${GREEN}✓${NC} $name is running on port $port (PID: $pid)"
        return 0
    else
        echo -e "${RED}✗${NC} $name is NOT running on port $port"
        return 1
    fi
}

# Function to show recent logs from a process
show_logs() {
    local name=$1
    local filter=$2

    echo -e "\n${YELLOW}Recent errors in $name:${NC}"

    # For Next.js dev server, check .next directory
    if [ -d "apps/web/.next" ]; then
        echo "Checking Next.js build errors..."
        if [ -f "apps/web/.next/trace" ]; then
            tail -20 "apps/web/.next/trace" 2>/dev/null | grep -i "error" || echo "No recent errors found"
        fi
    fi

    # Check for TypeScript errors
    echo -e "\n${YELLOW}Running typecheck:${NC}"
    cd apps/web && pnpm typecheck 2>&1 | grep "error TS" | head -10 || echo -e "${GREEN}No type errors!${NC}"
    cd ../..
}

# Check running services
echo "Checking services..."
check_port 3000 "Web (Next.js)" || check_port 3001 "Web (Next.js - alternate)"
check_port 3002 "Project Tracker"
check_port 4000 "API Server"
check_port 5432 "PostgreSQL"

# Show recent errors
show_logs "Web" "apps/web"

echo -e "\n${YELLOW}To monitor in real-time:${NC}"
echo "  cd apps/web && pnpm dev    # Watch dev output live"
echo ""
echo -e "${YELLOW}To check specific errors:${NC}"
echo "  pnpm --filter @intelliflow/web typecheck    # Type errors"
echo "  pnpm --filter @intelliflow/web lint         # Lint errors"
echo ""
