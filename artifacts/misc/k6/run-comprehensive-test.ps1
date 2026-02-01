# Run k6 Comprehensive Load Test
# Tests 50+ endpoints across 20+ routers

$ErrorActionPreference = "Stop"

Set-Location "C:\Users\talys\projects\intelliFlow-CRM"

# Read .env.local
$envContent = Get-Content ".env.local" -Raw

if ($envContent -match 'SUPABASE_URL=([^\r\n]+)') {
    $env:SUPABASE_URL = $matches[1].Trim()
}

if ($envContent -match 'SUPABASE_ANON_KEY=([^\r\n]+)') {
    $env:SUPABASE_ANON_KEY = $matches[1].Trim()
}

$env:BASE_URL = "http://localhost:3000"

Write-Host "=== k6 Comprehensive Load Test ===" -ForegroundColor Cyan
Write-Host "SUPABASE_URL: $env:SUPABASE_URL"
Write-Host "SUPABASE_ANON_KEY: (set, $($env:SUPABASE_ANON_KEY.Length) chars)"
Write-Host "BASE_URL: $env:BASE_URL"
Write-Host ""
Write-Host "Testing 50+ endpoints across 20+ routers:" -ForegroundColor Yellow
Write-Host "  - health, lead, contact, account, opportunity"
Write-Host "  - ticket, task, timeline, billing, agent"
Write-Host "  - conversation, analytics, appointments, documents"
Write-Host "  - experiment, chainVersion, feedback, pipelineConfig"
Write-Host "  - inbound, integrations, audit"
Write-Host ""

$k6Path = "C:\Users\talys\tools\k6\k6-v0.49.0-windows-amd64\k6.exe"
& $k6Path run artifacts\misc\k6\scripts\comprehensive-load-test.js

Write-Host ""
Write-Host "Results saved to: artifacts\benchmarks\k6-latest.json" -ForegroundColor Green
