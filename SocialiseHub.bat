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

:: Always rebuild to pick up source changes
echo  Building backend...
call npx tsc
echo.

echo  Building frontend...
call npx vite build client
echo.

echo  Building Electron...
call npx tsc -p electron/tsconfig.json
call npx tsc -p electron/tsconfig.preload.json
echo.

:: Always rebuild native modules for Electron
:: This ensures the .node binary matches Electron's ABI (not Node.js)
:: even if switching between dev:web (Node) and desktop (Electron) modes
echo  Rebuilding native modules for Electron...
if exist "node_modules\better-sqlite3\build" (
  rmdir /S /Q "node_modules\better-sqlite3\build" 2>nul
)
call npx @electron/rebuild -f -w better-sqlite3
echo.

echo  Launching SocialiseHub desktop app...
echo  (Close the window to stop)
echo.

:: Launch Electron desktop app (Express runs inside Electron)
npx electron .
