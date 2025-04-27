# start-all.ps1
param()

# 1) Launch the Flask backend in a new PowerShell window
Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$PSScriptRoot\backend\start-backend.ps1" -WindowStyle Minimized
Write-Host "Backend launched."

# 2) Now start the React frontend in THIS window
Write-Host "Starting frontend..."
Push-Location "$PSScriptRoot\frontend"
if (!(Test-Path ".\node_modules")) {
    npm install
}
npm start
Pop-Location
