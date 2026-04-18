@echo off
echo ==============================================
echo       ClaimFlow - Docker Build & Run
echo ==============================================
echo Ensuring any old containers are shut down...
docker-compose down

echo.
echo Rebuilding and starting the entire stack...
docker-compose up --build -d

echo.
echo ==============================================
echo Setup Complete! Everything is running in the background.
echo.
echo Frontend URL: http://localhost:5173
echo Backend Docs: http://localhost:8000/docs
echo.
echo Press any key to close this window.
echo ==============================================
pause
