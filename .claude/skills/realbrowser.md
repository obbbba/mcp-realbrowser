---
name: realbrowser
description: Control your real Chrome/Edge browser via CDP. Keeps logins, cookies, sessions intact.
---

# 🖥️ MCP-RealBrowser

You are controlling the user's REAL browser — not a blank test window. Their logins, cookies, extensions, and sessions all stay intact.

## Prerequisites

Before using these tools, ensure:
1. A Chromium browser (Chrome/Edge/Brave/Arc) is running with `--remote-debugging-port=9222`
2. The MCP server `realbrowser` is connected (check settings.json `mcpServers`)

If CDP port is not accessible, launch the browser:
```bash
# Edge (Windows)
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --remote-debugging-port=9222 --user-data-dir="$TEMP/edge-mcp-profile" &

# Chrome (Windows)
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Wait 2-3 seconds, then verify: `curl -s http://localhost:9222/json/version`

## Available MCP Tools

| Tool | Purpose |
|------|---------|
| `navigate(url)` | Open any URL |
| `snapshot()` | Get DOM accessibility tree — all interactive elements |
| `click(target)` | Click by CSS selector, text, role, placeholder, or label |
| `type(text)` | Type into focused input with human-like delay |
| `press_key(key)` | Press Enter, Tab, Escape, arrows, etc. |
| `screenshot()` | Take viewport screenshot (PNG base64) |
| `extract()` | Get all visible text (up to 15K chars) |
| `scroll(direction, amount?)` | Scroll up/down |
| `fill(field, value)` | Fill input by placeholder or label |
| `go_back()` / `go_forward()` | Navigate history |
| `reload()` | Reload page |
| `hover(target)` | Hover over element (dropdowns, tooltips) |
| `wait_for_text(text, timeout?)` | Wait for text to appear |

## Workflow

1. `navigate` → go to the target page
2. `snapshot` → see what's on the page (interactive elements)
3. `click` / `fill` / `type` → interact
4. `screenshot` or `extract` → get results
5. `wait_for_text` → confirm page loaded after actions

## Fallback

If MCP server is not connected, use the `CDPConnection` class directly:
```typescript
import { CDPConnection } from "./src/cdp-connection.js";
const c = new CDPConnection();
await c.connect("http://localhost:9222");
// ... use c.navigate(), c.snapshot(), c.click(), etc.
await c.disconnect();
```
