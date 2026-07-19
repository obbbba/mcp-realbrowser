import { chromium, Browser, BrowserContext, Page } from "playwright";

/**
 * Manages a CDP connection to a running Chrome instance.
 *
 * Chrome must be launched with --remote-debugging-port=9222
 * This preserves ALL user state: cookies, localStorage, sessions, extensions.
 */
export class CDPConnection {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private connected = false;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(cdpEndpoint: string): Promise<void> {
    if (this.connected) return;

    try {
      this.browser = await chromium.connectOverCDP(cdpEndpoint);
      const contexts = this.browser.contexts();

      if (contexts.length > 0) {
        this.context = contexts[0];
      } else {
        this.context = await this.browser.newContext();
      }

      const pages = this.context.pages();
      this.page =
        pages.length > 0 ? pages[pages.length - 1] : await this.context.newPage();

      this.connected = true;
      console.error(
        `[realbrowser] ✅ Connected to Chrome at ${cdpEndpoint}`
      );
      console.error(
        `[realbrowser] 📄 Active page: ${this.page.url() || "about:blank"}`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to connect to Chrome at ${cdpEndpoint}. ` +
          `Is Chrome running with --remote-debugging-port? ` +
          `Run: scripts/launch-chrome.bat (Windows) or scripts/launch-chrome.sh (Mac/Linux)\n` +
          `Details: ${msg}`
      );
    }
  }

  async disconnect(): Promise<void> {
    // IMPORTANT: we do NOT close the browser — the user's session stays alive.
    // We only detach our CDP connection.
    if (this.browser) {
      try {
        await this.browser.close(); // playwright's "close" on connectOverCDP = disconnect
      } catch {
        // browser may already be gone
      }
    }
    this.connected = false;
  }

  // ---------------------------------------------------------------------------
  // Page management
  // ---------------------------------------------------------------------------

  private async ensurePage(): Promise<Page> {
    if (!this.context) throw new Error("Not connected to browser");

    // If current page was closed, pick another or create new
    if (this.page && this.page.isClosed()) {
      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[pages.length - 1] : await this.context.newPage();
    }

    if (!this.page) {
      this.page = await this.context.newPage();
    }

    // Bring page to front
    try {
      await this.page.bringToFront();
    } catch {
      // some CDP connections don't support this — ignore
    }

    return this.page;
  }

  // ---------------------------------------------------------------------------
  // Tool: navigate
  // ---------------------------------------------------------------------------

  async navigate(url: string): Promise<{ url: string; title: string }> {
    const page = await this.ensurePage();

    // Auto-prepend https:// if missing
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const title = await page.title();
    return { url: page.url(), title };
  }

  // ---------------------------------------------------------------------------
  // Tool: snapshot — AI's "eyes" via DOM scan
  // ---------------------------------------------------------------------------

  async snapshot(): Promise<string> {
    const page = await this.ensurePage();

    const url = page.url();
    const title = await page.title();

    // Extract all interactive + semantically meaningful elements from the DOM
    const elements = await page.evaluate(() => {
      const results: string[] = [];
      const selectors = [
        "a[href]",
        "button",
        "input:not([type='hidden'])",
        "select",
        "textarea",
        "[role]:not([role='none']):not([role='presentation'])",
        "h1, h2, h3, h4, h5, h6",
        "label",
        "legend",
        "summary",
        "[tabindex]:not([tabindex='-1'])",
        "form",
        "nav",
        "main",
        "header",
        "footer",
        "section[aria-label], section[aria-labelledby]",
        "dialog[open]",
        '[role="dialog"]',
        '[role="alert"]',
        "iframe",
        "video",
        "audio",
      ];

      const seen = new Set<Element>();
      const all = document.querySelectorAll(selectors.join(","));

      for (const el of all) {
        if (seen.has(el)) continue;
        seen.add(el);

        // Skip invisible elements
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          parseFloat(style.opacity) === 0
        ) {
          continue;
        }

        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role") || "";
        const type = el.getAttribute("type") || "";
        const id = el.id ? `#${el.id}` : "";
        const className = el.className && typeof el.className === "string"
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
          : "";

        // Build a meaningful label
        let label = "";
        if (el.getAttribute("aria-label")) {
          label = el.getAttribute("aria-label")!;
        } else if (el.getAttribute("placeholder")) {
          label = el.getAttribute("placeholder")!;
        } else if (el.getAttribute("title")) {
          label = el.getAttribute("title")!;
        } else if (el.getAttribute("alt")) {
          label = el.getAttribute("alt")!;
        } else {
          // Use visible text, truncated
          const text = (el as HTMLElement).innerText?.trim() || el.textContent?.trim() || "";
          label = text.substring(0, 80).replace(/\s+/g, " ");
        }

        // Value for inputs
        let value = "";
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          value = el.value ? ` value="${el.value.substring(0, 50)}"` : "";
        }
        if (el instanceof HTMLSelectElement) {
          value = el.value ? ` value="${el.value}"` : "";
        }

        // Checkbox/radio state
        let checked = "";
        if (el instanceof HTMLInputElement && (type === "checkbox" || type === "radio")) {
          checked = el.checked ? " ☑" : " ☐";
        }

        // Link href
        let href = "";
        if (el instanceof HTMLAnchorElement && el.href) {
          try {
            const u = new URL(el.href);
            href = ` → ${u.pathname}${u.search.substring(0, 30)}`;
          } catch {
            href = ` → ${el.getAttribute("href")?.substring(0, 50)}`;
          }
        }

        // Build selector hint
        const sel = id || className || tag;
        const roleStr = role ? `[${role}]` : `[${tag}${type ? `|${type}` : ""}]`;
        const labelStr = label ? ` "${label}"` : "";
        const hrefStr = href;

        // Off-screen marker
        const offScreen = rect.bottom < 0 || rect.top > window.innerHeight ? " 📜" : "";

        results.push(`${roleStr}${sel}${labelStr}${value}${checked}${hrefStr}${offScreen}`);
      }

