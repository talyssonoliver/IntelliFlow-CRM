#!/bin/bash
#
# Reset Test Database Script
#
# This script resets the test database to a clean state by:
# 1. Running Prisma migrate reset (drops all tables and re-runs migrations)
# 2. Seeding the database with test data
#
# Usage:
#   ./scripts/reset-test-db.sh
#   TEST_DATABASE_URL="..." ./scripts/reset-test-db.sh
#
# Environment Variables:
#   TEST_DATABASE_URL - Connection string for the test database
#                       Default: postgresql://intelliflow:intelliflow@localhost:5433/intelliflow_test
#

set -e

echo "============================================"
echo "IntelliFlow CRM - Test Database Reset"
echo "============================================"

# Use TEST_DATABASE_URL if provided, otherwise use default
export DATABASE_URL="${TEST_DATABASE_URL:-postgresql://intelliflow:intelliflow@localhost:5433/intelliflow_test}"

echo ""
echo "Target database: ${DATABASE_URL//:*@/:***@}"
echo ""

# Confirm if running interactively
if [ -t 0 ]; then
  read -p "This will DESTROY all data in the test database. Continue? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "Resetting database..."

# Navigate to the db package
cd "$(dirname "$0")/../packages/db"

# Run Prisma migrate reset
# --force: Skip confirmation prompt
# --skip-seed: Don't run seed script (we'll run it separately for better control)
echo ""
echo "Step 1/2: Running Prisma migrate reset..."
pnpm prisma migrate reset --force --skip-seed

# Run seed script
echo ""
echo "Step 2/2: Seeding test data..."
pnpm run db:seed

echo ""
echo "============================================"
echo "Test database reset complete!"
echo "============================================"
echo ""
echo "You can now run integration tests:"
echo "  pnpm run test:integration"
echo ""
