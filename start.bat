@echo off
title Telegram Bot Manager
color 0A

echo.
echo  ================================================
echo    Telegram Bot Manager  ^|  Auto Setup
echo  ================================================
echo.

:: ── Step 1: Check Node.js ─────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js not found. Trying to install automatically...
    echo.
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements >nul 2>&1
    if %errorlevel% neq 0 (
        echo  [!] Auto-install failed.
        echo.
        echo  Please install Node.js manually, then run this file again:
        echo.
        echo      https://nodejs.org/en/download
        echo.
        start https://nodejs.org/en/download
        pause
        exit /b 1
    )
    echo  [OK] Node.js installed!
    echo.
    echo  IMPORTANT: Close this window and run start.bat again
    echo  so the new Node.js is recognised.
    echo.
    pause
    exit /b 0
)

for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VER=%%i
echo  [OK] Node.js %NODE_VER% detected.

:: ── Step 2: Install dependencies if missing ───────────────────────────────
if not exist "node_modules\express" (
    echo.
    echo  [!] Packages not installed. Running npm install...
    echo      ^(First run only — takes 1-3 minutes^)
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [!] npm install failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Packages installed successfully!
)

:: ── Step 3: Start the server ──────────────────────────────────────────────
echo.
echo  ================================================
echo    Starting server at http://localhost:3000
echo    Close this window to stop.
echo  ================================================
echo.

node telegram-bot-server.js
echo.
echo  Server stopped. Press any key to exit.
pause >nul
