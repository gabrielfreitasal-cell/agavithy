@echo off
title Agavity — Starting...

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     AGAVITY — Context Engine         ║
echo  ║     Starting all services...         ║
echo  ╚══════════════════════════════════════╝
echo.

set DATABASE_URL=postgresql://agavity:agavity123@localhost:5432/agavity
set NODE_ENV=development
set PORT=8080

REM ── Start API server in background
echo [1/3] Starting API server on port 8080...
start "Agavity API" /MIN cmd /c "cd /d %~dp0artifacts\api-server && set DATABASE_URL=%DATABASE_URL% && set NODE_ENV=%NODE_ENV% && set PORT=%PORT% && pnpm run dev"

REM ── Wait for API to start
timeout /t 5 /nobreak >nul

REM ── Start Frontend (Vite dev server) in background
echo [2/3] Starting frontend on port 5173...
start "Agavity UI" /MIN cmd /c "cd /d %~dp0artifacts\agavity && set PORT=%PORT% && pnpm run dev"

REM ── Wait for Vite to start
timeout /t 5 /nobreak >nul

REM ── Start Electron
echo [3/3] Launching Agavity desktop app...
cd /d %~dp0artifacts\electron
npx electron dist/main.js

echo.
echo [Agavity] Shutting down...
