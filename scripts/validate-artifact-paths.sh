#!/bin/bash
###############################################################################
# Artifact Path Validation Script
#
# Detects root-level pollution from scripts that should write to artifacts/.
# Part of Sprint 0 artifact containment remediation (SUB-AGENT C).
#
# Usage:
#   ./scripts/validate-artifact-paths.sh
#
# Exit Codes:
#   0 - No violations found
#   1+ - Number of violations detected
#
# Environment Variables:
#   STRICT_MODE - If set, fail on warnings (default: errors only)
#
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0

# Repo root detection
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "========================================="
echo "Artifact Path Validation"
echo "========================================="
echo "Repository: $REPO_ROOT"
echo "Mode: ${STRICT_MODE:+STRICT (warnings = errors)}${STRICT_MODE:-NORMAL (errors only)}"
echo ""

###############################################################################
# Check for prohibited root-level outputs
###############################################################################

echo "[1/5] Checking for root-level sonar-reports/..."
if [ -d "sonar-reports" ]; then
  echo -e "${RED}ERROR:${NC} Found sonar-reports/ in root (should be in artifacts/reports/sonarqube/)"
  echo "  Location: $REPO_ROOT/sonar-reports/"
  echo "  Action: Move to artifacts/reports/sonarqube/{RUN_ID}/"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✓${NC} No sonar-reports/ in root"
fi

echo "[2/5] Checking for root-level gitleaks-report.json..."
if [ -f "gitleaks-report.json" ]; then
  echo -e "${RED}ERROR:${NC} Found gitleaks-report.json in root (should be in artifacts/reports/security/)"
  echo "  Location: $REPO_ROOT/gitleaks-report.json"
  echo "  Action: Move to artifacts/reports/security/{RUN_ID}/gitleaks-report.json"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✓${NC} No gitleaks-report.json in root"
fi

echo "[3/5] Checking for root-level tree_*.txt files..."
TREE_FILES=$(find . -maxdepth 1 -name 'tree_*.txt' 2>/dev/null || true)
if [ -n "$TREE_FILES" ]; then
  echo -e "${RED}ERROR:${NC} Found tree_*.txt in root (should be in artifacts/misc/)"
  echo "$TREE_FILES" | while read -r file; do
    echo "  - $file"
  done
  echo "  Action: Move to artifacts/misc/ or delete if temporary"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✓${NC} No tree_*.txt files in root"
fi

###############################################################################
# Check for uncommitted outputs in root
###############################################################################

echo "[4/5] Checking for other untracked output files in root..."
UNTRACKED=$(git ls-files --others --exclude-standard . 2>/dev/null | \
  grep -E '\.(json|txt|log|html|md)$' | \
  grep -v '^node_modules/' | \
  grep -v '^\.turbo/' | \
  head -10 || true)

if [ -n "$UNTRACKED" ]; then
  echo -e "${YELLOW}WARNING:${NC} Found untracked output files in root:"
  echo "$UNTRACKED" | while read -r file; do
    echo "  - $file"
  done
  echo "  Action: Review if these should be in artifacts/"
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}✓${NC} No suspicious untracked files in root"
fi

###############################################################################
# Verify artifacts/ structure exists
###############################################################################

echo "[5/5] Verifying canonical artifacts/ structure..."
MISSING_DIRS=()

for dir in \
  "artifacts/reports/sonarqube" \
  "artifacts/reports/security" \
  "artifacts/reports/system-audit" \
  "artifacts/benchmarks" \
  "artifacts/coverage" \
  "artifacts/logs"; do

  if [ ! -d "$dir" ]; then
    MISSING_DIRS+=("$dir")
  fi
done

if [ ${#MISSING_DIRS[@]} -gt 0 ]; then
  echo -e "${YELLOW}WARNING:${NC} Missing canonical artifact directories:"
  for dir in "${MISSING_DIRS[@]}"; do
    echo "  - $dir"
  done
  echo "  Action: Create with 'mkdir -p artifacts/{reports/{sonarqube,security,system-audit},benchmarks,coverage,logs}'"
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}✓${NC} All canonical artifact directories exist"
fi

###############################################################################
# Summary
###############################################################################

echo ""
echo "========================================="
echo "Validation Summary"
echo "========================================="
echo -e "Errors:   ${RED}${ERRORS}${NC}"
echo -e "Warnings: ${YELLOW}${WARNINGS}${NC}"
echo ""

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed${NC}"
  exit 0
fi

if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}✗ Validation failed with $ERRORS error(s)${NC}"
  echo ""
  echo "Remediation steps:"
  echo "  1. Review errors above"
  echo "  2. Move files to canonical locations (see artifacts/reports/artifact-containment-analysis.md)"
  echo "  3. Update scripts to use tools/scripts/lib/output-paths.ts helpers"
  echo "  4. Re-run validation"
  exit "$ERRORS"
fi

if [ -n "${STRICT_MODE:-}" ] && [ "$WARNINGS" -gt 0 ]; then
  echo -e "${YELLOW}✗ Validation failed in STRICT_MODE with $WARNINGS warning(s)${NC}"
  exit "$WARNINGS"
fi

echo -e "${YELLOW}⚠ Validation passed with $WARNINGS warning(s)${NC}"
exit 0
