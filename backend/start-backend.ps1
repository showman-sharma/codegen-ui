# backend/start-backend.ps1
param()

# Change to backend directory
Set-Location $PSScriptRoot

# 1) Create virtual environment if missing
if (!(Test-Path ".\.venv")) {
    Write-Host "Creating Python virtual environment..."
    python -m venv .venv
}

# 2) Activate virtual environment
Write-Host "Activating virtual environment..."
. .\.venv\Scripts\Activate.ps1

# 3) Install/upgrade dependencies
Write-Host "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# 4) Load environment variables from .env
if (Test-Path ".\.env") {
    Write-Host "Loading .env variables..."
    Get-Content ".\.env" |
      Where-Object { $_ -and -not ($_ -match '^\s*#') } |
      ForEach-Object {
        $kv = $_ -split('=',2)
        if ($kv.Length -eq 2) {
          [Environment]::SetEnvironmentVariable($kv[0], $kv[1], 'Process')
        }
      }
} else {
    Write-Host "Warning: .env file not found. Make sure OPENAI_API_KEY is set in your environment."
}

# 5) Start Flask
Write-Host "Starting Flask server on http://0.0.0.0:5000 ..."
python app.py
