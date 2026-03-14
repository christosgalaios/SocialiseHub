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

:: Rebuild native modules for Electron only if ABI mismatch detected
:: ABI 143 = Electron 40.x. If the .forge-meta has the right ABI, skip rebuild.
set "REBUILD_NEEDED=0"
if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" set "REBUILD_NEEDED=1"
if "%REBUILD_NEEDED%"=="0" (
  if exist "node_modules\better-sqlite3\build\Release\.forge-meta" (
    findstr /C:"143" "node_modules\better-sqlite3\build\Release\.forge-meta" >nul 2>&1
    if errorlevel 1 set "REBUILD_NEEDED=1"
  ) else (
    set "REBUILD_NEEDED=1"
  )
)
if "%REBUILD_NEEDED%"=="1" (
  echo  Rebuilding native modules for Electron...
  if exist "node_modules\better-sqlite3\build" (
    rmdir /S /Q "node_modules\better-sqlite3\build" 2>nul
  )
  call npx @electron/rebuild -f -w better-sqlite3
  echo.
) else (
  echo  Native modules OK (ABI 143^)
  echo.
)

echo  Launching SocialiseHub desktop app...
echo  (Close the window to stop)
echo.

:: Launch Electron desktop app (Express runs inside Electron)
npx electron .
