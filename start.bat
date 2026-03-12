@echo off
echo Starting WiFi Sight...
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.

start "WiFi Sight Backend" cmd /c "cd backend && .venv\Scripts\python -m uvicorn main:app --reload"
start "WiFi Sight Frontend" cmd /c "cd frontend && npm run dev"
