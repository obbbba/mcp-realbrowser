# 🖥️ MCP-RealBrowser

> **A persistent browser profile for your AI — log in once, sessions stay forever.**
>
> No more blank browser windows. No more "please copy-paste this page."
> Give your AI a dedicated browser identity, and it remembers everything.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple)](https://modelcontextprotocol.io/)
[![CI](https://github.com/obbbba/mcp-realbrowser/actions/workflows/ci.yml/badge.svg)](https://github.com/obbbba/mcp-realbrowser/actions/workflows/ci.yml)

---

## Why this exists

Every existing MCP browser tool launches a **fresh, blank browser** that forgets everything when closed:

| Tool | Problem |
|------|---------|
| `@playwright/mcp` | New incognito window, temporary profile — lost on restart |
| `browser-use` | Python-only, doesn't speak MCP |
| `stagehand` | Data extraction focus, not general browsing |

**MCP-RealBrowser** gives your AI a **persistent browser profile** — same directory, same cookies, same sessions across restarts. Log into GitHub, Gmail, Bilibili once, and it stays logged in forever.

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

### 3. Launch your browser with debug port

> The browser uses a **separate persistent profile** — your daily browser isn't affected.

**Windows (Edge — pre-installed on Win11):**
```bat
scripts\launch-edge.bat
```

**Windows (Chrome):**
```bat
scripts\launch-chrome.bat
```

**Mac/Linux:**
```bash
chmod +x scripts/launch-chrome.sh
./scripts/launch-chrome.sh
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
# Expected: test runs pass
```
---

## Tools (20)

| Tool | What it does |
|------|-------------|
| `navigate(url)` | Open any URL in the current tab |
| `snapshot(query?)` | Get interactive elements — filter with `query` to save tokens |
| `click(target)` | Click by CSS selector, text, role, placeholder, or label (6 strategies) |
| `type(text)` | Type into the focused input with human-like delay |
| `press_key(key)` | Press Enter, Tab, Escape, arrows, etc. |
| `screenshot(format?, quality?)` | Take a viewport screenshot (PNG/JPEG, quality 10-100 for JPEG) |
| `extract(maxChars?)` | Get visible text (default 3K chars, max 30K) |
| `scroll(direction, amount?)` | Scroll up/down, returns scroll position |
| `fill(field, value)` | Fill an input by placeholder or label |
| `select_option(target, value)` | Select an option in a `<select>` dropdown |
| `go_back()` | Navigate back in browser history |
| `go_forward()` | Navigate forward in browser history |
| `reload()` | Reload the current page |
| `hover(target)` | Hover over an element (dropdowns, tooltips) |
| `wait_for_text(text, timeout?)` | Wait for text to appear after an action |
| `list_tabs()` | List all open browser tabs with index, URL, and title |
| `select_tab(index)` | Switch to a tab by index |
| `new_tab(url?)` | Open a new browser tab |
| `close_tab(index)` | Close a tab by index |
| `reconnect()` | Reconnect to browser after restart |

### 💡 Token-saving tips

```
snapshot(query="login")    — only elements matching "login"
extract(maxChars=500)      — small snippets, not full pages
screenshot(format="jpeg", quality=40) — compact visual check
```

---

## Architecture

```
┌──────────────┐     stdio (MCP)     ┌──────────────────┐     CDP (ws)     ┌──────────────────┐
│  Claude Code │ ◄────────────────► │  MCP-RealBrowser  │ ◄──────────────► │  Browser profile │
│  (AI Agent)  │   JSON-RPC 2.0     │  (TypeScript)     │   DevTools Proto │  (persistent)    │
└──────────────┘                    └──────────────────┘                  └──────────────────┘
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
- **Persistent profile**: Browser data saved to `%LOCALAPPDATA%\mcp-realbrowser\` — cookies, logins, localStorage survive browser restarts
- **CDP attach (not launch)**: Uses `connectOverCDP` — the browser process lives independently from the MCP server
- **DOM snapshot for vision**: Structured element scan, 250-element limit keeps context manageable
- **Screenshot as fallback**: For visual pages where DOM structure isn't enough
- **Disconnect ≠ Close**: Shutting down the MCP server never closes your browser
- **--doctor mode**: Diagnose and auto-fix browser/CDP issues before starting the server

---

## Troubleshooting

### "CDP port not accepting connections"

The browser isn't running with the debugging flag.

**Quick fix:**
```bash
# One command to diagnose and auto-fix
node dist/index.js --doctor --fix
```

**Or manually:**
```bash
# 1. Kill stale browser processes
taskkill /F /IM msedge.exe & taskkill /F /IM chrome.exe

# 2. Run the launch script
scripts\launch-edge.bat   # Windows (Edge)
scripts\launch-chrome.bat # Windows (Chrome)
./scripts/launch-chrome.sh # Mac/Linux
```

### Other issues

Run `--doctor` for a full diagnostic report:
```bash
node dist/index.js --doctor
```

### First time? Log in to your sites

The profile is empty on first launch. Log into GitHub, Gmail, Bilibili, etc. once — cookies are saved to `%LOCALAPPDATA%\mcp-realbrowser\browser-profile` and persist forever.

---

## Supported browsers

| Browser | Support | Notes |
|---------|---------|-------|
| Edge | ✅ Full | Pre-installed on Win11, same CDP |
| Chrome | ✅ Full | All platforms |
| Brave | ✅ Full | Chromium-based |
| Arc | ✅ Full | Chromium-based |
| Opera | ✅ Full | Chromium-based |
| 360 / QQ / Sogou | ⚠️ Likely | Chromium-based, not tested |

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

**MCP-RealBrowser** 是一个 MCP 服务器，为 AI 助手提供**持久化的浏览器身份**。独立 profile 不影响你的日常浏览器。登录一次 GitHub、B 站、Gmail——Cookies 永久保存到 `%LOCALAPPDATA%\mcp-realbrowser\browser-profile`，关了再开登录态还在。

**与现有方案的区别：** Playwright MCP 每次启动临时 profile，关闭即销毁。我们用固定持久目录，登录态跨会话保留。

**两种使用方式：**

**A. MCP Server 模式（推荐）：**
1. `git clone` → `npm install` → `npm run build`
2. `node dist/index.js --doctor --fix` 一键诊断并启动浏览器
3. 在 `.claude/settings.json` 中配置 MCP Server
4. 重启 Claude Code，直接说话

**B. 直接 API 模式：**
```ts
import { CDPConnection } from "mcp-realbrowser";
const browser = new CDPConnection();
await browser.connect("http://localhost:9222");
await browser.navigate("github.com");
await browser.click("Sign in");
await browser.disconnect();
```

**验证：** `npx tsx src/smoke-test.ts`

**20 个工具：** navigate / snapshot / click / type / press_key / screenshot / extract / scroll / fill / select_option / go_back / go_forward / reload / hover / wait_for_text / list_tabs / select_tab / new_tab / close_tab / reconnect

**故障排除：** `--doctor --fix` 自动检测并修复。支持 Edge / Chrome / Brave / Arc / Opera / Vivaldi / Chromium，自动读取系统默认浏览器。
