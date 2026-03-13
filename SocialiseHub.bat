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

:: Rebuild native modules for Electron if needed
:: Check forge-meta for correct ABI version (143 = Electron 40.x)
set "REBUILD_NEEDED=0"
if not exist "node_modules\better-sqlite3\build\Release\.forge-meta" set "REBUILD_NEEDED=1"
if "%REBUILD_NEEDED%"=="0" (
  findstr /C:"143" "node_modules\better-sqlite3\build\Release\.forge-meta" >nul 2>&1
  if errorlevel 1 set "REBUILD_NEEDED=1"
)
if "%REBUILD_NEEDED%"=="1" (
  echo  Rebuilding native modules for Electron...
  call npx @electron/rebuild -f -w better-sqlite3
  echo.
)

echo  Launching SocialiseHub desktop app...
echo  (Close the window to stop)
echo.

:: Launch Electron desktop app (Express runs inside Electron)
npx electron .
