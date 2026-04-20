# Reset apps/web Next.js / Turbopack caches after a mid-compile crash.
#
# Turbopack's persistent cache (RocksDB-style store in .next/cache) can be left
# with an open write batch after an unclean shutdown. Subsequent `next dev`
# boots then fail with:
#   - "Another write batch or compaction is already active"
#   - "Cannot find module '../chunks/ssr/[turbopack]_runtime.js'"
#   - "ENOENT: no such file or directory, open '.next/dev/routes-manifest.json'"
# Deleting .next/ forces a clean recompile on the next dev run.

param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$nextDir = Join-Path $repoRoot 'apps\web\.next'

function Write-Info($msg) {
    if (-not $Quiet) { Write-Host $msg -ForegroundColor Cyan }
}

function Write-Ok($msg) {
    if (-not $Quiet) { Write-Host $msg -ForegroundColor Green }
}

function Write-Warn($msg) {
    if (-not $Quiet) { Write-Host $msg -ForegroundColor Yellow }
}

Write-Info "Checking for `next dev` processes on port 3000..."
$port3000 = netstat -ano | Select-String ':3000\s' | Select-String 'LISTENING'
if ($port3000) {
    foreach ($line in $port3000) {
        $processPid = ($line -split '\s+')[-1]
        if ($processPid -match '^\d+$') {
            $proc = Get-Process -Id $processPid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Warn "Killing PID $processPid ($($proc.ProcessName)) on port 3000"
                Stop-Process -Id $processPid -Force
                Start-Sleep -Milliseconds 500
            }
        }
    }
} else {
    Write-Ok "Port 3000 is free"
}

if (Test-Path $nextDir) {
    Write-Info "Removing $nextDir ..."
    try {
        Remove-Item -Recurse -Force $nextDir
        Write-Ok "apps/web/.next removed"
    } catch {
        Write-Warn "First pass failed ($($_.Exception.Message)), retrying after 1s..."
        Start-Sleep -Seconds 1
        Remove-Item -Recurse -Force $nextDir
        Write-Ok "apps/web/.next removed (retry)"
    }
} else {
    Write-Ok "apps/web/.next already absent"
}

Write-Ok "Next.js cache reset complete. Run `pnpm dev:web` or `pnpm dev:complete` to recompile."
