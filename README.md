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
You: "Check my latest unread emails and summarize them"
AI:  navigate(gmail.com)  →  snapshot()  →  extract()  →  summary

You: "Find a flight to Tokyo next Friday under ¥3000"
AI:  navigate(ctrip.com)  →  fill("出发", "上海")  →  fill("到达", "东京")
     →  click("搜索")  →  extract()  →  sorted results

You: "Buy the thing in my Taobao cart"
AI:  navigate(taobao.com)  →  click("购物车")  →  snapshot()  →  click("结算")
     →  fill + click through checkout
```

---

## Quick start

### 1. Install

```bash
git clone https://github.com/YOUR_USERNAME/mcp-realbrowser.git
cd mcp-realbrowser
npm install
npm run build
```

### 2. Diagnose (optional but recommended)

```bash
npm run build
node dist/index.js --doctor
```

This checks: Chrome installed? Running with CDP? Port available? Gives specific fix instructions for each issue.

### 3. Launch Chrome with debugging

**Windows:**
```bat
scripts\launch-chrome.bat
```

**Mac / Linux:**
```bash
chmod +x scripts/launch-chrome.sh
./scripts/launch-chrome.sh
```

Or manually:
```bash
# Mac
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

### 4. Configure Claude Code

Add to your Claude Code MCP config (`~/.claude/claude.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "realbrowser": {
      "command": "node",
      "args": ["D:/claude-work/mcp-realbrowser/dist/index.js"],
      "env": {
        "CDP_PORT": "9222"
      }
    }
  }
}
```

Or during development:
```json
{
  "mcpServers": {
    "realbrowser": {
      "command": "npx",
      "args": ["tsx", "D:/claude-work/mcp-realbrowser/src/index.ts"],
      "env": {
        "CDP_PORT": "9222"
      }
    }
  }
}
```

### 5. Use it

Start Claude Code and try:
```
> Navigate to github.com and find the top trending TypeScript repos
> Open Baidu and search for "MCP protocol tutorial"
> Go to my Gmail and check unread messages
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

Pull requests welcome! This is a young project — there's plenty to improve.

1. Fork it
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add something amazing'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## License

MIT © 2024

---

## Star History

If you find this useful, a ⭐ on GitHub helps a ton — it tells others this project is worth their time.

---

[中文说明](#chinese)

### 中文说明

**MCP-RealBrowser** 是一个 MCP 服务器，让 AI 助手（Claude Code、Cursor 等）连接你**真实的 Chrome 浏览器**进行操作。

与现有方案的区别：其他工具会启动一个全新的空白浏览器窗口——没有登录状态、没有 Cookie、没有插件。而 MCP-RealBrowser 通过 CDP 协议连接你正在使用的 Chrome，保留所有登录会话。

**快速开始：**
1. 克隆项目 → `npm install` → `npm run build`
2. （推荐）运行 `node dist/index.js --doctor` 诊断环境
3. 关闭所有 Chrome 窗口，运行 `scripts/launch-chrome.bat`（Windows）
4. 在 Claude Code 配置中添加 MCP Server（见上方 JSON 配置）
5. 打开 Claude Code，说"帮我打开百度搜索 MCP 教程"

**14 个工具：** navigate（导航）、snapshot（页面结构扫描）、click（点击）、type（输入）、press_key（按键）、screenshot（截图）、extract（提取文本）、scroll（滚动）、fill（填写表单）、go_back（后退）、go_forward（前进）、reload（刷新）、hover（悬停）、wait_for_text（等待文本出现）

**故障排除：** 如果 CDP 连接失败，运行 `--doctor` 诊断，最常见的原因是 Chrome 启动时没带 `--remote-debugging-port` 参数。
