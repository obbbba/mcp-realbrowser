/**
 * Doctor — diagnostic mode for MCP-RealBrowser.
 *
 * Checks: Chrome installed? Running? CDP port open? Process conflicts?
 * Run: npx tsx src/index.ts --doctor
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import http from "http";

const CDP_PORT = parseInt(process.env.CDP_PORT || "9222", 10);

interface CheckResult {
  label: string;
  pass: boolean;
  detail: string;
  fix?: string;
}

// ---------------------------------------------------------------------------
// Chrome install paths
// ---------------------------------------------------------------------------

function getChromePaths(): { os: string; paths: string[] } {
  if (process.platform === "win32") {
    return {
      os: "Windows",
      paths: [
        // Edge first — pre-installed on Windows 11, no extra install needed
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
        path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
      ],
    };
  } else if (process.platform === "darwin") {
    return {
      os: "macOS",
      paths: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      ],
    };
  } else {
    return {
      os: "Linux",
      paths: [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/usr/bin/microsoft-edge",
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkBrowserInstalled(): CheckResult {
  const { paths } = getChromePaths();
  const found: string[] = [];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      found.push(p);
    }
  }

  if (found.length > 0) {
    return {
      label: "Browser installed",
      pass: true,
      detail: `Found ${found.length} browser(s):\n    ${found.join("\n    ")}`,
    };
  }

  return {
    label: "Browser installed",
    pass: false,
    detail: "No supported browser found.",
    fix: "Install Google Chrome from https://www.google.com/chrome/",
  };
}

function checkBrowserRunning(): CheckResult {
  try {
    let cmd: string;
    if (process.platform === "win32") {
      cmd = 'tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV 2>NUL & tasklist /FI "IMAGENAME eq msedge.exe" /FO CSV 2>NUL';
    } else {
      cmd = 'pgrep -a -i "chrome|chromium|edge|brave" 2>/dev/null';
    }

    const output = execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();

    // Filter out the CSV header on Windows
    const lines = output
      .split("\n")
      .filter((l) => l.length > 5 && !l.startsWith('"Image Name'));

    if (lines.length > 0) {
      return {
        label: "Browser running",
        pass: true,
        detail: `${lines.length} browser process(es) detected`,
      };
    }

    return {
      label: "Browser running",
      pass: false,
      detail: "No browser process found.",
      fix: "Launch Chrome with: scripts/launch-chrome.bat (Windows) or scripts/launch-chrome.sh (Mac/Linux)",
    };
  } catch {
    return {
      label: "Browser running",
      pass: false,
      detail: "Could not check processes.",
      fix: "Make sure Chrome is running with --remote-debugging-port=9222",
    };
  }
}

async function checkCDPPort(): Promise<CheckResult> {
  return new Promise<CheckResult>((resolve) => {
    const req = http.get(
      `http://localhost:${CDP_PORT}/json/version`,
      { timeout: 3000 },
      (res: any) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve({
              label: `CDP port (${CDP_PORT})`,
              pass: true,
              detail: `✅ Browser: ${json.Browser}\n    User-Agent: ${json["User-Agent"]?.substring(0, 80)}`,
            });
          } catch {
            resolve({
              label: `CDP port (${CDP_PORT})`,
              pass: false,
              detail: "Port responded but not with CDP JSON. Wrong process on this port?",
            });
          }
        });
      }
    );

    req.on("error", (err: any) => {
      const code = (err as any)?.code || "";
      if (code === "ECONNREFUSED" || code === "ECONNRESET") {
        resolve({
          label: `CDP port (${CDP_PORT})`,
          pass: false,
          detail: `Port ${CDP_PORT} is not accepting connections.`,
          fix: [
            `1. Make sure browser is running with --remote-debugging-port=${CDP_PORT}`,
            `2. If browser IS running, kill ALL processes first, then re-launch:`,
            `   - Windows: taskkill /F /IM msedge.exe & taskkill /F /IM chrome.exe`,
            `   - Mac:     pkill -f "Google Chrome"`,
            `3. Then run: scripts/launch-edge.bat (or launch-chrome.bat)`,
          ].join("\n"),
        });
      } else {
        resolve({
          label: `CDP port (${CDP_PORT})`,
          pass: false,
          detail: `Could not connect: ${(err as any)?.message || String(err)}`,
        });
      }
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        label: `CDP port (${CDP_PORT})`,
        pass: false,
        detail: "Connection timed out after 3 seconds.",
      });
    });

    // We need to end the request
    req.end();
  });
}

function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0], 10);

  if (major >= 18) {
    return {
      label: "Node.js version",
      pass: true,
      detail: `${version} ✅`,
    };
  }

  return {
    label: "Node.js version",
    pass: false,
    detail: `${version} — Node.js 18+ required.`,
    fix: "Install Node.js 18+ from https://nodejs.org/",
  };
}

function checkProjectDeps(): CheckResult {
  try {
    // Check key dependencies exist in node_modules
    const deps = ["@modelcontextprotocol/sdk", "playwright-core", "zod"];
    for (const dep of deps) {
      const p = path.join(process.cwd(), "node_modules", dep);
      if (!fs.existsSync(p)) throw new Error(`Missing: ${dep}`);
    }

    return {
      label: "Dependencies",
      pass: true,
      detail: "All core dependencies installed ✅",
    };
  } catch (err: any) {
    return {
      label: "Dependencies",
      pass: false,
      detail: `Missing: ${err?.message || String(err)}`,
      fix: "Run: npm install",
    };
  }
}

function checkChromeFlagConflicts(): CheckResult {
  try {
    let cmd: string;
    if (process.platform === "win32") {
      cmd =
        'wmic process where "name=\'chrome.exe\' or name=\'msedge.exe\'" get commandline /VALUE 2>NUL';
    } else {
      cmd = 'ps aux | grep -i "[c]hrome\|[e]dge" 2>/dev/null';
    }

    const output = execSync(cmd, { encoding: "utf-8", timeout: 5000 });

    if (output.includes("--remote-debugging-port")) {
      const port = output.match(/--remote-debugging-port[= ](\d+)/)?.[1] || "unknown";
      return {
        label: "Browser debug flag",
        pass: port === String(CDP_PORT),
        detail:
          port === String(CDP_PORT)
            ? `Browser running with --remote-debugging-port=${CDP_PORT} ✅`
            : `Browser has debugging port on ${port}, not ${CDP_PORT}`,
        fix:
          port !== String(CDP_PORT)
            ? `Re-launch browser with --remote-debugging-port=${CDP_PORT} instead of ${port}`
            : undefined,
      };
    }

    return {
      label: "Browser debug flag",
      pass: false,
      detail: "Browser is running but WITHOUT --remote-debugging-port flag.",
      fix: [
        "This is the #1 issue! Browser must be launched with the debugging flag.",
        `1. Close ALL browser windows completely (check system tray too)`,
        `2. Run: scripts/launch-edge.bat or scripts/launch-chrome.bat`,
        `3. Or manually: msedge/chrome --remote-debugging-port=${CDP_PORT}`,
      ].join("\n"),
    };
  } catch {
    return {
      label: "Browser debug flag",
      pass: false,
      detail: "Could not check browser command-line flags.",
      fix: "Make sure browser is launched with --remote-debugging-port=9222",
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runDoctor(opts?: { fix?: boolean }): Promise<boolean> {
  const fixMode = opts?.fix ?? false;

  if (fixMode) {
    console.log("🔧 MCP-RealBrowser Doctor --fix\n");
    console.log("   Auto-fix mode: will kill stale browsers and launch a new one.\n");
  } else {
    console.log("🩺 MCP-RealBrowser Doctor\n");
    console.log(`   Tip: run with --fix to auto-kill and re-launch browser.\n`);
  }
  console.log(`   Platform: ${process.platform} ${process.arch}`);
  console.log(`   CDP Port: ${CDP_PORT}\n`);
  console.log("─".repeat(55));

  const checks: CheckResult[] = [
    checkNodeVersion(),
    checkProjectDeps(),
    await checkCDPPort(),
    checkBrowserInstalled(),
    checkBrowserRunning(),
    checkChromeFlagConflicts(),
  ];

  let passCount = 0;
  let needsFix = false;

  for (const check of checks) {
    const icon = check.pass ? "✅" : "❌";
    console.log(`\n${icon}  ${check.label}`);
    console.log(`    ${check.detail.replace(/\n/g, "\n    ")}`);
    if (check.fix && !check.pass) {
      console.log(`\n   🔧 Fix:\n    ${check.fix.replace(/\n/g, "\n    ")}`);
      needsFix = true;
    }
    if (check.pass) passCount++;
  }

  console.log("\n" + "─".repeat(55));
  console.log(`\n📊 ${passCount}/${checks.length} checks passed.`);

  const allPass = passCount === checks.length;

  // ── Auto-fix mode ──────────────────────────────────────────────────────
  if (fixMode && !allPass) {
    console.log("\n🔧 Running auto-fix...\n");
    const fixed = await autoFix(checks);
    if (fixed) {
      console.log("\n✨ Auto-fix applied! Re-run --doctor to verify.\n");
      return true;
    }
    console.log("\n⚠️  Auto-fix could not resolve all issues. See manual fixes above.\n");
    return false;
  }

  if (allPass) {
    console.log("\n✨ All checks passed! Ready to start MCP-RealBrowser.\n");
  } else {
    console.log(
      "\n⚠️  Some checks failed. Fix the issues above, then re-run --doctor.\n" +
      "   Or run --doctor --fix to auto-kill and re-launch the browser.\n"
    );
  }

  return allPass;
}

// ---------------------------------------------------------------------------
// Auto-fix: kill stale browser processes and launch a fresh one
// ---------------------------------------------------------------------------

async function autoFix(checks: CheckResult[]): Promise<boolean> {
  // 1. Kill all Chrome/Edge/Brave processes
  console.log("   Killing browser processes...");
  try {
    if (process.platform === "win32") {
      execSync("taskkill /F /IM msedge.exe 2>NUL & taskkill /F /IM chrome.exe 2>NUL", { timeout: 5000 });
      execSync("taskkill /F /IM msedge.exe 2>NUL", { timeout: 5000 });
      execSync("taskkill /F /IM brave.exe 2>NUL", { timeout: 5000 });
    } else {
      execSync('pkill -f "Google Chrome" 2>/dev/null; pkill -f "Microsoft Edge" 2>/dev/null; pkill -f "Brave Browser" 2>/dev/null', { timeout: 5000 });
    }
    console.log("   ✅ Browser processes terminated.");
  } catch {
    // It's OK if no processes were running
    console.log("   (no browser processes to kill)");
  }

  // Wait for processes to fully exit
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Find an installed browser and launch it with CDP
  const { paths } = getChromePaths();
  let launched = false;

  for (const browserPath of paths) {
    if (!fs.existsSync(browserPath)) continue;

    console.log(`   Launching: ${browserPath}`);
    try {
      const escapedPath = browserPath.replace(/"/g, '\\"');
      if (process.platform === "win32") {
        // Use cmd.exe start to detach the process
        execSync(
          `start "" "${escapedPath}" --remote-debugging-port=${CDP_PORT} --no-first-run --no-default-browser-check`,
          { timeout: 5000, windowsHide: true }
        );
      } else {
        execSync(
          `"${escapedPath}" --remote-debugging-port=${CDP_PORT} --no-first-run --no-default-browser-check &`,
          { timeout: 5000 }
        );
      }
      launched = true;
      console.log(`   ✅ Browser launched with CDP port ${CDP_PORT}.`);
      break;
    } catch (e: any) {
      console.log(`   ⚠️  Failed to launch: ${e.message}`);
      continue;
    }
  }

  if (!launched) {
    console.log(`   ❌ Could not auto-launch any browser.`);
    console.log(`   Manual: Run scripts/launch-chrome.bat or scripts/launch-edge.bat`);
    return false;
  }

  // 3. Wait for CDP to become available
  console.log(`   Waiting for CDP port ${CDP_PORT}...`);
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          `http://localhost:${CDP_PORT}/json/version`,
          { timeout: 2000 },
          () => resolve()
        );
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      });
      console.log(`   ✅ CDP port ${CDP_PORT} is ready.`);
      return true;
    } catch {
      // still waiting
    }
  }

  console.log(`   ⚠️  CDP port not responding after 10s. The browser may need a moment.`);
  console.log(`   Run: curl http://localhost:${CDP_PORT}/json/version to verify.`);
  return true; // browser was launched, just might need more time
}
