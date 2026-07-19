#!/usr/bin/env tsx
/**
 * Smoke test for MCP-RealBrowser core engine.
 * Tests: connect → navigate → snapshot → click → type → extract → screenshot → scroll → go_back
 * Run: npx tsx src/smoke-test.ts
 */

import { CDPConnection } from "./cdp-connection.js";

const CDP = "http://localhost:9222";
const TEST_URL = "https://github.com/obbbba/mcp-realbrowser";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function main() {
  console.log("🩺 MCP-RealBrowser Smoke Test\n");
  console.log(`   Target CDP: ${CDP}`);
  console.log(`   Test URL:   ${TEST_URL}\n`);
  console.log("─".repeat(50));

  const cdp = new CDPConnection();

  // -----------------------------------------------------------------------
  // 1. Connect
  // -----------------------------------------------------------------------
  console.log("\n📡 Connecting to Chrome...");
  try {
    await cdp.connect(CDP);
    check("connect to Chrome via CDP", true);
  } catch (err: any) {
    check("connect to Chrome via CDP", false, err.message);
    console.log("\n❌ Cannot continue without browser connection.");
    console.log("   Run: scripts/launch-chrome.bat");
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // 2. Navigate
  // -----------------------------------------------------------------------
  console.log("\n🧭 Navigating...");
  try {
    const result = await cdp.navigate(TEST_URL);
    check("navigate to GitHub", result.url.includes("github.com"), result.title);
    console.log(`   → ${result.title}`);
  } catch (err: any) {
    check("navigate", false, err.message);
  }

  // -----------------------------------------------------------------------
  // 3. Snapshot
  // -----------------------------------------------------------------------
  console.log("\n👁️  Snapshot...");
  try {
    const snap = await cdp.snapshot();
    const hasExpected = snap.includes("mcp-realbrowser") || snap.includes("obbbba");
    check(
      "snapshot returns page structure",
      snap.length > 100,
      `${snap.split("\n").length} lines, contains repo name: ${hasExpected}`
    );
    // Print first 8 lines as preview
    console.log(
      "   Preview:\n" +
        snap
          .split("\n")
          .slice(0, 8)
          .map((l) => "   │ " + l.substring(0, 80))
          .join("\n")
    );
  } catch (err: any) {
    check("snapshot", false, err.message);
  }

  // -----------------------------------------------------------------------
  // 4. Extract
  // -----------------------------------------------------------------------
  console.log("\n📄 Extract...");
  try {
    const text = await cdp.extract();
    check("extract visible text", text.length > 0, `${text.length} chars`);
    console.log(`   First 100 chars: ${text.substring(0, 100).replace(/\n/g, " ")}...`);
  } catch (err: any) {
    check("extract", false, err.message);
  }

  // -----------------------------------------------------------------------
  // 5. Screenshot
  // -----------------------------------------------------------------------
  console.log("\n📸 Screenshot...");
  try {
    const shot = await cdp.screenshot();
    check(
      "screenshot returns base64 PNG",
      shot.data.length > 100 && shot.mimeType === "image/png",
      `${(shot.data.length / 1024).toFixed(1)} KB`
    );
  } catch (err: any) {
    check("screenshot", false, err.message);
  }

  // -----------------------------------------------------------------------
  // 6. Hover (before click — still on repo page)
  // -----------------------------------------------------------------------
  console.log("\n🎯 Hover...");
  try {
    // Hover over the repo title link — always visible
    const hoverResult = await cdp.hover("mcp-realbrowser");
    check("hover by text", true, hoverResult);
  } catch {
    try {
      // Fallback: hover any link on the page
      await cdp.hover("a[href]");
      check("hover by CSS selector", true, "CSS fallback");
    } catch (err: any) {
      check("hover", false, err.message);
    }
  }

  // -----------------------------------------------------------------------
  // 7. Click (on a link from snapshot)
  // -----------------------------------------------------------------------
  console.log("\n🖱️  Click...");
  try {
    const clickResult = await cdp.click("Commits");
    check("click by text (Commits link)", true, clickResult);
  } catch {
    try {
      await cdp.click("main");
      check("click by CSS", true, "CSS fallback");
    } catch (err: any) {
      check("click", false, err.message);
    }
  }

  // -----------------------------------------------------------------------
  // 8. Go back + wait_for_text
  // -----------------------------------------------------------------------
  console.log("\n⬅️  Go back...");
  try {
    const backResult = await cdp.goBack();
    // GitHub SPA may use history.replaceState — check if we landed somewhere meaningful
    check("go_back executed", backResult.length > 5, backResult);
  } catch (err: any) {
    check("go_back", false, err.message);
  }

  // Re-navigate to a clean page for remaining tests
  console.log("\n🧭 Re-navigating for remaining tests...");
  try {
    await cdp.navigate("https://httpbin.org/links/10/0");
    check("re-navigate to httpbin", true, "clean test page");
  } catch {
    // Offline — just continue
    console.log("   (offline, continuing with current page)");
  }

  // -----------------------------------------------------------------------
  // 9. Scroll
  // -----------------------------------------------------------------------
  console.log("\n📜 Scroll...");
  try {
    const pageInfo = await cdp.scroll("down", 400);
    check("scroll down", pageInfo.includes("Scrolled"), pageInfo);
    await cdp.scroll("up", 200);
    check("scroll up", true);
  } catch (err: any) {
    check("scroll", false, err.message);
  }

  // -----------------------------------------------------------------------
  // 10. Reload
  // -----------------------------------------------------------------------
  console.log("\n🔄 Reload...");
  try {
    const reloadResult = await cdp.reload();
    check("reload page", reloadResult.includes("http"), reloadResult);
  } catch (err: any) {
    check("reload", false, err.message);
  }

  // -----------------------------------------------------------------------
  // 11. wait_for_text
  // -----------------------------------------------------------------------
  console.log("\n⏳ Wait for text...");
  try {
    // httpbin.org/links/10/0 shows numbered links — wait for "0" to appear
    const waitResult = await cdp.waitForText("0", 5000);
    check("wait_for_text", waitResult.includes("appeared"), waitResult);
  } catch (err: any) {
    check("wait_for_text", false, err.message);
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------
  await cdp.disconnect();

  // -----------------------------------------------------------------------
  // Report
  // -----------------------------------------------------------------------
  console.log("\n" + "─".repeat(50));
  const total = passed + failed;
  const emoji = failed === 0 ? "🎉" : failed <= 2 ? "⚠️" : "💥";
  console.log(
    `\n${emoji}  Results: ${passed}/${total} passed, ${failed} failed`
  );

  process.exit(failed > 0 ? 1 : 0);
}

main();
