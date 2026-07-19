/**
 * Doctor — diagnostic mode for MCP-RealBrowser.
 *
 * Checks: Chrome installed? Running? CDP port open? Process conflicts?
 * Run: npx tsx src/index.ts --doctor
 */

import { execSync, spawn } from "child_process";
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
// Default browser detection (reads OS preference)
// ---------------------------------------------------------------------------

function getDefaultBrowser(): "edge" | "chrome" | "brave" | "unknown" {
  if (process.platform === "win32") {
    try {
      // Read Windows default browser from registry
      const result = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice" /v ProgId 2>NUL',
        { encoding: "utf-8", timeout: 3000 }
      );
      const lower = result.toLowerCase();
      if (lower.includes("msedge")) return "edge";
      if (lower.includes("chrome")) return "chrome";
      if (lower.includes("brave")) return "brave";
    } catch {
      // Fall through
    }
  }

  if (process.platform === "darwin") {
    try {
      const result = execSync(
        'defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers 2>/dev/null',
        { encoding: "utf-8", timeout: 3000 }
      );
      const lower = result.toLowerCase();
      if (lower.includes("chrome")) return "chrome";
      if (lower.includes("edge")) return "edge";
      if (lower.includes("brave")) return "brave";
    } catch {
      // Fall through
    }
  }

  // Linux: check xdg-settings
  try {
    const result = execSync("xdg-settings get default-web-browser 2>/dev/null", {
      encoding: "utf-8",
      timeout: 3000,
    });
    const lower = result.toLowerCase();
    if (lower.includes("chrome") || lower.includes("chromium")) return "chrome";
    if (lower.includes("edge")) return "edge";
    if (lower.includes("brave")) return "brave";
  } catch {
    // Fall through
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Browser install paths (ordered by OS default preference)
// ---------------------------------------------------------------------------

function getChromePaths(): { os: string; paths: string[] } {
  const defaultBrowser = getDefaultBrowser();

  if (process.platform === "win32") {
    // Put the user's default browser first
    const all: string[] = [];
    if (defaultBrowser === "edge") {
      all.push("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
      all.push("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe");
    }
    if (defaultBrowser === "chrome") {
      all.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
      all.push("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");
      all.push(path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"));
    }
    if (defaultBrowser === "brave") {
      all.push(path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"));
    }
    // Then add the rest as fallbacks
    if (defaultBrowser !== "edge") {
      all.push("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
      all.push("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe");
    }
    if (defaultBrowser !== "chrome") {
      all.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
      all.push("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");
      all.push(path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"));
    }
    if (defaultBrowser !== "brave") {
      all.push(path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"));
    }
    return { os: "Windows", paths: all };
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
  console.log(`   CDP Port: ${CDP_PORT}`);
  console.log(`   Default browser: ${getDefaultBrowser()}\n`);
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
  // 1. Kill each browser individually — better error reporting
  console.log("   Killing browser processes...");
  const procs = process.platform === "win32"
    ? ["msedge.exe", "chrome.exe", "brave.exe"]
    : ["Google Chrome", "Microsoft Edge", "Brave Browser"];

  let killed = 0;
  for (const name of procs) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /IM ${name} 2>NUL`, { timeout: 3000 });
      } else {
        execSync(`pkill -f "${name}" 2>/dev/null`, { timeout: 3000 });
      }
      killed++;
    } catch {
      // wasn't running — fine
    }
  }
  if (killed > 0) {
    console.log(`   ✅ Killed ${killed} browser type(s).`);
  } else {
    console.log("   (no browser processes to kill)");
  }

  // Give killed processes time to fully exit
  await new Promise((r) => setTimeout(r, killed > 0 ? 1500 : 500));

  // 2. Launch browser using spawn with detached:true (NOT execSync "start")
  const { paths } = getChromePaths();
  let launched = false;

  for (const browserPath of paths) {
    if (!fs.existsSync(browserPath)) continue;

    const name = path.basename(browserPath);
    console.log(`   Launching: ${name}`);
    try {
      // Must use a separate user-data-dir — CDP is blocked on default profile
      const profileDir = path.join(
        process.env.LOCALAPPDATA || process.env.HOME || "/tmp",
        "mcp-realbrowser",
        "browser-profile"
      );
      fs.mkdirSync(profileDir, { recursive: true });

      const child = spawn(
        browserPath,
        [
          `--remote-debugging-port=${CDP_PORT}`,
          `--user-data-dir=${profileDir}`,
          "--no-first-run",
          "--no-default-browser-check",
          // Disable Edge's Startup Boost — it auto-restarts and steals the CDP flag
          "--disable-features=msEdgeStartupBoost",
        ],
        { detached: true, stdio: "ignore", windowsHide: true }
      );
      child.unref(); // don't block on it
      launched = true;
      console.log(`   ✅ ${name} launched (PID ${child.pid}).`);
      break;
    } catch (e: any) {
      console.log(`   ⚠️  Failed to launch ${name}: ${e.message}`);
    }
  }

  if (!launched) {
    const script = getDefaultBrowser() === "edge" ? "launch-edge.bat" : "launch-chrome.bat";
    console.log(`   ❌ Could not auto-launch. Run: scripts/${script}`);
    return false;
  }

  // 3. Poll CDP port with retries (max 15s — Edge can be slow on first launch)
  console.log(`   Waiting for CDP port ${CDP_PORT}...`);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const result = await checkCDPPort();
      if (result.pass) {
        console.log(`   ✅ CDP ready after ${((i + 1) * 0.5).toFixed(0)}s.`);
        return true;
      }
    } catch {
      // not ready yet
    }
    if (i % 4 === 3) process.stderr.write(".");
  }

  console.log(`\n   ⚠️  CDP not responding after 15s. It may still be starting.`);
  console.log(`   Verify: curl http://localhost:${CDP_PORT}/json/version`);
  return true; // browser was launched at least
}
