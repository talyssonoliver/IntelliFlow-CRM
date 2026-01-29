# Download k6 for Windows
$url = 'https://github.com/grafana/k6/releases/download/v0.49.0/k6-v0.49.0-windows-amd64.zip'
$output = "$env:TEMP\k6.zip"
$extractPath = 'C:\Users\talys\tools\k6'

Write-Host 'Downloading k6...'
Invoke-WebRequest -Uri $url -OutFile $output

# Create extraction directory
New-Item -ItemType Directory -Force -Path $extractPath | Out-Null

# Extract
Write-Host 'Extracting k6...'
Expand-Archive -Path $output -DestinationPath $extractPath -Force

# Find the k6.exe path
$k6exe = Get-ChildItem -Path $extractPath -Filter "k6.exe" -Recurse | Select-Object -First 1
Write-Host "k6 installed at: $($k6exe.FullName)"

# Test it works
& $k6exe.FullName version
