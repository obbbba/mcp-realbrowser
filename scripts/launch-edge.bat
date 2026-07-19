@echo off
echo ========================================
echo   Launch Edge with Remote Debugging
echo ========================================
echo.
echo This opens YOUR real Edge with all your logins,
echo bookmarks, cookies, and extensions intact.
echo The only difference: AI can now see and control it.
echo.
echo ⚠️  IMPORTANT: Close ALL Edge windows first
echo    (check system tray too - right click ^> Exit)
echo    Press any key to continue...
pause > nul

REM Kill any remaining Edge background processes
taskkill /F /IM msedge.exe >nul 2>&1

REM Find Edge
set EDGE=""
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)
if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set EDGE="C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
    set EDGE="%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
)

if %EDGE%=="" (
    echo ERROR: Edge not found. Install from https://www.microsoft.com/edge
    pause
    exit /b 1
)

echo.
echo Starting Edge with remote debugging on port 9222...
echo.
echo NOTE: Chrome/Edge require a separate profile for CDP.
echo Your profile is saved at: %LOCALAPPDATA%\mcp-realbrowser\browser-profile
echo Log in once, and it'll be remembered forever.
echo.

REM Create persistent profile dir for CDP use
set PROFILE_DIR=%LOCALAPPDATA%\mcp-realbrowser\browser-profile
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

start "" %EDGE% --remote-debugging-port=9222 --user-data-dir="%PROFILE_DIR%" --no-first-run --no-default-browser-check

echo ✅ Edge started! Now Claude Code can connect.
echo.
echo First time? Log into your sites — cookies will persist.
echo.
echo Verify:  node dist/index.js --doctor
echo Then restart Claude Code and say "open github.com"
echo.
pause
