@echo off
title SocialiseHub
echo.
echo  ============================
echo   SocialiseHub is starting...
echo  ============================
echo.

cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
  echo  Installing dependencies...
  call npm install
  echo.
)

:: Build the frontend if not built yet
if not exist "dist-client" (
  echo  Building frontend...
  call npx vite build client
  echo.
)

:: Build the backend if not built yet
if not exist "dist" (
  echo  Building backend...
  call npx tsc
  echo.
)

echo  Starting SocialiseHub on http://localhost:3000
echo  (Press Ctrl+C to stop)
echo.

:: Open browser after a short delay
start "" http://localhost:3000

:: Start the server
node dist/index.js
