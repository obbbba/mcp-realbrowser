#!/usr/bin/env bash
set -e

echo "========================================"
echo "  Launch Chrome with Remote Debugging"
echo "========================================"
echo ""
echo "This starts Chrome with the CDP debugging port open (9222)."
echo "MCP-RealBrowser will connect to this instance."
echo ""
echo "NOTE: Close ALL existing Chrome windows first!"
echo ""

# Find Chrome
CHROME=""
for path in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/usr/bin/google-chrome" \
    "/usr/bin/chromium-browser" \
    "/usr/bin/chromium"; do
    if [ -x "$path" ]; then
        CHROME="$path"
        break
    fi
done

if [ -z "$CHROME" ]; then
    echo "ERROR: Chrome not found."
    exit 1
fi

echo "Starting Chrome with remote debugging on port 9222..."
"$CHROME" \
    --remote-debugging-port=9222 \
    --user-data-dir="/tmp/chrome-mcp-profile" \
    &

echo ""
echo "Chrome started! Now run: npm run dev"
