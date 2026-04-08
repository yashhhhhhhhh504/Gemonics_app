@echo off
REM ============================================================================
REM NGS Analysis Platform - One-Click Launcher (Windows)
REM Double-click this file to start the platform.
REM ============================================================================
title NGS Analysis Platform
color 0B

echo.
echo ============================================
echo   NGS Analysis Platform
echo ============================================
echo.

set PROJECT_DIR=%~dp0
set PORT=8000

REM --------------------------------------------------------------------------
REM First-run check
REM --------------------------------------------------------------------------
if not exist "%PROJECT_DIR%backend\venv" (
    echo First run detected - running setup...
    echo.
    powershell -ExecutionPolicy Bypass -File "%PROJECT_DIR%setup-windows.ps1"
    echo.
)

if not exist "%PROJECT_DIR%frontend\dist\index.html" (
    echo Building frontend...
    cd /d "%PROJECT_DIR%frontend"
    call npm run build
    echo.
)

REM --------------------------------------------------------------------------
REM Kill existing process on port
REM --------------------------------------------------------------------------
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT% " ^| findstr "LISTENING" 2^>nul') do (
    echo Stopping existing process on port %PORT%...
    taskkill /PID %%a /F >nul 2>&1
)

REM --------------------------------------------------------------------------
REM Start backend server
REM --------------------------------------------------------------------------
echo Starting server on port %PORT%...
cd /d "%PROJECT_DIR%backend"
call venv\Scripts\activate.bat

start /B "" uvicorn main:app --host 127.0.0.1 --port %PORT%

REM Wait for server
echo Waiting for server...
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:%PORT%/api/system/health >nul 2>&1
if errorlevel 1 goto wait_loop

echo.
echo ============================================
echo   Server running at http://localhost:%PORT%
echo ============================================
echo.

REM Open browser
start http://localhost:%PORT%

echo Press any key to stop the server...
pause >nul

REM Cleanup
echo Shutting down...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT% " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo Server stopped.
