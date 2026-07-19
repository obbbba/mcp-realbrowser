#!/usr/bin/env node

/**
 * MCP-RealBrowser
 *
 * An MCP server that connects to your REAL Chrome browser via CDP,
 * letting AI agents (Claude Code, Cursor, Codex, etc.) see and control
 * your browser while preserving all your logins, cookies, and sessions.
 *
 * Chrome must be running with: --remote-debugging-port=9222
 *   Windows:  scripts/launch-chrome.bat
 *   Mac/Linux: scripts/launch-chrome.sh
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CDPConnection } from "./cdp-connection.js";
import { runDoctor } from "./doctor.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CDP_PORT = parseInt(process.env.CDP_PORT || "9222", 10);
const CDP_HOST = process.env.CDP_HOST || "localhost";
const CDP_ENDPOINT = `http://${CDP_HOST}:${CDP_PORT}`;

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

const cdp = new CDPConnection();

const server = new McpServer({
  name: "mcp-realbrowser",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Tool 1: navigate
// ---------------------------------------------------------------------------

server.tool(
  "navigate",
  "Navigate the browser to a URL. Use this to open any webpage.",
  {
    url: z
      .string()
      .describe("The URL to navigate to (https:// prefix added automatically if missing)"),
  },
  async ({ url }) => {
    const result = await cdp.navigate(url);
    return {
      content: [
        {
          type: "text",
          text: `✅ Opened: ${result.url}\n📄 Title: ${result.title}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 2: snapshot
// ---------------------------------------------------------------------------

server.tool(
  "snapshot",
  `Get the accessibility tree of the current page. This is how the AI "sees" what's on screen.
Returns all interactive elements (buttons, links, inputs, menus, etc.) with their roles, names, and states.
Use this BEFORE clicking or filling — it tells you exactly what's on the page and how to target it.`,
  {},
  async () => {
    const tree = await cdp.snapshot();
    return {
      content: [{ type: "text", text: tree }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 3: click
// ---------------------------------------------------------------------------

server.tool(
  "click",
  `Click an element on the page. Tries multiple strategies in order:
1. CSS selector (e.g. "#submit-btn", ".login-button")
2. Visible text content (e.g. "Sign In", "下一步")
3. Button role with name
4. Link role with name
5. Placeholder text match
6. Label text match
Run 'snapshot' first to see what to click.`,
  {
    target: z
      .string()
      .describe("CSS selector, visible text, button name, or link text to click"),
  },
  async ({ target }) => {
    const result = await cdp.click(target);
    return {
      content: [{ type: "text", text: `✅ Clicked: ${result}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 4: type
// ---------------------------------------------------------------------------

server.tool(
  "type",
  "Type text into the currently focused element. Click an input field first, then type into it.",
  {
    text: z.string().describe("The text to type into the focused element"),
  },
  async ({ text }) => {
    const result = await cdp.type(text);
    return {
      content: [{ type: "text", text: `✅ Typed: "${result}"` }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 5: press_key
// ---------------------------------------------------------------------------

server.tool(
  "press_key",
  "Press a special keyboard key. Use for Enter (submit forms), Tab, Escape, arrow keys, etc.",
  {
    key: z
      .string()
      .describe("Key to press: Enter, Tab, Escape, ArrowDown, ArrowUp, Backspace, Delete, PageDown, PageUp"),
  },
  async ({ key }) => {
    const result = await cdp.pressKey(key);
    return {
      content: [{ type: "text", text: `✅ Pressed: ${result}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 6: screenshot
// ---------------------------------------------------------------------------

server.tool(
  "screenshot",
  `Take a screenshot of the current browser viewport.
Use this when you need visual context — reading text from images, understanding page layout,
or verifying that an action had the intended visual effect.
Prefer 'snapshot' for finding interactive elements; use screenshot as a supplement.`,
  {},
  async () => {
    const image = await cdp.screenshot();
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

// ---------------------------------------------------------------------------
// Tool 7: extract
// ---------------------------------------------------------------------------

server.tool(
  "extract",
  "Extract all visible text from the current page. Use this to grab data after navigating and interacting — product listings, article text, search results, etc. Returns up to 15,000 characters.",
  {},
  async () => {
    const text = await cdp.extract();
    return {
      content: [{ type: "text", text }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 8: scroll
// ---------------------------------------------------------------------------

server.tool(
  "scroll",
  "Scroll the page up or down.",
  {
    direction: z.enum(["up", "down"]).describe("Scroll direction"),
    amount: z
      .number()
      .optional()
      .describe("Pixels to scroll (default: 600)"),
  },
  async ({ direction, amount }) => {
    const result = await cdp.scroll(direction, amount);
    return {
      content: [{ type: "text", text: `✅ ${result}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 9: fill
// ---------------------------------------------------------------------------

server.tool(
  "fill",
  "Fill an input field by its placeholder text or label. Use this instead of click+type for form fields — it's faster and more reliable. Clears existing content first.",
  {
    field: z.string().describe("The placeholder text or label of the input field"),
    value: z.string().describe("The value to fill in"),
  },
  async ({ field, value }) => {
    const result = await cdp.fillField(field, value);
    return {
      content: [{ type: "text", text: `✅ ${result}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 10: go_back
// ---------------------------------------------------------------------------

server.tool(
  "go_back",
  "Navigate back to the previous page in browser history.",
  {},
  async () => {
    const result = await cdp.goBack();
    return {
      content: [{ type: "text", text: `⬅️ ${result}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 11: go_forward
// ---------------------------------------------------------------------------

server.tool(
  "go_forward",
  "Navigate forward in browser history.",
  {},
  async () => {
    const result = await cdp.goForward();
    return {
      content: [{ type: "text", text: `➡️ ${result}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 12: reload
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool 13: hover
// ---------------------------------------------------------------------------

server.tool(
  "hover",
  "Hover the mouse over an element. Useful for dropdown menus, tooltips, and hover-reveal content.",
  {
    target: z
      .string()
      .describe("CSS selector, visible text, or button name to hover over"),
  },
  async ({ target }) => {
    const result = await cdp.hover(target);
    return {
      content: [{ type: "text", text: `✅ Hovered: ${result}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 14: wait_for_text
// ---------------------------------------------------------------------------

server.tool(
  "wait_for_text",
  "Wait for specific text to appear on the page. Use this after clicking a button that triggers a page update — it ensures the new content has loaded before you snapshot or extract.",
  {
    text: z.string().describe("Text to wait for on the page"),
    timeout: z
      .number()
      .optional()
      .describe("Max wait time in milliseconds (default: 10000 = 10s)"),
  },
  async ({ text, timeout }) => {
    const result = await cdp.waitForText(text, timeout);
    return {
      content: [{ type: "text", text: `⏳ ${result}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  // ---------------------------------------------------------------------------
  // --doctor: diagnostic mode (mcp-realbrowser --doctor)
  // ---------------------------------------------------------------------------
  if (process.argv.includes("--doctor")) {
    const ok = await runDoctor();
    process.exit(ok ? 0 : 1);
  }

  console.error(`┌─────────────────────────────────────────────┐`);
  console.error(`│   🖥️  MCP-RealBrowser v1.1.0                  │`);
  console.error(`│   Real Chrome • Real Sessions • Real Work    │`);
  console.error(`└─────────────────────────────────────────────┘`);
  console.error(``);
  console.error(`[realbrowser] Connecting to Chrome CDP at ${CDP_ENDPOINT}...`);

  // Connect to the user's real Chrome
  await cdp.connect(CDP_ENDPOINT);

  // Register shutdown handler — disconnect cleanly, don't close browser
  process.on("SIGINT", async () => {
    console.error(`\n[realbrowser] Shutting down (Chrome stays open)...`);
    await cdp.disconnect();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.error(`\n[realbrowser] Shutting down (Chrome stays open)...`);
    await cdp.disconnect();
    process.exit(0);
  });

  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[realbrowser] ✅ Ready — 14 tools registered.`);
  console.error(`[realbrowser] 📋 Tools: navigate, snapshot, click, type, press_key, screenshot, extract, scroll, fill, go_back, go_forward, reload, hover, wait_for_text`);
}

main().catch((error) => {
  console.error(`[realbrowser] ❌ Fatal:`, error instanceof Error ? error.message : error);
  process.exit(1);
});
