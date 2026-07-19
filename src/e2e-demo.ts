/**
 * End-to-end demo: Claude → MCP Engine → Chrome CDP → Real Browser
 * Run: npx tsx src/e2e-demo.ts
 */
import { CDPConnection } from "./cdp-connection.js";

const c = new CDPConnection();
await c.connect("http://localhost:9222");

// 1. Navigate to the user's own repo
console.log("=== 1. Navigate ===");
const nav = await c.navigate("github.com/obbbba/mcp-realbrowser");
console.log(`   URL:   ${nav.url}`);
console.log(`   Title: ${nav.title}`);

// 2. Snapshot — what the AI "sees"
console.log("\n=== 2. Snapshot (AI's eyes) ===");
const snap = await c.snapshot();
const lines = snap.split("\n");
console.log(`   Total elements: ${lines[2]}`);
console.log("   First 20 elements:");
lines.slice(4, 24).forEach((l) => console.log(`   ${l.substring(0, 100)}`));

// 3. Extract visible text
console.log("\n=== 3. Extract (page text) ===");
const text = await c.extract();
console.log(`   ${text.length} chars total`);
console.log(`   Preview: ${text.substring(0, 150).replace(/\n/g, " ")}...`);

// 4. Screenshot
console.log("\n=== 4. Screenshot ===");
const shot = await c.screenshot();
console.log(`   ${(shot.data.length / 1024).toFixed(0)} KB PNG (base64)`);

// 5. Scroll down
console.log("\n=== 5. Scroll ===");
const scroll = await c.scroll("down", 500);
console.log(`   ${scroll}`);

// 6. Go back to top
await c.scroll("up", 9999);

// 7. Hover over repo name
console.log("\n=== 6. Hover ===");
const hover = await c.hover("mcp-realbrowser");
console.log(`   ${hover}`);

await c.disconnect();
console.log("\n✅ End-to-end demo complete. Chrome stays open.");