      return results.slice(0, 250); // reasonable limit for context window
    });

    const lines: string[] = [
      `URL: ${url}`,
      `Title: ${title}`,
      `Elements: ${elements.length}`,
      `─`.repeat(60),
      ...elements,
    ];

    if (elements.length >= 250) {
      lines.push("... (truncated — scroll or narrow your request for more)");
    }

    return lines.join("\n");
  }

  // ---------------------------------------------------------------------------
  // Tool: click — multi-strategy
  // ---------------------------------------------------------------------------

  async click(target: string): Promise<string> {
    const page = await this.ensurePage();
    const strategies: Array<{ name: string; fn: () => Promise<void> }> = [
      {
        name: "CSS selector",
        fn: async () => {
          await page.click(target, { timeout: 5000 });
        },
      },
      {
        name: "text match",
        fn: async () => {
          await page.getByText(target, { exact: false }).first().click({ timeout: 3000 });
        },
      },
      {
        name: "button role",
        fn: async () => {
          await page.getByRole("button", { name: target }).click({ timeout: 3000 });
        },
      },
      {
        name: "link role",
        fn: async () => {
          await page.getByRole("link", { name: target }).click({ timeout: 3000 });
        },
      },
      {
        name: "placeholder",
        fn: async () => {
          await page.getByPlaceholder(target).click({ timeout: 3000 });
        },
      },
      {
        name: "label",
        fn: async () => {
          await page.getByLabel(target).click({ timeout: 3000 });
        },
      },
    ];

    for (const strategy of strategies) {
      try {
        await strategy.fn();
        // Small wait for any UI reaction
        await page.waitForTimeout(300);
        return `${strategy.name}: "${target}"`;
      } catch {
        continue;
      }
    }

    throw new Error(
      `Could not click "${target}". Tried: CSS selector, text match, button, link, placeholder, label. ` +
        `Try running 'snapshot' first to see what elements are on the page.`
    );
  }

  // ---------------------------------------------------------------------------
  // Tool: type
  // ---------------------------------------------------------------------------

  async type(text: string): Promise<string> {
    const page = await this.ensurePage();
    await page.keyboard.type(text, { delay: 30 });
    return text;
  }

  // ---------------------------------------------------------------------------
  // Tool: press_key
  // ---------------------------------------------------------------------------

  async pressKey(key: string): Promise<string> {
    const page = await this.ensurePage();
    await page.keyboard.press(key);
    return key;
  }

  // ---------------------------------------------------------------------------
  // Tool: screenshot
  // ---------------------------------------------------------------------------

  async screenshot(): Promise<{ data: string; mimeType: string }> {
    const page = await this.ensurePage();
    const buffer = await page.screenshot({
      type: "png",
      fullPage: false,
    });
    return {
      data: buffer.toString("base64"),
      mimeType: "image/png",
    };
  }

  // ---------------------------------------------------------------------------
  // Tool: extract
  // ---------------------------------------------------------------------------

  async extract(): Promise<string> {
    const page = await this.ensurePage();
    const text = await page.evaluate(() => {
      const body = document.body;
      if (!body) return "";
      // Prefer innerText (human-visible text only, respects CSS display)
      return body.innerText;
    });

    const truncated = text.substring(0, 15000);
    if (text.length > 15000) {
      return truncated + `\n\n... (truncated, ${text.length} chars total)`;
    }
    return truncated;
  }

  // ---------------------------------------------------------------------------
  // Tool: scroll
  // ---------------------------------------------------------------------------

  async scroll(direction: "up" | "down", amount?: number): Promise<string> {
    const page = await this.ensurePage();
    const delta = amount || (direction === "down" ? 600 : -600);
    await page.evaluate((d) => {
      window.scrollBy({ top: d, behavior: "smooth" });
    }, delta);

    const scrollY = await page.evaluate(() => window.scrollY);
    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    return `Scrolled ${direction}. Position: ${Math.round(scrollY)}px / ${totalHeight}px`;
  }

  // ---------------------------------------------------------------------------
  // Tool: go_back
  // ---------------------------------------------------------------------------

  async goBack(): Promise<string> {
    const page = await this.ensurePage();
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 });
    return `Back to: ${page.url()}`;
  }

  // ---------------------------------------------------------------------------
  // Tool: go_forward
  // ---------------------------------------------------------------------------

  async goForward(): Promise<string> {
    const page = await this.ensurePage();
    await page.goForward({ waitUntil: "domcontentloaded", timeout: 15000 });
    return `Forward to: ${page.url()}`;
  }

  // ---------------------------------------------------------------------------
  // Tool: reload
  // ---------------------------------------------------------------------------

  async reload(): Promise<string> {
    const page = await this.ensurePage();
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    return `Reloaded: ${page.url()}`;
  }

  // ---------------------------------------------------------------------------
  // Tool: hover
  // ---------------------------------------------------------------------------

  async hover(target: string): Promise<string> {
    const page = await this.ensurePage();

    const strategies: Array<{ name: string; fn: () => Promise<void> }> = [
      {
        name: "CSS selector",
        fn: async () => {
          await page.hover(target, { timeout: 5000 });
        },
      },
      {
        name: "text match",
        fn: async () => {
          await page.getByText(target, { exact: false }).first().hover({ timeout: 3000 });
        },
      },
      {
        name: "role",
        fn: async () => {
          await page.getByRole("button", { name: target }).hover({ timeout: 3000 });
        },
      },
    ];

    for (const strategy of strategies) {
      try {
        await strategy.fn();
        await page.waitForTimeout(200);
        return `${strategy.name}: "${target}"`;
      } catch {
        continue;
      }
    }

    throw new Error(`Could not hover "${target}". Try 'snapshot' first.`);
  }

  // ---------------------------------------------------------------------------
  // Tool: wait_for_text
  // ---------------------------------------------------------------------------

  async waitForText(text: string, timeoutMs: number = 10000): Promise<string> {
    const page = await this.ensurePage();
    const start = Date.now();

    try {
      await page.waitForFunction(
        (t) => document.body?.innerText?.includes(t),
        text,
        { timeout: timeoutMs, polling: 500 }
      );
      const elapsed = Date.now() - start;
      return `Text "${text}" appeared after ${elapsed}ms`;
    } catch {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for text: "${text}". ` +
          `Current page: ${page.url()}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Tool: fill_form (batch fill multiple fields)
  // ---------------------------------------------------------------------------

  async fillField(placeholder: string, value: string): Promise<string> {
    const page = await this.ensurePage();

    // Try placeholder match first, then label match
    try {
      const input = page.getByPlaceholder(placeholder);
      await input.fill(value);
      return `Filled "${placeholder}" = "${value}"`;
    } catch {
      try {
        const input = page.getByLabel(placeholder);
        await input.fill(value);
        return `Filled "${placeholder}" = "${value}"`;
      } catch {
        throw new Error(
          `Could not find input field matching "${placeholder}". ` +
            `Try 'snapshot' to see available fields.`
        );
      }
    }
  }
}
