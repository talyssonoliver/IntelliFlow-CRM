# Cleanup tmpclaude temporary directories
# This script removes tmpclaude-*-cwd directories that are older than 5 minutes

$projectRoot = "C:\Users\talys\projects\intelliFlow-CRM"
$pattern = "tmpclaude-*-cwd"
$maxAge = (Get-Date).AddMinutes(-1000)

Write-Host "Cleaning up tmpclaude directories older than 1 hour..."

Get-ChildItem -Path $projectRoot -Filter $pattern -Recurse -Force -Directory -ErrorAction SilentlyContinue | 
    Where-Object { $_.LastWriteTime -lt $maxAge } | 
    ForEach-Object {
        Write-Host "Removing: $($_.FullName)"
        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }

Write-Host "Cleanup complete!"
