@echo off
setlocal enabledelayedexpansion
title SocialiseHub
echo.
echo  ============================
echo   SocialiseHub is starting...
echo  ============================
echo.

cd /d "%~dp0"

:: ── Check / Install Node.js ────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo  Node.js is not installed. Installing...
  echo.

  :: Detect architecture
  set "NODE_VERSION=20.18.1"
  if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set "NODE_ARCH=x64"
  ) else (
    set "NODE_ARCH=x86"
  )

  set "NODE_MSI=node-v!NODE_VERSION!-!NODE_ARCH!.msi"
  set "NODE_URL=https://nodejs.org/dist/v!NODE_VERSION!/!NODE_MSI!"

  echo  Downloading Node.js v!NODE_VERSION! (!NODE_ARCH!)...
  curl -L -o "%TEMP%\!NODE_MSI!" "!NODE_URL!" 2>nul
  if errorlevel 1 (
    echo  ERROR: Failed to download Node.js.
    echo  Please install Node.js manually from https://nodejs.org
    echo  Then run this file again.
    pause
    exit /b 1
  )

  echo  Installing Node.js (this may ask for admin permission)...
  msiexec /i "%TEMP%\!NODE_MSI!" /qb
  if errorlevel 1 (
    echo  ERROR: Node.js installation failed.
    echo  Please install Node.js manually from https://nodejs.org
    pause
    exit /b 1
  )

  del "%TEMP%\!NODE_MSI!" 2>nul

  :: Refresh PATH so node/npm are available in this session
  for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
  for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
  set "PATH=!SYS_PATH!;!USR_PATH!"

  where node >nul 2>&1
  if errorlevel 1 (
    echo  Node.js installed but not found in PATH.
    echo  Please close this window and run SocialiseHub.bat again.
    pause
    exit /b 1
  )

  echo  Node.js installed successfully!
  echo.
)

:: Show Node version
for /f "tokens=*" %%v in ('node --version') do echo  Node.js %%v detected.
echo.

:: ── Auto-update (git or curl) ──────────────────────────
:: Check if git is available
where git >nul 2>&1
if errorlevel 1 goto :curl_update

:: Git is available — use git-based update (developer mode)
for /f %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT_BRANCH=%%i"
if /i not "%CURRENT_BRANCH%"=="main" (
  echo  On branch '%CURRENT_BRANCH%' — skipping auto-update.
  echo.
  goto :skip_update
)

echo  Checking for updates (git)...
git fetch origin main >nul 2>&1
if errorlevel 1 (
  echo  Could not check for updates (offline?)
  echo.
  goto :skip_update
)

for /f %%i in ('git rev-parse HEAD') do set "LOCAL_HEAD=%%i"
for /f %%i in ('git rev-parse origin/main') do set "REMOTE_MAIN=%%i"

if "%LOCAL_HEAD%"=="%REMOTE_MAIN%" (
  echo  Already up to date.
  echo.
  goto :skip_update
)

git merge-base --is-ancestor HEAD origin/main >nul 2>&1
if errorlevel 1 (
  echo  Local changes detected — skipping auto-update.
  echo.
  goto :skip_update
)

echo  Update available! Updating...
git merge origin/main --ff-only >nul 2>&1
if errorlevel 1 (
  echo  Auto-update failed. Continuing with current version.
  echo.
  goto :skip_update
)
echo  Updated successfully!
echo.
goto :skip_update

:: ── Curl-based update (no git — end-user mode) ─────────
:curl_update
echo  Checking for updates...

:: Store current version hash if we have one
set "VERSION_FILE=%~dp0.version"
set "LOCAL_VERSION="
if exist "%VERSION_FILE%" (
  set /p LOCAL_VERSION=<"%VERSION_FILE%"
)

:: Get latest commit SHA from GitHub API
for /f "usebackq delims=" %%i in (`curl -s "https://api.github.com/repos/christosgalaios/SocialiseHub/commits/main" 2^>nul ^| findstr /C:"\"sha\""`) do (
  set "RAW_LINE=%%i"
)
:: Extract SHA from JSON line like:   "sha": "abc123...",
set "REMOTE_SHA="
if defined RAW_LINE (
  for /f "tokens=2 delims=:, " %%a in ("!RAW_LINE!") do set "REMOTE_SHA=%%~a"
)

if not defined REMOTE_SHA (
  echo  Could not check for updates (offline?)
  echo.
  goto :skip_update
)

if "%LOCAL_VERSION%"=="%REMOTE_SHA%" (
  echo  Already up to date.
  echo.
  goto :skip_update
)

echo  Update available! Downloading latest version...

:: Download zip of main branch
curl -L -o "%TEMP%\socialise-update.zip" "https://github.com/christosgalaios/SocialiseHub/archive/refs/heads/main.zip" 2>nul
if errorlevel 1 (
  echo  Download failed. Continuing with current version.
  echo.
  goto :skip_update
)

:: Extract to temp folder
if exist "%TEMP%\socialise-update" rmdir /S /Q "%TEMP%\socialise-update" 2>nul
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%TEMP%\socialise-update.zip' -DestinationPath '%TEMP%\socialise-update' -Force" 2>nul
if errorlevel 1 (
  echo  Extract failed. Continuing with current version.
  echo.
  goto :skip_update
)

:: Find the extracted folder (GitHub zips as SocialiseHub-main/)
set "UPDATE_SRC="
for /d %%d in ("%TEMP%\socialise-update\*") do set "UPDATE_SRC=%%d"

if not defined UPDATE_SRC (
  echo  Extract produced no folder. Continuing with current version.
  echo.
  goto :skip_update
)

:: Copy updated files (preserve node_modules and data/)
echo  Applying update...
:: Copy source files, configs, and scripts — skip node_modules, data, .git
for %%f in (package.json package-lock.json tsconfig.json vite.config.ts SocialiseHub.bat) do (
  if exist "!UPDATE_SRC!\%%f" copy /Y "!UPDATE_SRC!\%%f" "%~dp0%%f" >nul 2>&1
)
:: Copy source directories
for %%d in (src client electron .githooks) do (
  if exist "!UPDATE_SRC!\%%d" (
    xcopy /E /Y /Q "!UPDATE_SRC!\%%d" "%~dp0%%d\" >nul 2>&1
  )
)

:: Save version hash
echo !REMOTE_SHA!>"%VERSION_FILE%"

:: Clean up
rmdir /S /Q "%TEMP%\socialise-update" 2>nul
del "%TEMP%\socialise-update.zip" 2>nul

echo  Updated successfully!
echo.

:: Check if package.json changed — reinstall deps
if exist "node_modules" (
  echo  Reinstalling dependencies (update may have changed them)...
  call npm install
  echo.
)

:skip_update

:: ── Install dependencies if missing ────────────────────
if not exist "node_modules" (
  echo  Installing dependencies (first run — this may take a few minutes)...
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
endlocal
