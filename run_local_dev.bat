@echo off
echo ==============================================
echo       ClaimFlow - Local Development Mode
echo ==============================================

echo Starting the PostgreSQL Database via Docker...
docker-compose up -d db

echo.
echo Starting Backend Server (Hot-Reloading enabled)...
start "ClaimFlow Backend API" cmd /k "cd backend && title ClaimFlow Backend Server && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

echo.
echo Starting Frontend Server (Hot-Reloading enabled)...
start "ClaimFlow Frontend App" cmd /k "cd frontend && title ClaimFlow Frontend App && npm run dev"

echo ==============================================
echo Development servers are successfully spinning up!
echo Two new terminal windows will appear for your logs.
echo.
echo You can safely close this master window.
echo ==============================================
pause
