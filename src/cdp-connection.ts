import { chromium, Browser, BrowserContext, Page } from "playwright";

/**
 * CDP connection to a running Chrome/Edge/Brave browser instance.
 *
 * Chrome must be launched with --remote-debugging-port=9222.
 * All user state preserved: cookies, localStorage, sessions, extensions.
 */
export class CDPConnection {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private connected = false;
  private cdpEndpoint: string | null = null;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(cdpEndpoint: string): Promise<void> {
    if (this.connected) return;
    this.cdpEndpoint = cdpEndpoint;

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
        `[realbrowser] ✅ Connected (${pages.length} tab(s), active: ${this.page.url() || "about:blank"})`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to connect to Chrome at ${cdpEndpoint}. ` +
          `Is Chrome running with --remote-debugging-port? Details: ${msg}`
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
    this.browser = null;
    this.context = null;
    this.page = null;
    this.connected = false;
  }

  /** Returns the stored CDP endpoint, or null if never connected. */
  getEndpoint(): string | null {
    return this.cdpEndpoint;
  }

  // ---------------------------------------------------------------------------
  // Tool: reconnect — re-attach after browser restart
  // ---------------------------------------------------------------------------

  async reconnect(cdpEndpoint?: string): Promise<string> {
    const endpoint = cdpEndpoint || this.cdpEndpoint;
    if (!endpoint) {
      throw new Error("No CDP endpoint available. Navigate first or call connect().");
    }

    // Force-detach from any stale connection, then re-connect
    await this.disconnect();
    this.cdpEndpoint = endpoint;
    await this.connect(endpoint);
    const p = this.page; // may be set by connect()
    return `Reconnected to ${endpoint}.${p ? ` Active: ${p.url()}` : ""}`;
  }

  // ---------------------------------------------------------------------------
  // Page management
  // ---------------------------------------------------------------------------

  private async ensurePage(): Promise<Page> {
    if (!this.context) throw new Error("Not connected to browser. Use reconnect if browser was restarted.");

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

  /**
   * Find a page by flat index across all contexts.
   * Returns {page, context} or throws if index is out of range.
   */
  private async getPageByIndex(index: number): Promise<{ page: Page; context: BrowserContext }> {
    if (!this.browser) throw new Error("Not connected to browser.");

    const contexts = this.browser.contexts();
    let offset = 0;
    for (const ctx of contexts) {
      const pages = ctx.pages();
      if (index >= offset && index < offset + pages.length) {
        return { page: pages[index - offset], context: ctx };
      }
      offset += pages.length;
    }

    const total = offset;
    throw new Error(
      `Tab index ${index} out of range (${total} tab(s) total, valid: 0–${total - 1}). ` +
        `Use list_tabs to see available tabs.`
    );
  }

  // ---------------------------------------------------------------------------
  // Tool: list_tabs
  // ---------------------------------------------------------------------------

  async listTabs(): Promise<{ index: number; url: string; title: string }[]> {
    if (!this.browser) throw new Error("Not connected to browser.");

    const result: { index: number; url: string; title: string }[] = [];
    let idx = 0;
    for (const ctx of this.browser.contexts()) {
      for (const p of ctx.pages()) {
        try {
          result.push({
            index: idx,
            url: p.url() || "about:blank",
            title: (await p.title()) || "(untitled)",
          });
        } catch {
          result.push({ index: idx, url: "about:blank", title: "(unavailable)" });
        }
        idx++;
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Tool: select_tab
  // ---------------------------------------------------------------------------

  async selectTab(index: number): Promise<string> {
    const { page, context } = await this.getPageByIndex(index);
    this.page = page;
    this.context = context;
    await page.bringToFront();
    return `Switched to tab ${index}: "${await page.title()}" (${page.url()})`;
  }

  // ---------------------------------------------------------------------------
  // Tool: new_tab
  // ---------------------------------------------------------------------------

  async newTab(url?: string): Promise<string> {
    if (!this.context) throw new Error("Not connected to browser.");

    const newPage = await this.context.newPage();
    this.page = newPage;

    if (url) {
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      await newPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    return `New tab opened: ${newPage.url()}`;
  }

  // ---------------------------------------------------------------------------
  // Tool: close_tab
  // ---------------------------------------------------------------------------

  async closeTab(index: number): Promise<string> {
    const { page } = await this.getPageByIndex(index);

    // Count total pages — don't close the last tab
    let total = 0;
    if (this.browser) {
      for (const ctx of this.browser.contexts()) {
        total += ctx.pages().length;
      }
    }

    const title = await page.title().catch(() => "unknown");
    const url = page.url();

    if (total <= 1) {
      // Last tab: open a blank one first so browser doesn't close
      if (this.context) {
        const blank = await this.context.newPage();
        this.page = blank;
      }
    }

    await page.close();

    // If we closed the current page, switch to another
    if (this.context) {
      const remaining = this.context.pages();
      this.page = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }

    return `Closed tab ${index}: "${title}" (${url})`;
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

  async snapshot(query?: string): Promise<string> {
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

      return results;
    });

    // Apply query filter if provided (server-side)
    let filtered = elements;
    if (query) {
      const q = query.toLowerCase();
      filtered = elements.filter((e) => e.toLowerCase().includes(q));
    }

    const limited = filtered.slice(0, 250);

    const lines: string[] = [
      `URL: ${url}`,
      `Title: ${title}`,
      `Elements: ${limited.length}${query ? ` (filtered by "${query}")` : ""}`,
      `─`.repeat(60),
      ...limited,
    ];

    if (filtered.length > 250) {
      lines.push(`... (${filtered.length - 250} more elements — narrow your search or use query parameter)`);
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
        await page.waitForTimeout(300);
        return `${strategy.name}: "${target}"`;
      } catch {
        continue;
      }
    }

    throw new Error(
      `Could not click "${target}". Run 'snapshot' first to see available elements.`
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

  async screenshot(options?: {
    format?: "png" | "jpeg";
    quality?: number;
  }): Promise<{ data: string; mimeType: string }> {
    const page = await this.ensurePage();
    const format = options?.format || "png";
    const quality = format === "jpeg" ? (options?.quality ?? 80) : undefined;

    const buffer = await page.screenshot({
      type: format,
      fullPage: false,
      ...(quality !== undefined ? { quality } : {}),
    });

    return {
      data: buffer.toString("base64"),
      mimeType: `image/${format}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Tool: extract
  // ---------------------------------------------------------------------------

  async extract(maxChars: number = 3000): Promise<string> {
    const page = await this.ensurePage();
    const text = await page.evaluate(() => {
      const body = document.body;
      if (!body) return "";
      return body.innerText;
    });

    const limit = Math.min(maxChars, 30000); // hard cap at 30K
    const truncated = text.substring(0, limit);
    if (text.length > limit) {
      return truncated + `\n\n... (truncated at ${limit}, ${text.length} chars total. Increase maxChars for more.)`;
    }
    return truncated;
  }

  // ---------------------------------------------------------------------------
  // Tool: scroll
  // ---------------------------------------------------------------------------

  async scroll(direction: "up" | "down", amount?: number): Promise<string> {
    const page = await this.ensurePage();
    const delta = direction === "down"
      ? (amount || 600)
      : -(amount || 600);
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
          const loc = page.locator(target);
          const count = await loc.count();
          if (count === 0) throw new Error("no match");
          await loc.first().hover({ timeout: 5000 });
        },
      },
      {
        name: "text match",
        fn: async () => {
          await page.getByText(target, { exact: false }).first().hover({ timeout: 3000 });
        },
      },
      {
        name: "button role",
        fn: async () => {
          await page.getByRole("button", { name: target }).hover({ timeout: 3000 });
        },
      },
      {
        name: "link role",
        fn: async () => {
          await page.getByRole("link", { name: target }).hover({ timeout: 3000 });
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

    const currentUrl = page.url();
    throw new Error(
      `Could not hover "${target}". ` +
        (currentUrl.startsWith("chrome://")
          ? `Current page is a protected Chrome page — navigate to a website first.`
          : `Try 'snapshot' to see available elements.`)
    );
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
        `Timed out after ${timeoutMs}ms waiting for text: "${text}". Current page: ${page.url()}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Tool: fill
  // ---------------------------------------------------------------------------

  async fillField(placeholder: string, value: string): Promise<string> {
    const page = await this.ensurePage();

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
          `Could not find input field matching "${placeholder}". Try 'snapshot' to see available fields.`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Tool: select_option
  // ---------------------------------------------------------------------------

  async selectOption(target: string, value: string): Promise<string> {
    const page = await this.ensurePage();

    const strategies: Array<{ name: string; fn: () => Promise<void> }> = [
      {
        name: "placeholder",
        fn: async () => {
          await page.getByPlaceholder(target).selectOption({ label: value });
        },
      },
      {
        name: "label",
        fn: async () => {
          await page.getByLabel(target).selectOption({ label: value });
        },
      },
      {
        name: "CSS selector",
        fn: async () => {
          // Try select by value first, then by label
          const select = page.locator(target);
          const count = await select.count();
          if (count === 0) throw new Error("no match");
          try {
            await select.selectOption(value);
          } catch {
            await select.selectOption({ label: value });
          }
        },
      },
    ];

    for (const strategy of strategies) {
      try {
        await strategy.fn();
        await page.waitForTimeout(200);
        return `${strategy.name}: "${target}" → "${value}"`;
      } catch {
        continue;
      }
    }

    throw new Error(
      `Could not select "${value}" in "${target}". Try 'snapshot' to see <select> fields on the page.`
    );
  }
}
