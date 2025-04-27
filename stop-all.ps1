# stop-all.ps1
param()

# 1) Stop & remove backend job
if (Get-Job -Name CodeGenBackend -ErrorAction SilentlyContinue) {
    Write-Host "Stopping backend job..."
    Stop-Job -Name CodeGenBackend -Force
    Remove-Job -Name CodeGenBackend -Force
    Write-Host "Backend job stopped."
} else {
    Write-Host "No backend job named 'CodeGenBackend' found."
}

# 2) Kill any processes listening on ports 3000 (React) and 5000 (Flask)
$ports = @(3000, 5000)
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        try {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
            Write-Host "Killed process $($conn.OwningProcess) on port $port"
        } catch {
            Write-Host "Could not kill process $($conn.OwningProcess) on port $port"
        }
    }
}

Write-Host "All services stopped."
