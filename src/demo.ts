#!/usr/bin/env tsx
/**
 * 🎬 MCP-RealBrowser Demo Script
 *
 * 用法：
 *   1. 先启动 Edge：scripts\launch-edge.bat
 *   2. 开 Windows 录屏：Win+Alt+R
 *   3. 运行：npx tsx src/demo.ts
 *   4. 脚本跑完，停止录屏
 *
 * 每个步骤自动暂停 2-3 秒，方便观众看清楚。
 */

import { CDPConnection } from "./cdp-connection.js";

const PAUSE = 2500; // ms between steps

async function pause(ms = PAUSE) {
  await new Promise((r) => setTimeout(r, ms));
}
function say(msg: string) {
  console.log(`\n${"═".repeat(55)}`);
  console.log(`  ${msg}`);
  console.log(`${"═".repeat(55)}`);
}

const c = new CDPConnection();

// ===================================================================
// ACT 1: Connect
// ===================================================================
say("🎬 ACT 1: AI connects to YOUR real browser");
await pause(500);

await c.connect("http://localhost:9222");
console.log("   ✅ Connected via CDP — all your logins intact");
await pause();

// ===================================================================
// ACT 2: Navigate + See
// ===================================================================
say("🎬 ACT 2: AI opens a website and 'sees' it");
await pause(500);

await c.navigate("https://www.baidu.com");
console.log("   ✅ Navigated to Baidu");
await pause();

const snap = await c.snapshot();
const lines = snap.split("\n");
console.log(`   👁️  Snapshot: ${lines[2]} (AI's view of the page)`);
console.log("   Sample elements:");
lines.slice(4, 10).forEach((l) => console.log(`      ${l.substring(0, 85)}`));
await pause();

// ===================================================================
// ACT 3: Type + Search
// ===================================================================
say("🎬 ACT 3: AI types a search and presses Enter");
await pause(500);

// Click the search input
await c.click("#kw");
console.log("   ✅ Clicked search box");
await pause(1000);

await c.type("今天天气");
console.log('   ✅ Typed "今天天气"');
await pause(1500);

await c.pressKey("Enter");
console.log("   ✅ Pressed Enter");
await pause(3000);

// ===================================================================
// ACT 4: Extract results
// ===================================================================
say("🎬 ACT 4: AI reads the search results");
await pause(500);

const text = await c.extract();
const preview = text.substring(0, 300).replace(/\n/g, " ");
console.log(`   📄 Extracted ${text.length} chars:`);
console.log(`      "${preview}..."`);
await pause(2000);

// ===================================================================
// ACT 5: Screenshot
// ===================================================================
say("🎬 ACT 5: AI takes a screenshot for visual context");
await pause(500);

const shot = await c.screenshot();
console.log(`   📸 ${(shot.data.length / 1024).toFixed(0)} KB screenshot captured`);
await pause(2000);

// ===================================================================
// ACT 6: Navigate elsewhere + interact
// ===================================================================
say("🎬 ACT 6: AI navigates to another site");
await pause(500);

await c.navigate("https://github.com/obbbba/mcp-realbrowser");
console.log("   ✅ Opened project GitHub page");
await pause(2000);

const snap2 = await c.snapshot();
const lines2 = snap2.split("\n");
console.log(`   👁️  ${lines2[2]}`);
// Show repo-specific elements
lines2
  .filter((l) => l.includes("Star") || l.includes("Fork") || l.includes("Code") || l.includes("Issues"))
  .forEach((l) => console.log(`      ${l.substring(0, 85)}`));
await pause(2000);

// ===================================================================
// ACT 7: Scroll + Hover
// ===================================================================
say("🎬 ACT 7: AI scrolls and hovers");
await pause(500);

await c.scroll("down", 400);
console.log("   📜 Scrolled down");
await pause(1500);

await c.hover("mcp-realbrowser");
console.log("   🎯 Hovered over repo name");
await pause(1500);

// ===================================================================
// ACT 8: Go back + Reload
// ===================================================================
say("🎬 ACT 8: AI navigates history");
await pause(500);

await c.goBack();
console.log("   ⬅️  Went back");
await pause(1500);

await c.goForward();
console.log("   ➡️  Went forward");
await pause(1500);

// ===================================================================
// WRAP UP
// ===================================================================
await c.disconnect();

say("🏁 DEMO COMPLETE");
console.log("");
console.log("   What just happened:");
console.log("   ────────────────────");
console.log("   The AI (Claude Code) connected to YOUR real browser,");
console.log("   navigated websites, typed, clicked, extracted data,");
console.log("   took screenshots — while you watched.");
console.log("");
console.log("   No API keys. No headless browser. No blank windows.");
console.log("   Just your browser, now AI-controllable.");
console.log("");
console.log("   ⭐ github.com/obbbba/mcp-realbrowser");
console.log("");
console.log("   Stop recording now (Win+Alt+R).");
