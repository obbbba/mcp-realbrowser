#!/usr/bin/env node

/**
 * MCP-RealBrowser
 *
 * MCP server that connects to your REAL Chrome browser via CDP.
 * AI sees your logins, cookies, sessions — no blank browser windows.
 *
 * Chrome must be running with: --remote-debugging-port=9222
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { CDPConnection } from "./cdp-connection.js";
import { runDoctor } from "./doctor.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CDP_PORT = parseInt(process.env.CDP_PORT || "9222", 10);
const CDP_HOST = process.env.CDP_HOST || "localhost";
const CDP_ENDPOINT = `http://${CDP_HOST}:${CDP_PORT}`;

// Read version from package.json (single source of truth)
const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8")
);
const VERSION: string = pkg.version;

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

const cdp = new CDPConnection();

const server = new McpServer({
  name: "mcp-realbrowser",
  version: VERSION,
});

// ===========================================================================
// Tools — keep descriptions SHORT: they become part of the LLM context
// ===========================================================================

// 1 ── navigate ──────────────────────────────────────────────────────────────

server.tool(
  "navigate",
  "Open a URL in the browser tab. Adds https:// automatically if missing.",
  {
    url: z.string().describe("URL to navigate to"),
  },
  async ({ url }) => {
    const result = await cdp.navigate(url);
    return {
      content: [{ type: "text", text: `✅ Opened: ${result.url}\n📄 Title: ${result.title}` }],
    };
  }
);

// 2 ── snapshot ───────────────────────────────────────────────────────────────

server.tool(
  "snapshot",
  "Get page interactive elements (buttons, inputs, links) with roles and labels. Use before clicking. Pass 'query' to filter — saves tokens.",
  {
    query: z
      .string()
      .optional()
      .describe("Filter elements containing this text (case-insensitive). Omit to get all."),
  },
  async ({ query }) => {
    const tree = await cdp.snapshot(query);
    return {
      content: [{ type: "text", text: tree }],
    };
  }
);

// 3 ── click ──────────────────────────────────────────────────────────────────

server.tool(
  "click",
  "Click an element by CSS selector, visible text, button/link name, placeholder, or label. Run snapshot first.",
  {
    target: z.string().describe("CSS selector, visible text, or button/link name to click"),
  },
  async ({ target }) => {
    const result = await cdp.click(target);
    return {
      content: [{ type: "text", text: `✅ Clicked: ${result}` }],
    };
  }
);

// 4 ── type ───────────────────────────────────────────────────────────────────

server.tool(
  "type",
  "Type text into the focused input. Click an input first, then type into it.",
  {
    text: z.string().describe("Text to type"),
  },
  async ({ text }) => {
    const result = await cdp.type(text);
    return {
      content: [{ type: "text", text: `✅ Typed: "${result}"` }],
    };
  }
);

// 5 ── press_key ──────────────────────────────────────────────────────────────

server.tool(
  "press_key",
  "Press a key: Enter, Tab, Escape, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Backspace, Delete, PageDown, PageUp.",
  {
    key: z.string().describe("Key name to press"),
  },
  async ({ key }) => {
    const result = await cdp.pressKey(key);
    return {
      content: [{ type: "text", text: `✅ Pressed: ${result}` }],
    };
  }
);

// 6 ── screenshot ─────────────────────────────────────────────────────────────

server.tool(
  "screenshot",
  "Take a viewport screenshot. Use as visual fallback when snapshot isn't enough. JPEG format with lower quality saves tokens.",
  {
    format: z
      .enum(["png", "jpeg"])
      .optional()
      .describe("Image format: png (default) or jpeg (smaller)"),
    quality: z
      .number()
      .min(10)
      .max(100)
      .optional()
      .describe("JPEG quality 10-100 (default 80, lower = smaller)"),
  },
  async ({ format, quality }) => {
    const image = await cdp.screenshot({ format, quality });
    return {
      content: [
        {
          type: "image",
          data: image.data,
          mimeType: image.mimeType,
        },
      ],
    };
  }
);

// 7 ── extract ────────────────────────────────────────────────────────────────

server.tool(
  "extract",
  "Get visible page text. Default 3000 chars — increase maxChars if you need more.",
  {
    maxChars: z
      .number()
      .optional()
      .describe("Max characters to return (default 3000, max 30000)"),
  },
  async ({ maxChars }) => {
    const text = await cdp.extract(maxChars);
    return {
      content: [{ type: "text", text }],
    };
  }
);

// 8 ── scroll ─────────────────────────────────────────────────────────────────

server.tool(
  "scroll",
  "Scroll the page up or down.",
  {
    direction: z.enum(["up", "down"]).describe("Scroll direction"),
    amount: z.number().optional().describe("Pixels to scroll (default: 600)"),
  },
  async ({ direction, amount }) => {
    const result = await cdp.scroll(direction, amount);
    return {
      content: [{ type: "text", text: `✅ ${result}` }],
    };
  }
);

// 9 ── fill ───────────────────────────────────────────────────────────────────

server.tool(
  "fill",
  "Fill an input by placeholder or label text. Clears existing content first.",
  {
    field: z.string().describe("Placeholder or label of the input field"),
    value: z.string().describe("Value to fill in"),
  },
  async ({ field, value }) => {
    const result = await cdp.fillField(field, value);
    return {
      content: [{ type: "text", text: `✅ ${result}` }],
    };
  }
);

// 10 ── go_back ───────────────────────────────────────────────────────────────

server.tool(
  "go_back",
  "Go back to the previous page in browser history.",
  {},
  async () => {
    const result = await cdp.goBack();
    return {
      content: [{ type: "text", text: `⬅️ ${result}` }],
    };
  }
);

// 11 ── go_forward ────────────────────────────────────────────────────────────

server.tool(
  "go_forward",
  "Go forward in browser history.",
  {},
  async () => {
    const result = await cdp.goForward();
    return {
      content: [{ type: "text", text: `➡️ ${result}` }],
    };
  }
);

// 12 ── reload ────────────────────────────────────────────────────────────────

server.tool(
  "reload",
  "Reload the current page.",
  {},
  async () => {
    const result = await cdp.reload();
    return {
      content: [{ type: "text", text: `🔄 ${result}` }],
    };
  }
);

// 13 ── hover ─────────────────────────────────────────────────────────────────

server.tool(
  "hover",
  "Hover over an element by CSS, text, or role. For dropdowns and tooltips.",
  {
    target: z.string().describe("CSS selector, visible text, or button name to hover"),
  },
  async ({ target }) => {
    const result = await cdp.hover(target);
    return {
      content: [{ type: "text", text: `✅ Hovered: ${result}` }],
    };
  }
);

// 14 ── wait_for_text ─────────────────────────────────────────────────────────

server.tool(
  "wait_for_text",
  "Wait for text to appear after an action. Ensures page content has loaded.",
  {
    text: z.string().describe("Text to wait for"),
    timeout: z.number().optional().describe("Max wait ms (default: 10000)"),
  },
  async ({ text, timeout }) => {
    const result = await cdp.waitForText(text, timeout);
    return {
      content: [{ type: "text", text: `⏳ ${result}` }],
    };
  }
);

// 15 ── select_option ─────────────────────────────────────────────────────────

server.tool(
  "select_option",
  "Select an option in a <select> dropdown by the option's label text or value.",
  {
    target: z.string().describe("Placeholder, label, or CSS selector of the <select> element"),
    value: z.string().describe("Option label text or value to select"),
  },
  async ({ target, value }) => {
    const result = await cdp.selectOption(target, value);
    return {
      content: [{ type: "text", text: `✅ Selected: ${result}` }],
    };
  }
);

// 16 ── list_tabs ─────────────────────────────────────────────────────────────

server.tool(
  "list_tabs",
  "List all open browser tabs with index, URL, and title.",
  {},
  async () => {
    const tabs = await cdp.listTabs();
    const lines = tabs.map(
      (t) => `  [${t.index}] ${t.title.substring(0, 60)} — ${t.url.substring(0, 80)}`
    );
    return {
      content: [
        {
          type: "text",
          text: `📑 ${tabs.length} tab(s):\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

// 17 ── select_tab ────────────────────────────────────────────────────────────

server.tool(
  "select_tab",
  "Switch to a browser tab by its index (from list_tabs).",
  {
    index: z.number().describe("Tab index from list_tabs"),
  },
  async ({ index }) => {
    const result = await cdp.selectTab(index);
    return {
      content: [{ type: "text", text: `✅ ${result}` }],
    };
  }
);

// 18 ── new_tab ───────────────────────────────────────────────────────────────

server.tool(
  "new_tab",
  "Open a new browser tab. Optionally navigate to a URL immediately.",
  {
    url: z.string().optional().describe("URL to open in the new tab (optional)"),
  },
  async ({ url }) => {
    const result = await cdp.newTab(url);
    return {
      content: [{ type: "text", text: `✅ ${result}` }],
    };
  }
);

// 19 ── close_tab ─────────────────────────────────────────────────────────────

server.tool(
  "close_tab",
  "Close a browser tab by its index (from list_tabs). Won't close the last tab.",
  {
    index: z.number().describe("Tab index from list_tabs to close"),
  },
  async ({ index }) => {
    const result = await cdp.closeTab(index);
    return {
      content: [{ type: "text", text: `✅ ${result}` }],
    };
  }
);

// 20 ── reconnect ─────────────────────────────────────────────────────────────

server.tool(
  "reconnect",
  "Reconnect to browser after it was restarted. Use when browser operations fail with connection errors.",
  {},
  async () => {
    const result = await cdp.reconnect();
    return {
      content: [{ type: "text", text: `🔌 ${result}` }],
    };
  }
);

// ===========================================================================
// Start
// ===========================================================================

async function main() {
  // --doctor / --doctor --fix : diagnostic mode
  if (process.argv.includes("--doctor")) {
    const fix = process.argv.includes("--fix");
    const ok = await runDoctor({ fix });
    process.exit(ok ? 0 : 1);
  }

  console.error(`[realbrowser] v${VERSION} — connecting to ${CDP_ENDPOINT}...`);

  // Connect to the user's real Chrome
  await cdp.connect(CDP_ENDPOINT);

  // Register shutdown — disconnect cleanly, never close browser
  const shutdown = async () => {
    console.error(`\n[realbrowser] Shutting down (Chrome stays open)...`);
    await cdp.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[realbrowser] ✅ Ready — 20 tools, ${CDP_ENDPOINT}`);
}

main().catch((error) => {
  console.error(`[realbrowser] ❌ Fatal:`, error instanceof Error ? error.message : error);
  process.exit(1);
});
