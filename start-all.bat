@echo off
REM === start-all.bat ===
REM 1) Launch Flask backend in a new window
start "Flask Backend" cmd /k ^
  "cd /d %~dp0backend && ^
   .\.venv\Scripts\activate && ^
   pip install --upgrade pip && ^
   pip install -r requirements.txt && ^
   python app.py"

REM 2) Launch React frontend in THIS window
echo Starting React frontend...
cd /d %~dp0frontend

REM install node_modules if missing
if not exist "node_modules" (
  echo Installing front-end dependencies...
  npm install
)

echo Running npm start...
npm start
