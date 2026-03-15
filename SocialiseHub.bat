@echo off
title SocialiseHub
echo.
echo  ============================
echo   SocialiseHub is starting...
echo  ============================
echo.

cd /d "%~dp0"

:: ── Auto-update from main ──────────────────────────────
:: Fetch latest from remote and check if main has new commits
echo  Checking for updates...
git fetch origin main >nul 2>&1
if errorlevel 1 (
  echo  Could not check for updates (offline?)
  echo.
  goto :skip_update
)

:: Compare local HEAD with origin/main
for /f %%i in ('git rev-parse HEAD') do set "LOCAL_HEAD=%%i"
for /f %%i in ('git rev-parse origin/main') do set "REMOTE_MAIN=%%i"

if "%LOCAL_HEAD%"=="%REMOTE_MAIN%" (
  echo  Already up to date.
  echo.
  goto :skip_update
)

:: Check if origin/main is ahead of us
git merge-base --is-ancestor HEAD origin/main >nul 2>&1
if errorlevel 1 (
  echo  Local changes detected — skipping auto-update.
  echo  Merge origin/main manually when ready.
  echo.
  goto :skip_update
)

echo  Update available! Updating to latest version...
git merge origin/main --ff-only >nul 2>&1
if errorlevel 1 (
  echo  Auto-update failed (merge conflict?). Continuing with current version.
  echo.
  goto :skip_update
)

echo  Updated successfully!
echo.

:: After update, re-install deps if package.json changed
git diff --name-only %LOCAL_HEAD% HEAD | findstr /C:"package.json" >nul 2>&1
if not errorlevel 1 (
  echo  Dependencies changed — reinstalling...
  call npm install
  echo.
)

:skip_update

:: ── Install dependencies if missing ────────────────────
if not exist "node_modules" (
  echo  Installing dependencies...
  call npm install
  echo.
)

:: ── Build ──────────────────────────────────────────────
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

:: ── Rebuild native modules for Electron if needed ──────
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

:: ── Launch ─────────────────────────────────────────────
echo  Launching SocialiseHub desktop app...
echo  (Close the window to stop)
echo.

npx electron .
