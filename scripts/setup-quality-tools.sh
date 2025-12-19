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
log INFO "Installing quality tools..."

# Check if we should install globally or locally
if command -v npm >/dev/null 2>&1; then
    INSTALL_CMD="npm install -g"
    log INFO "Installing globally with npm..."
else
    log WARN "npm not found, will use npx for tools"
fi

# Install SonarQube Scanner globally
if ! check_command sonar-scanner "SonarQube Scanner"; then
    log INFO "Installing sonarqube-scanner globally..."
    npm install -g sonarqube-scanner || {
        log WARN "Global install failed, will use npx sonarqube-scanner"
    }
fi

# Install depcheck globally (or use npx)
if ! check_command depcheck "depcheck"; then
    log INFO "Installing depcheck globally..."
    npm install -g depcheck || {
        log WARN "Global install failed, will use npx depcheck"
    }
fi

# Install knip globally (or use npx)
if ! check_command knip "knip"; then
    log INFO "Installing knip globally..."
    npm install -g knip || {
        log WARN "Global install failed, will use npx knip"
    }
fi

log INFO ""
log INFO "NOTE: Tools installed globally in: $(npm root -g)"
log INFO "If you don't have global npm permissions, tools will use 'npx' instead"

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
echo "=========================================="
echo "  IMPORTANT: SonarQube Token Setup"
echo "=========================================="
echo ""
echo "You have 2 options for SonarQube:"
echo ""
echo "OPTION 1: Use LOCAL SonarQube (Recommended for this project)"
echo "  1. Visit: http://localhost:9000"
echo "  2. Login: admin/admin (change password on first login)"
echo "  3. Create NEW project token:"
echo "     - My Account > Security > Generate Tokens"
echo "     - Token Name: intelliflow-crm-local"
echo "     - Type: Project Analysis Token"
echo "  4. Add to .env.local:"
echo "     echo 'SONAR_TOKEN=squ_your_new_token_here' >> .env.local"
echo ""
echo "OPTION 2: Reuse existing e-commerce-bags token (NOT RECOMMENDED)"
echo "  - Your existing token is project-specific"
echo "  - If same SonarQube server, copy token from your e-commerce-bags .env"
echo "  - Add to .env.local:"
echo "     echo 'SONAR_TOKEN=<your-existing-token>' >> .env.local"
echo ""
echo "=========================================="
echo "  Available Commands"
echo "=========================================="
echo ""
echo "Run quality checks:"
echo "  pnpm run typecheck          # TypeScript type checking"
echo "  pnpm run lint               # ESLint analysis"
echo "  pnpm test                   # Run tests"
echo "  pnpm run quality:deps       # Check unused dependencies"
echo "  pnpm run quality:security   # Security audit"
echo "  pnpm run quality:deadcode   # Dead code detection"
echo "  pnpm run quality:sonar      # SonarQube analysis"
echo "  pnpm run quality:check      # Run all checks"
echo ""
echo "Orchestrator integration:"
echo "  ./apps/project-tracker/docs/metrics/orchestrator.sh run ENV-014-AI"
echo ""
echo "=========================================="
echo "  Token Information"
echo "=========================================="
echo ""
echo "Your e-commerce-bags tokens are for DIFFERENT services:"
echo "  - SUPABASE tokens: For Supabase database/auth"
echo "  - STRIPE tokens: For payment processing"
echo "  - SONAR_TOKEN: For SonarQube code analysis (can be reused)"
echo "  - SONARCLOUD_TOKEN: For SonarCloud.io (cloud service)"
echo ""
echo "For IntelliFlow CRM, you should:"
echo "  1. Create NEW local SonarQube token (recommended)"
echo "  2. OR reuse SONAR_TOKEN if same SonarQube server"
echo ""
