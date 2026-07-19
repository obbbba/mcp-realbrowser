@echo off
echo ========================================
echo   Launch Chrome with Remote Debugging
echo ========================================
echo.
echo This starts Chrome with the CDP debugging port open (9222).
echo MCP-RealBrowser will connect to this instance.
echo.
echo NOTE: Close ALL existing Chrome windows first,
echo       then press any key to launch...
pause > nul

REM Try common Chrome install paths
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

if %CHROME%=="" (
    echo ERROR: Chrome not found. Please install Chrome first.
    pause
    exit /b 1
)

echo Starting Chrome with remote debugging on port 9222...
start "" %CHROME% --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-mcp-profile"

echo.
echo Chrome started! Now run: npm run dev
echo.
pause
