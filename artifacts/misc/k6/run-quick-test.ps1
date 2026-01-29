# Run k6 Quick Load Test with Supabase credentials
# Usage: .\run-quick-test.ps1

$ErrorActionPreference = "Stop"

# Change to project root
Set-Location "C:\Users\talys\projects\intelliFlow-CRM"

# Read .env.local
$envContent = Get-Content ".env.local" -Raw

# Extract Supabase URL
if ($envContent -match 'SUPABASE_URL=([^\r\n]+)') {
    $env:SUPABASE_URL = $matches[1].Trim()
}

# Extract Supabase Anon Key (handle multi-line)
if ($envContent -match 'SUPABASE_ANON_KEY=([^\r\n]+)') {
    $env:SUPABASE_ANON_KEY = $matches[1].Trim()
}

$env:BASE_URL = "http://127.0.0.1:3000"

Write-Host "=== k6 Quick Load Test ===" -ForegroundColor Cyan
Write-Host "SUPABASE_URL: $env:SUPABASE_URL"
Write-Host "SUPABASE_ANON_KEY: (set, $($env:SUPABASE_ANON_KEY.Length) chars)"
Write-Host "BASE_URL: $env:BASE_URL"
Write-Host ""

# Run k6
$k6Path = "C:\Users\talys\tools\k6\k6-v0.49.0-windows-amd64\k6.exe"
& $k6Path run artifacts\misc\k6\scripts\quick-test.js

Write-Host ""
Write-Host "Results saved to: artifacts\benchmarks\k6-latest.json" -ForegroundColor Green
