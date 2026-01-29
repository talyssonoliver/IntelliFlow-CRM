#!/usr/bin/env pwsh
# Fix uppercase SHA256 hashes and BACKLOG status

$ErrorActionPreference = "Stop"

$files = Get-ChildItem -Path "apps/project-tracker/docs/metrics/sprint-0" -Recurse -Filter "*.json" | 
    Where-Object { $_.Name -notmatch '_summary' }

$fixedCount = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $modified = $false
    
    # Fix uppercase SHA256 hashes using case-insensitive regex
    if ($content -cmatch '"sha256":\s*"[A-F]') {
        # Replace using regex callback
        $content = [regex]::Replace($content, '("sha256":\s*")([A-F0-9]{64})(")', {
            param($match)
            $match.Groups[1].Value + $match.Groups[2].Value.ToLower() + $match.Groups[3].Value
        })
        $modified = $true
    }
    
    # Fix BACKLOG status
    if ($content -match '"status":\s*"BACKLOG"') {
        $content = $content -replace '"status":\s*"BACKLOG"', '"status":  "PLANNED"'
        $modified = $true
    }
    
    if ($modified) {
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        Write-Host "Fixed: $($file.Name)" -ForegroundColor Green
        $fixedCount++
    }
}

Write-Host "`nFixed $fixedCount files" -ForegroundColor Cyan
