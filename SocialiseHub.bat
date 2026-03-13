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

:: Build the backend if not built yet
if not exist "dist" (
  echo  Building backend...
  call npx tsc
  echo.
)

:: Build the frontend if not built yet
if not exist "dist-client" (
  echo  Building frontend...
  call npx vite build client
  echo.
)

:: Build the Electron main process if not built yet
if not exist "dist-electron" (
  echo  Building Electron...
  call npx tsc -p electron/tsconfig.json
  call npx tsc -p electron/tsconfig.preload.json
  echo.
)

echo  Launching SocialiseHub desktop app...
echo  (Close the window to stop)
echo.

:: Launch Electron desktop app (Express runs inside Electron)
npx electron .
