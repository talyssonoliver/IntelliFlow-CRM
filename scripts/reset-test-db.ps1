#
# Reset Test Database Script (PowerShell)
#
# This script resets the test database to a clean state by:
# 1. Running Prisma migrate reset (drops all tables and re-runs migrations)
# 2. Seeding the database with test data
#
# Usage:
#   .\scripts\reset-test-db.ps1
#   $env:TEST_DATABASE_URL="..." ; .\scripts\reset-test-db.ps1
#
# Environment Variables:
#   TEST_DATABASE_URL - Connection string for the test database
#                       Default: postgresql://intelliflow:intelliflow@localhost:5433/intelliflow_test
#

$ErrorActionPreference = "Stop"

Write-Host "============================================"
Write-Host "IntelliFlow CRM - Test Database Reset"
Write-Host "============================================"

# Use TEST_DATABASE_URL if provided, otherwise use default
$dbUrl = if ($env:TEST_DATABASE_URL) { $env:TEST_DATABASE_URL } else { "postgresql://intelliflow:intelliflow@localhost:5433/intelliflow_test" }
$env:DATABASE_URL = $dbUrl

# Mask password for display
$maskedUrl = $dbUrl -replace ":([^:@]+)@", ":***@"
Write-Host ""
Write-Host "Target database: $maskedUrl"
Write-Host ""

# Confirm
$confirmation = Read-Host "This will DESTROY all data in the test database. Continue? (y/N)"
if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
    Write-Host "Aborted."
    exit 1
}

Write-Host "Resetting database..."

# Navigate to the db package
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dbDir = Join-Path (Split-Path -Parent $scriptDir) "packages\db"
Push-Location $dbDir

try {
    # Run Prisma migrate reset
    Write-Host ""
    Write-Host "Step 1/2: Running Prisma migrate reset..."
    pnpm prisma migrate reset --force --skip-seed
    if ($LASTEXITCODE -ne 0) {
        throw "Prisma migrate reset failed"
    }

    # Run seed script
    Write-Host ""
    Write-Host "Step 2/2: Seeding test data..."
    pnpm run db:seed
    if ($LASTEXITCODE -ne 0) {
        throw "Database seeding failed"
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "============================================"
Write-Host "Test database reset complete!"
Write-Host "============================================"
Write-Host ""
Write-Host "You can now run integration tests:"
Write-Host "  pnpm run test:integration"
Write-Host ""
