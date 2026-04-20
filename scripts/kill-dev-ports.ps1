# Kill processes using development ports
# Ports: 3000 (Web), 3001 (WebSocket), 4000 (API), 3002 (Project Tracker), 5000 (AI worker health)

$ports = @(3000, 3001, 3002, 4000, 5000)

Write-Host "🔍 Checking for processes using dev ports..." -ForegroundColor Cyan

foreach ($port in $ports) {
    $connections = netstat -ano | Select-String ":$port\s" | Select-String "LISTENING"
    
    if ($connections) {
        foreach ($line in $connections) {
            # Extract PID from the end of the line
            $processPid = ($line -split '\s+')[-1]
            
            if ($processPid -match '^\d+$') {
                try {
                    $process = Get-Process -Id $processPid -ErrorAction SilentlyContinue
                    if ($process) {
                        Write-Host "⚠️  Killing process on port $port (PID: $processPid, Name: $($process.ProcessName))" -ForegroundColor Yellow
                        Stop-Process -Id $processPid -Force
                        Start-Sleep -Milliseconds 500
                    }
                } catch {
                    Write-Host "⚠️  Could not kill process $processPid on port $port" -ForegroundColor Red
                }
            }
        }
    } else {
        Write-Host "✅ Port $port is free" -ForegroundColor Green
    }
}

Write-Host "`n🎉 All dev ports are now free!" -ForegroundColor Green
