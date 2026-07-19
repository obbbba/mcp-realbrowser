# 🖥️ MCP-RealBrowser

> **Connect AI to your REAL browser — not a blank test window.**
>
> Your logins, cookies, extensions, and sessions all stay intact.
> Claude Code sees what you see, clicks what you click.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple)](https://modelcontextprotocol.io/)
[![CI](https://github.com/obbbba/mcp-realbrowser/actions/workflows/ci.yml/badge.svg)](https://github.com/obbbba/mcp-realbrowser/actions/workflows/ci.yml)

---

## Why this exists

Every existing MCP browser tool launches a **fresh, blank browser**:

| Tool | Problem |
|------|---------|
| `@playwright/mcp` | New incognito window — no logins, no cookies |
| `browser-use` | Python-only, doesn't speak MCP |
| `stagehand` | Data extraction focus, not general browsing |

**MCP-RealBrowser** connects to your *already-running* Chrome via CDP.
You're logged into Twitter, Gmail, Taobao, your company CRM?
The AI sees all of that. No re-login. No captcha hell. No "please copy-paste this".

---

## What it does

```
You: "Check my unread emails and summarize them"
AI:  navigate(gmail.com) → snapshot() → extract() → reads & summarizes

You: "Find flights to Tokyo next Friday under ¥3000"
AI:  navigate(ctrip.com) → fill("出发", "上海") → fill("到达", "东京")
     → click("搜索") → extract() → sorted results

You: "Open my GitHub and tell me how many stars I have"
AI:  navigate(github.com/obbbba) → snapshot() → "You have 1 star"
```

---

## Quick start

### 1. Install

```bash
git clone https://github.com/obbbba/mcp-realbrowser.git
cd mcp-realbrowser
npm install
npm run build
```

### 2. Run diagnostics

```bash
node dist/index.js --doctor
```

Checks: Node.js, dependencies, Chrome installed, Chrome running, CDP port open, debug flag enabled.

### 3. Launch Chrome with debug port

> ⚠️ **Close ALL Chrome windows first** (including system tray). Chrome must be launched with `--remote-debugging-port=9222` — otherwise the AI can't connect.

**Windows:** Double-click `scripts\launch-chrome.bat`

**Mac/Linux:**
```bash
chmod +x scripts/launch-chrome.sh
./scripts/launch-chrome.sh
```

**Or manually:**
```bash
# Mac
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

### 4. Choose your mode

#### Mode A: MCP Server (recommended — Claude Code auto-control)

Add to `.claude/settings.json` in your project:

```json
{
  "mcpServers": {
    "realbrowser": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-realbrowser/src/index.ts"],
      "env": { "CDP_PORT": "9222" }
    }
  }
}
```

Restart Claude Code. Now you can just talk:
```
> Go to baidu.com and search for "MCP tutorial"
> Open GitHub trending page and find the top TypeScript repo
> Navigate to my Gmail and summarize unread emails
```

#### Mode B: Direct API (for scripts / custom tools)

```ts
import { CDPConnection } from "mcp-realbrowser";

const browser = new CDPConnection();
await browser.connect("http://localhost:9222");

await browser.navigate("github.com");
const snapshot = await browser.snapshot(); // AI sees the page
await browser.click("Sign in");
await browser.type("hello");
const screenshot = await browser.screenshot();

await browser.disconnect(); // Chrome stays open
```

### 5. Verify it works

```bash
npx tsx src/smoke-test.ts
# Expected: 🎉 13/13 passed, 0 failed
```
---

## Tools (14)

| Tool | What it does |
|------|-------------|
| `navigate(url)` | Open any URL in the current tab |
| `snapshot()` | Scan page DOM — returns all interactive elements with roles and labels |
| `click(target)` | Click by CSS selector, text, role, placeholder, or label (6 strategies) |
| `type(text)` | Type into the focused input with human-like delay |
| `press_key(key)` | Press Enter, Tab, Escape, arrows, etc. |
| `screenshot()` | Take a viewport screenshot (PNG, base64) |
| `extract()` | Get all visible text (up to 15K chars) |
| `scroll(direction, amount?)` | Scroll up/down, returns scroll position |
| `fill(field, value)` | Fill an input by placeholder or label |
| `go_back()` | Navigate back in browser history |
| `go_forward()` | Navigate forward in browser history |
| `reload()` | Reload the current page |
| `hover(target)` | Hover over an element (dropdowns, tooltips) |
| `wait_for_text(text, timeout?)` | Wait for text to appear after an action |

---

## Architecture

```
┌──────────────┐     stdio (MCP)     ┌──────────────────┐     CDP (ws)     ┌──────────────┐
│  Claude Code │ ◄────────────────► │  MCP-RealBrowser  │ ◄──────────────► │  Your Chrome │
│  (AI Agent)  │   JSON-RPC 2.0     │  (TypeScript)     │   DevTools Proto │  (real data) │
└──────────────┘                    └──────────────────┘                  └──────────────┘
                                           │
                                           │  chromium.connectOverCDP()
                                           │  DOM snapshot (interactive elements)
                                           │  page.screenshot()
                                           │  page.keyboard.type()
                                           ▼
                                    ┌──────────────┐
                                    │   Playwright  │
                                    └──────────────┘
```

Key design decisions:
- **CDP over launching**: Connects to YOUR browser, not a fresh one
- **DOM snapshot for vision**: Structured, fast, 250-element limit keeps context manageable
- **Screenshot as fallback**: For visual pages where DOM structure isn't enough
- **Disconnect ≠ Close**: Shutting down the MCP server never closes your browser
- **--doctor mode**: Diagnose Chrome/CDP issues before starting the server

---

## Troubleshooting

### "CDP port not accepting connections" (most common)

This means Chrome is running but **without** the `--remote-debugging-port` flag.

**Fix:**
```bash
# 1. Kill ALL Chrome processes (yes, all of them — system tray too)
# Windows:
taskkill /F /IM chrome.exe

# Mac:
pkill -f "Google Chrome"

# 2. Re-launch with the debugging flag
scripts/launch-chrome.bat   # Windows
./scripts/launch-chrome.sh  # Mac/Linux

# 3. Verify the port is open
curl http://localhost:9222/json/version
```

### "What port is my Chrome on?"

Run `--doctor` to diagnose all common issues:
```bash
node dist/index.js --doctor
```

### Blank page / no content

Some sites block automation. Try:
1. Use `screenshot` instead of `snapshot` for visual pages
2. Use `extract` for text-heavy pages
3. Some SPAs need `wait_for_text` after navigation

### Chrome starts but ignores the flag

Chrome may pick up an existing session. Use a separate profile:
```bash
chrome --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-mcp-profile"
```

---

## Supported browsers

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Primary target |
| Edge | ✅ Full | Same CDP protocol |
| Brave | ✅ Full | Chromium-based |
| Arc | ✅ Full | Chromium-based |
| Opera | ✅ Full | Chromium-based |
| 360 / QQ / Sogou | ⚠️ Likely | Chromium-based, not tested |
| Firefox | 🔜 Phase 2 | Via WebDriver BiDi |
| Safari | 🔜 Phase 3 | macOS only |

---

## Contributing

Pull requests welcome! Areas you can help:
- **New tools** — want `drag_and_drop` or `select_option`? PR it.
- **Bug fixes** — found an edge case? Fix it.
- **Docs** — better examples, translations, tutorials.
- **Tests** — more coverage for edge cases.

1. Fork it
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Run the smoke test: `npx tsx src/smoke-test.ts` — should be 13/13
4. Commit (`git commit -m 'Add something amazing'`)
5. Push + open a Pull Request

---

## License

MIT © 2024

---

## Star History

If this is useful, a ⭐ on GitHub makes a big difference — it tells others the project is worth their time.

---

[中文说明](#chinese)

### 中文说明

**MCP-RealBrowser** 是一个 MCP 服务器，让 AI 助手（Claude Code、Cursor 等）连接你**真实的 Chrome 浏览器**进行操作，保留所有登录态、Cookie、插件。

**与现有方案的区别：** Playwright MCP / Browser-Use / Stagehand 都会启动全新的空白浏览器——没有登录状态。MCP-RealBrowser 通过 CDP 协议直连你正在使用的 Chrome。

**两种使用方式：**

**A. MCP Server 模式（推荐）：**
1. `git clone https://github.com/obbbba/mcp-realbrowser.git` → `npm install` → `npm run build`
2. `node dist/index.js --doctor` 诊断环境
3. 关闭所有 Chrome 窗口，运行 `scripts/launch-chrome.bat`
4. 在 `.claude/settings.json` 中配置 MCP Server（见上方 JSON）
5. 重启 Claude Code，直接说"帮我打开百度搜索 MCP 教程"

**B. 直接 API 模式：**
```ts
import { CDPConnection } from "mcp-realbrowser";
const browser = new CDPConnection();
await browser.connect("http://localhost:9222");
await browser.navigate("github.com");
await browser.click("Sign in");
await browser.disconnect();
```

**验证安装：** `npx tsx src/smoke-test.ts` → 🎉 13/13 通过

**14 个工具：** navigate / snapshot / click / type / press_key / screenshot / extract / scroll / fill / go_back / go_forward / reload / hover / wait_for_text

**故障排除：** 运行 `--doctor` 诊断。最常见的问题：Chrome 启动时没带 `--remote-debugging-port=9222` 参数。
