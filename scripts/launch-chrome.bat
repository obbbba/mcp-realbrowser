@echo off
echo ========================================
echo   Launch Chrome with Remote Debugging
echo ========================================
echo.
echo This opens YOUR real Chrome with all your logins,
echo bookmarks, cookies, and extensions intact.
echo The only difference: AI can now see and control it.
echo.
echo ⚠️  IMPORTANT: Close ALL Chrome windows first
echo    (check system tray too - right click ^> Exit)
echo.
echo    Press any key to continue...
pause > nul

REM Kill any remaining Chrome background processes
taskkill /F /IM chrome.exe >nul 2>&1

REM Find Chrome
set CHROME=""
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
)
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set CHROME="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    REM Edge also works — uses same CDP protocol
    echo Found Edge as alternative
)

if %CHROME%=="" (
    echo ERROR: Chrome not found. Install from https://www.google.com/chrome/
    pause
    exit /b 1
)

echo.
echo Starting Chrome with remote debugging on port 9222...
echo.
echo NOTE: Chrome requires a separate profile for CDP.
echo Your profile is saved at: %LOCALAPPDATA%\mcp-realbrowser\browser-profile
echo Log in once, and it'll be remembered forever.
echo.

REM Create persistent profile dir for CDP use
set PROFILE_DIR=%LOCALAPPDATA%\mcp-realbrowser\browser-profile
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

start "" %CHROME% --remote-debugging-port=9222 --user-data-dir="%PROFILE_DIR%" --no-first-run --no-default-browser-check

echo ✅ Chrome started! Now Claude Code can connect.
echo.
echo First time? Log into your sites — cookies will persist.
echo.
echo Run: node dist/index.js --doctor   (to verify)
echo Then restart Claude Code and say "open github.com"
echo.
pause
