/**
 * Doctor — diagnostic mode for MCP-RealBrowser.
 *
 * Checks: Chrome installed? Running? CDP port open? Process conflicts?
 * Run: npx tsx src/index.ts --doctor
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

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
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
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
      cmd = 'tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV 2>NUL';
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
  const http = require("http");

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
            `1. Make sure Chrome is running with --remote-debugging-port=${CDP_PORT}`,
            `2. If Chrome IS running, kill ALL Chrome processes first, then re-launch:`,
            `   - Windows: taskkill /F /IM chrome.exe`,
            `   - Mac:     pkill -f "Google Chrome"`,
            `3. Then run: scripts/launch-chrome.bat (or .sh)`,
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
    // Check if we can resolve the MCP SDK
    require.resolve("@modelcontextprotocol/sdk");
    require.resolve("playwright");
    require.resolve("zod");

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
        'wmic process where "name=\'chrome.exe\'" get commandline /VALUE 2>NUL';
    } else {
      cmd = 'ps aux | grep -i "[c]hrome" 2>/dev/null';
    }

    const output = execSync(cmd, { encoding: "utf-8", timeout: 5000 });

    if (output.includes("--remote-debugging-port")) {
      const port = output.match(/--remote-debugging-port[= ](\d+)/)?.[1] || "unknown";
      return {
        label: "Chrome debug flag",
        pass: port === String(CDP_PORT),
        detail:
          port === String(CDP_PORT)
            ? `Chrome running with --remote-debugging-port=${CDP_PORT} ✅`
            : `Chrome has debugging port but on ${port}, not ${CDP_PORT}`,
        fix:
          port !== String(CDP_PORT)
            ? `Re-launch Chrome with --remote-debugging-port=${CDP_PORT} instead of ${port}`
            : undefined,
      };
    }

    return {
      label: "Chrome debug flag",
      pass: false,
      detail: "Chrome is running but WITHOUT --remote-debugging-port flag.",
      fix: [
        "This is the #1 issue! Chrome must be launched with the debugging flag.",
        `1. Close ALL Chrome windows completely (check system tray too)`,
        `2. Run: scripts/launch-chrome.bat (Windows) or scripts/launch-chrome.sh`,
        `3. Or manually: chrome --remote-debugging-port=${CDP_PORT}`,
      ].join("\n"),
    };
  } catch {
    return {
      label: "Chrome debug flag",
      pass: false,
      detail: "Could not check Chrome command-line flags.",
      fix: "Make sure Chrome is launched with --remote-debugging-port=9222",
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runDoctor(): Promise<boolean> {
  console.log("🩺 MCP-RealBrowser Doctor\n");
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

  for (const check of checks) {
    const icon = check.pass ? "✅" : "❌";
    console.log(`\n${icon}  ${check.label}`);
    console.log(`    ${check.detail.replace(/\n/g, "\n    ")}`);
    if (check.fix && !check.pass) {
      console.log(`\n   🔧 Fix:\n    ${check.fix.replace(/\n/g, "\n    ")}`);
    }
    if (check.pass) passCount++;
  }

  console.log("\n" + "─".repeat(55));
  console.log(`\n📊 ${passCount}/${checks.length} checks passed.`);

  const allPass = passCount === checks.length;
  if (allPass) {
    console.log("\n✨ All checks passed! Ready to start MCP-RealBrowser.\n");
  } else {
    console.log(
      "\n⚠️  Some checks failed. Fix the issues above, then re-run --doctor.\n"
    );
  }

  return allPass;
}
