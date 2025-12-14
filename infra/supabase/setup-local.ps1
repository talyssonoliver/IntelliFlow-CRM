# Supabase Local Setup Script for IntelliFlow CRM (PowerShell)
# This script automates the setup of a local Supabase development environment
#
# Usage:
#   .\infra\supabase\setup-local.ps1

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "IntelliFlow CRM - Supabase Local Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
try {
    $null = Get-Command supabase -ErrorAction Stop
    Write-Host "✓ Supabase CLI found" -ForegroundColor Green
} catch {
    Write-Host "Error: Supabase CLI is not installed" -ForegroundColor Red
    Write-Host "Install it with: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Check if Docker is running
try {
    docker info *>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker not running"
    }
    Write-Host "✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "Error: Docker is not running" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again" -ForegroundColor Yellow
    exit 1
}

# Navigate to project root
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptPath "..\..")

Write-Host ""
Write-Host "Step 1: Starting Supabase services..." -ForegroundColor Yellow
Write-Host "This will start PostgreSQL, Auth, Storage, and other services"
Write-Host ""

# Start Supabase
supabase start

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to start Supabase services" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✓ Supabase services started" -ForegroundColor Green

# Get connection details
$status = supabase status -o json | ConvertFrom-Json
$apiUrl = "http://127.0.0.1:54321"
$studioUrl = "http://127.0.0.1:54323"
$dbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

Write-Host ""
Write-Host "Step 2: Applying database migrations..." -ForegroundColor Yellow
Write-Host ""

# Apply migrations
supabase db reset --yes

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to apply migrations" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✓ Database migrations applied" -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Applying RLS policies..." -ForegroundColor Yellow
Write-Host ""

# Apply RLS policies
$env:PGPASSWORD = "postgres"
psql -h localhost -p 54322 -U postgres -d postgres -f infra/supabase/rls-policies.sql

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Failed to apply RLS policies (psql might not be in PATH)" -ForegroundColor Yellow
    Write-Host "You can apply them manually later using Supabase Studio" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "✓ RLS policies applied" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 4: Setting up storage buckets..." -ForegroundColor Yellow
Write-Host ""

# Setup storage
$env:PGPASSWORD = "postgres"
psql -h localhost -p 54322 -U postgres -d postgres -f infra/supabase/storage-setup.sql

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Failed to setup storage (psql might not be in PATH)" -ForegroundColor Yellow
    Write-Host "You can set up storage manually using Supabase Studio" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "✓ Storage buckets configured" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 5: Creating .env.local file for edge functions..." -ForegroundColor Yellow
Write-Host ""

# Create .env.local from example
if (-not (Test-Path "infra/supabase/.env.local")) {
    Copy-Item "infra/supabase/.env.local.example" "infra/supabase/.env.local"
    Write-Host "Note: Please update infra/supabase/.env.local with your API keys" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✓ Environment file created" -ForegroundColor Green

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Supabase is now running with the following details:"
Write-Host ""
Write-Host "  API URL:          $apiUrl" -ForegroundColor White
Write-Host "  Studio URL:       $studioUrl" -ForegroundColor White
Write-Host "  Database URL:     $dbUrl" -ForegroundColor White
Write-Host ""
Write-Host "To get your API keys, run: supabase status" -ForegroundColor Yellow
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  - View status:         supabase status" -ForegroundColor White
Write-Host "  - View logs:           supabase logs" -ForegroundColor White
Write-Host "  - Stop services:       supabase stop" -ForegroundColor White
Write-Host "  - Restart services:    supabase restart" -ForegroundColor White
Write-Host "  - Open Studio:         Start-Process $studioUrl" -ForegroundColor White
Write-Host "  - Run edge function:   supabase functions serve hello" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run 'supabase status' to get your API keys" -ForegroundColor White
Write-Host "  2. Update .env file with the connection details" -ForegroundColor White
Write-Host "  3. Update infra/supabase/.env.local with your API keys" -ForegroundColor White
Write-Host "  4. Run 'pnpm run dev' to start the application" -ForegroundColor White
Write-Host ""
Write-Host "Happy coding!" -ForegroundColor Green
Write-Host ""

# Optionally open Studio in browser
$openStudio = Read-Host "Would you like to open Supabase Studio in your browser? (y/n)"
if ($openStudio -eq 'y') {
    Start-Process $studioUrl
}
