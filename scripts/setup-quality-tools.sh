#!/usr/bin/env bash
# =============================================================================
# IntelliFlow CRM - Quality Tools Setup Script
# =============================================================================
# Installs and configures all code quality tools:
# - TypeScript, ESLint, Prettier (already in project)
# - SonarQube Scanner CLI
# - depcheck (unused dependency detector)
# - knip (dead code detector)
# - audit-ci (for CI/CD security checks)
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level="$1"
    shift
    local message="$*"
    case "$level" in
        INFO)  echo -e "${BLUE}[INFO]${NC} ${message}" ;;
        SUCCESS) echo -e "${GREEN}[✓]${NC} ${message}" ;;
        WARN)  echo -e "${YELLOW}[⚠]${NC} ${message}" ;;
        ERROR) echo -e "${RED}[✗]${NC} ${message}" ;;
    esac
}

check_command() {
    local cmd="$1"
    local name="${2:-$cmd}"
    
    if command -v "$cmd" >/dev/null 2>&1; then
        log SUCCESS "$name is installed"
        return 0
    else
        log WARN "$name is NOT installed"
        return 1
    fi
}

echo "=========================================="
echo "  Quality Tools Setup - IntelliFlow CRM"
echo "=========================================="
echo ""

# Check Node.js and pnpm
log INFO "Checking prerequisites..."
check_command node "Node.js" || { log ERROR "Node.js is required"; exit 1; }
check_command pnpm "pnpm" || { log ERROR "pnpm is required"; exit 1; }
check_command docker "Docker" || log WARN "Docker required for SonarQube"

echo ""
log INFO "Installing quality tools globally..."

# Install SonarQube Scanner
if ! check_command sonar-scanner "SonarQube Scanner"; then
    log INFO "Installing sonarqube-scanner..."
    npm install -g sonarqube-scanner
    check_command sonar-scanner "SonarQube Scanner" && log SUCCESS "SonarQube Scanner installed"
fi

# Install depcheck
if ! check_command depcheck "depcheck"; then
    log INFO "Installing depcheck..."
    npm install -g depcheck
    check_command depcheck "depcheck" && log SUCCESS "depcheck installed"
fi

# Install knip
if ! check_command knip "knip"; then
    log INFO "Installing knip..."
    npm install -g knip
    check_command knip "knip" && log SUCCESS "knip installed"
fi

echo ""
log INFO "Setting up SonarQube server..."

# Check if SonarQube is already running
if docker ps | grep -q intelliflow-sonarqube; then
    log SUCCESS "SonarQube is already running"
else
    if [ -f "docker-compose.sonarqube.yml" ]; then
        log INFO "Starting SonarQube with Docker Compose..."
        docker-compose -f docker-compose.sonarqube.yml up -d
        
        log INFO "Waiting for SonarQube to be ready (this takes ~2 minutes)..."
        sleep 10
        
        for i in {1..24}; do
            if curl -s http://localhost:9000/api/system/status | grep -q '"status":"UP"'; then
                log SUCCESS "SonarQube is UP and ready!"
                break
            else
                echo -n "."
                sleep 5
            fi
            
            if [ $i -eq 24 ]; then
                log ERROR "SonarQube failed to start. Check logs: docker logs intelliflow-sonarqube"
                exit 1
            fi
        done
    else
        log ERROR "docker-compose.sonarqube.yml not found"
        exit 1
    fi
fi

echo ""
log INFO "Configuring project quality tools..."

# Create knip configuration if missing
if [ ! -f "knip.json" ]; then
    log INFO "Creating knip.json configuration..."
    cat > knip.json << 'EOF'
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    ".": {
      "entry": ["apps/*/src/index.ts", "packages/*/src/index.ts"],
      "project": ["**/*.ts", "**/*.tsx"]
    }
  },
  "ignore": [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/dist/**",
    "**/node_modules/**",
    "**/.next/**"
  ],
  "ignoreDependencies": [
    "@types/*",
    "eslint-*",
    "prettier",
    "husky",
    "lint-staged"
  ]
}
EOF
    log SUCCESS "knip.json created"
fi

# Create .depcheckrc if missing
if [ ! -f ".depcheckrc" ]; then
    log INFO "Creating .depcheckrc configuration..."
    cat > .depcheckrc << 'EOF'
{
  "ignores": [
    "@types/*",
    "eslint-*",
    "prettier",
    "husky",
    "lint-staged",
    "turbo",
    "@changesets/cli"
  ],
  "ignore-patterns": [
    "dist",
    "build",
    ".next",
    "coverage"
  ]
}
EOF
    log SUCCESS ".depcheckrc created"
fi

echo ""
log INFO "Verifying installations..."

echo ""
echo "Tool Status:"
echo "  - TypeScript:         $(tsc --version)"
echo "  - ESLint:             $(eslint --version 2>/dev/null || echo 'Not found')"
echo "  - SonarQube Scanner:  $(sonar-scanner --version 2>&1 | grep -oP 'SonarScanner \K[0-9.]+')"
echo "  - depcheck:           $(depcheck --version)"
echo "  - knip:               $(knip --version)"
echo "  - Docker:             $(docker --version)"

echo ""
log SUCCESS "Quality tools setup complete!"
echo ""
echo "Next steps:"
echo "  1. Configure SonarQube token:"
echo "     - Visit: http://localhost:9000"
echo "     - Login: admin/admin (change password)"
echo "     - Create token: My Account > Security > Generate Tokens"
echo "     - Set environment: export SONAR_TOKEN='your-token-here'"
echo ""
echo "  2. Run quality checks:"
echo "     pnpm run typecheck"
echo "     pnpm run lint"
echo "     pnpm test"
echo "     npx depcheck"
echo "     npx knip"
echo "     sonar-scanner"
echo ""
echo "  3. Integrate into orchestrator:"
echo "     ./apps/project-tracker/docs/metrics/orchestrator.sh run ENV-014-AI"
echo ""
