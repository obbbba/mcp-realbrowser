#!/usr/bin/env bash
set -e

echo "========================================"
echo "  Launch Chrome with Remote Debugging"
echo "========================================"
echo ""
echo "This opens YOUR real Chrome with all your logins,"
echo "bookmarks, cookies, and extensions intact."
echo "The only difference: AI can now see and control it."
echo ""
echo "⚠️  IMPORTANT: Close ALL Chrome windows first"
echo "   (check system tray / dock too)"
echo ""

# Kill any remaining Chrome processes
pkill -f "Google Chrome" 2>/dev/null || true
sleep 1

# Find Chrome
CHROME=""
for path in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/usr/bin/google-chrome" \
    "/usr/bin/chromium-browser" \
    "/usr/bin/chromium" \
    "/usr/bin/microsoft-edge"; do
    if [ -x "$path" ]; then
        CHROME="$path"
        break
    fi
done

if [ -z "$CHROME" ]; then
    echo "ERROR: Chrome not found. Install from https://www.google.com/chrome/"
    exit 1
fi

echo "Starting YOUR Chrome with remote debugging on port 9222..."
echo "(Your logins, cookies, and extensions are all preserved)"
echo ""

# NO --user-data-dir = uses your REAL Chrome profile
"$CHROME" --remote-debugging-port=9222 &

sleep 2
echo "✅ Chrome started! Now Claude Code can connect."
echo ""
echo "Verify:  node dist/index.js --doctor"
echo "Then restart Claude Code and say 'open github.com'"
