#!/bin/bash
# Coverage enforcement script for TDD
# Run before commits to ensure new code has tests

set -e

echo "Running coverage check..."

# Get changed files
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' | grep -v '\.test\.' | grep -v '\.spec\.' || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "No source files changed, skipping coverage check"
  exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES"

# Run tests with coverage
node --max-old-space-size=8192 ./node_modules/vitest/vitest.mjs run --coverage --silent 2>/dev/null

# Check if coverage report exists
COVERAGE_FILE="artifacts/coverage/coverage-summary.json"
if [ ! -f "$COVERAGE_FILE" ]; then
  echo "Coverage report not found"
  exit 1
fi

# Extract overall coverage
LINES=$(node -e "console.log(require('./$COVERAGE_FILE').total.lines.pct)")
FUNCTIONS=$(node -e "console.log(require('./$COVERAGE_FILE').total.functions.pct)")
BRANCHES=$(node -e "console.log(require('./$COVERAGE_FILE').total.branches.pct)")
STATEMENTS=$(node -e "console.log(require('./$COVERAGE_FILE').total.statements.pct)")

echo ""
echo "Coverage Report:"
echo "  Lines:      $LINES%"
echo "  Functions:  $FUNCTIONS%"
echo "  Branches:   $BRANCHES%"
echo "  Statements: $STATEMENTS%"

# Check thresholds
LINES_OK=$(echo "$LINES >= 90" | bc)
FUNCTIONS_OK=$(echo "$FUNCTIONS >= 90" | bc)
BRANCHES_OK=$(echo "$BRANCHES >= 80" | bc)
STATEMENTS_OK=$(echo "$STATEMENTS >= 90" | bc)

if [ "$LINES_OK" -eq 0 ] || [ "$FUNCTIONS_OK" -eq 0 ] || [ "$BRANCHES_OK" -eq 0 ] || [ "$STATEMENTS_OK" -eq 0 ]; then
  echo ""
  echo "ERROR: Coverage thresholds not met!"
  echo "Required: Lines/Functions/Statements >= 90%, Branches >= 80%"
  echo ""
  echo "TDD Reminder: Write tests BEFORE implementing features"
  exit 1
fi

echo ""
echo "Coverage thresholds met!"
