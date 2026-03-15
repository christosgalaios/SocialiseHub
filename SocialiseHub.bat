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

for /f "tokens=*" %%v in ('node --version') do echo  Node.js %%v detected.
echo.

:: ── Auto-update (version-based) ────────────────────────
:: Read local version from VERSION file
set "LOCAL_VER=0"
if exist "%~dp0VERSION" (
  set /p LOCAL_VER=<"%~dp0VERSION"
)
for /f "tokens=*" %%a in ("!LOCAL_VER!") do set "LOCAL_VER=%%a"

echo  Local version: v!LOCAL_VER!

:: Fetch remote VERSION from GitHub (raw file on main branch)
curl -sf "https://raw.githubusercontent.com/christosgalaios/SocialiseHub/main/VERSION" -o "%TEMP%\socialise-remote-ver.txt" 2>nul
if errorlevel 1 (
  echo  Could not check for updates (offline?^)
  echo.
  goto :skip_update
)

set "REMOTE_VER="
if exist "%TEMP%\socialise-remote-ver.txt" (
  set /p REMOTE_VER=<"%TEMP%\socialise-remote-ver.txt"
  del "%TEMP%\socialise-remote-ver.txt" 2>nul
)
for /f "tokens=*" %%a in ("!REMOTE_VER!") do set "REMOTE_VER=%%a"

:: Validate remote version is a number
echo !REMOTE_VER!| findstr /R "^[0-9][0-9]*$" >nul 2>&1
if errorlevel 1 (
  echo  Could not read remote version. Skipping update.
  echo.
  goto :skip_update
)

echo  Latest stable: v!REMOTE_VER!

:: Compare versions (numeric)
if !REMOTE_VER! LEQ !LOCAL_VER! (
  echo  Up to date.
  echo.
  goto :skip_update
)

echo.
echo  Update available: v!LOCAL_VER! -^> v!REMOTE_VER!

:: Check if git is available — prefer git pull
where git >nul 2>&1
if errorlevel 1 goto :curl_update

:: ── Git-based update ───────────────────────────────────
echo  Updating via git...
git fetch origin main >nul 2>&1
if errorlevel 1 goto :curl_update

git merge origin/main --ff-only >nul 2>&1
if errorlevel 1 (
  echo  Git merge failed — falling back to download...
  goto :curl_update
)
echo  Updated to v!REMOTE_VER!!
echo.
call npm install >nul 2>&1
goto :skip_update

:: ── Curl-based update (no git) ─────────────────────────
:curl_update
echo  Downloading update...

curl -Lf -o "%TEMP%\socialise-update.zip" "https://github.com/christosgalaios/SocialiseHub/archive/refs/heads/main.zip" 2>nul
if errorlevel 1 (
  echo  Download failed. Continuing with current version.
  echo.
  goto :skip_update
)

:: Extract
if exist "%TEMP%\socialise-update" rmdir /S /Q "%TEMP%\socialise-update" 2>nul
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%TEMP%\socialise-update.zip' -DestinationPath '%TEMP%\socialise-update' -Force" 2>nul
if errorlevel 1 (
  echo  Extract failed. Continuing with current version.
  echo.
  goto :skip_update
)

set "UPDATE_SRC="
for /d %%d in ("%TEMP%\socialise-update\*") do set "UPDATE_SRC=%%d"

if not defined UPDATE_SRC (
  echo  Extract failed. Continuing with current version.
  echo.
  goto :skip_update
)

echo  Applying update...
for %%f in (package.json package-lock.json tsconfig.json vite.config.ts SocialiseHub.bat VERSION CLAUDE.md) do (
  if exist "!UPDATE_SRC!\%%f" copy /Y "!UPDATE_SRC!\%%f" "%~dp0%%f" >nul 2>&1
)
for %%d in (src client electron .githooks) do (
  if exist "!UPDATE_SRC!\%%d" (
    xcopy /E /Y /Q "!UPDATE_SRC!\%%d" "%~dp0%%d\" >nul 2>&1
  )
)

rmdir /S /Q "%TEMP%\socialise-update" 2>nul
del "%TEMP%\socialise-update.zip" 2>nul

echo  Updated to v!REMOTE_VER!!
echo.

if exist "node_modules" (
  echo  Updating dependencies...
  call npm install
  echo.
)

:skip_update

:: ── Install dependencies if missing ────────────────────
if not exist "node_modules" (
  echo  Installing dependencies (first run, may take a few minutes)...
  call npm install
  if errorlevel 1 (
    echo  ERROR: npm install failed.
    pause
    exit /b 1
  )
  echo.
)

:: ── Build ──────────────────────────────────────────────
echo  Building backend...
call npx tsc
if errorlevel 1 (
  echo  ERROR: Backend build failed.
  pause
  exit /b 1
)
echo.

echo  Building frontend...
call npx vite build client
if errorlevel 1 (
  echo  ERROR: Frontend build failed.
  pause
  exit /b 1
)
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
  if errorlevel 1 (
    echo  ERROR: Native module rebuild failed.
    pause
    exit /b 1
  )
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

:: If Electron exits with error, pause so user can see it
if errorlevel 1 (
  echo.
  echo  SocialiseHub exited with an error.
  pause
)
endlocal
