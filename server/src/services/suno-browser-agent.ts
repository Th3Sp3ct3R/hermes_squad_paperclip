/**
 * Suno Browser Agent — Raziel's CDP-based browser automation for generating
 * songs via the Suno web UI (no public API available).
 *
 * Adapted from ~/.openclaw/workspace/suno-automation/src/browser-agent.ts
 * with the following changes:
 *   1. Uses Paperclip's pino logger instead of console.log
 *   2. Replaces execSync/curl with native fetch() for CDP HTTP calls
 *   3. Adds a convenience `generateViaSuno()` wrapper for one-call usage
 *
 * Prerequisites:
 *   - Chrome running with --remote-debugging-port=9222 (or CDP_PORT env)
 *   - User already logged into suno.com in that Chrome instance
 *
 * Env vars:
 *   CDP_HOST — default "127.0.0.1"
 *   CDP_PORT — default 9222
 */
import WebSocket from "ws";
import { logger } from "../middleware/logger.js";

const DEFAULT_CDP_HOST = process.env.CDP_HOST || "127.0.0.1";
const DEFAULT_CDP_PORT = Number(process.env.CDP_PORT) || 9222;
const SUNO_CREATE_URL = "https://suno.com/create";

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface CDPConfig {
  host: string;
  port: number;
}

export interface SunoFormData {
  soundPrompt: string;
}

export interface SunoVariant {
  songId: string;
  audioUrl: string;
  title: string;
}

export interface SunoResult {
  /** Primary variant (first one Suno generated). DB writes use these. */
  songId: string;
  audioUrl: string;
  title: string;
  duration: number;
  /** All variants Suno produced for this submission (typically 2). */
  variants: SunoVariant[];
  screenshotPath?: string;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

// ── SunoBrowserAgent ────────────────────────────────────────────────────────

export class SunoBrowserAgent {
  private config: CDPConfig;
  private activeTabId?: string;

  constructor(config?: Partial<CDPConfig>) {
    this.config = {
      host: config?.host ?? DEFAULT_CDP_HOST,
      port: config?.port ?? DEFAULT_CDP_PORT,
    };
  }

  async connect(): Promise<BrowserTab[]> {
    const tabs = await this.listTabs();
    logger.info(`[Raziel] CDP connected. ${tabs.length} tab(s) open.`);
    return tabs;
  }

  async listTabs(): Promise<BrowserTab[]> {
    const res = await this.cdpHttp("GET", "/json/list");
    return (res as Array<{ id: string; url: string; title: string }>).map(
      (t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
      }),
    );
  }

  async navigateToSuno(_tabId?: string): Promise<void> {
    const tabs = await this.listTabs();
    const existing = tabs.find((t) => t.url.includes("suno.com/create"));

    if (existing) {
      this.activeTabId = existing.id;
      logger.info(`[Raziel] Reusing existing Suno create tab: ${existing.id}`);
      return;
    }

    // Open a fresh tab pointing at suno.com/create via CDP HTTP API
    logger.info(`[Raziel] Opening new tab at ${SUNO_CREATE_URL}`);
    const newTab = (await this.cdpHttp(
      "PUT",
      `/json/new?${SUNO_CREATE_URL}`,
    )) as { id?: string; webSocketDebuggerUrl?: string };

    if (!newTab?.id) {
      throw new Error("[Raziel] Failed to open new tab via CDP");
    }

    this.activeTabId = newTab.id;

    // The /json/new?url= sometimes doesn't navigate — use WebSocket to ensure it
    await this.sleep(2000);
    await this.cdpSend(newTab.id, "Page.navigate", { url: SUNO_CREATE_URL });

    // Wait for page load
    await this.sleep(5000);

    // Verify we're on the right page
    const result = await this.cdpSend(newTab.id, "Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    const currentUrl = (result as any)?.result?.value ?? "unknown";
    logger.info(`[Raziel] Tab ${newTab.id} now at: ${currentUrl}`);
  }

  async fillForm(data: SunoFormData): Promise<void> {
    const tab = this.requireTab();

    // Simple-mode: type the sound prompt into the song-description textarea.
    // We deliberately do NOT touch the lyrics field — leaving it blank tells
    // Suno to generate an instrumental (per the field's own placeholder copy).
    const fillScript = `
      (function() {
        const all = Array.from(document.querySelectorAll('textarea'));
        const visible = all.filter(ta => {
          const r = ta.getBoundingClientRect();
          const cs = window.getComputedStyle(ta);
          return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
        });

        // Prefer the description field by placeholder; fall back to the last
        // visible textarea (which is where the description sits in Simple mode).
        const promptEl =
          visible.find(ta => /describe the sound|song description|what kind of song|song about/i.test(ta.placeholder || '')) ||
          visible[visible.length - 1] ||
          all[0];

        if (!promptEl) return { error: "no textarea found on page", textareaCount: all.length };

        // Use the native value setter so React's controlled-component layer picks it up.
        const proto = window.HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        promptEl.focus();
        nativeSetter.call(promptEl, ${JSON.stringify(data.soundPrompt)});
        promptEl.dispatchEvent(new Event('input', { bubbles: true }));
        promptEl.dispatchEvent(new Event('change', { bubbles: true }));

        return {
          success: true,
          promptFilled: promptEl.value.length,
          placeholder: promptEl.placeholder,
          textareaCount: all.length,
          visibleCount: visible.length,
        };
      })()
    `;

    const result = await this.evaluateOnTab(tab, fillScript);
    logger.info({ result }, "[Raziel] Form fill result");

    if (result.error) {
      throw new Error(`[Raziel] Form fill failed: ${result.error}`);
    }
  }

  async clickGenerate(): Promise<void> {
    const tab = this.requireTab();

    const clickScript = `
      (function() {
        const btn = document.querySelector('[data-testid="generate-button"]') ||
                    Array.from(document.querySelectorAll('button')).find(b =>
                      b.textContent.toLowerCase().includes('create') ||
                      b.textContent.toLowerCase().includes('generate')
                    );
        if (!btn) return { error: "generate button not found" };
        btn.click();
        return { success: true, buttonText: btn.textContent.trim() };
      })()
    `;

    const result = await this.evaluateOnTab(tab, clickScript);
    logger.info({ result }, "[Raziel] Generate click result");

    if (result.error) {
      throw new Error(`[Raziel] Generate click failed: ${result.error}`);
    }
  }

  /**
   * Read every song-link ID currently in the DOM. Used to snapshot before
   * clicking Create so we can diff for new submissions afterward.
   */
  async snapshotSongIds(): Promise<Set<string>> {
    const tab = this.requireTab();
    const raw = await this.evaluateOnTab(
      tab,
      `JSON.stringify(Array.from(document.querySelectorAll('a[href*="/song/"]'))
        .map(a => a.href.match(/\\/song\\/([a-zA-Z0-9-]+)/)?.[1])
        .filter(Boolean))`,
    );
    const list = this.unwrapJson<string[]>(raw, []);
    return new Set(list);
  }

  /**
   * Poll the create page for new song-link IDs that weren't present before
   * the Create click. Suno typically shows new entries within 5–10s.
   * Returns as soon as ≥`minNew` new IDs appear (default 2 — Suno's
   * standard variant count).
   */
  async pollForNewSongs(
    beforeIds: Set<string>,
    {
      timeoutMs = 120_000,
      intervalMs = 3_000,
      minNew = 2,
    }: { timeoutMs?: number; intervalMs?: number; minNew?: number } = {},
  ): Promise<SunoVariant[]> {
    const tab = this.requireTab();
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      await this.sleep(intervalMs);

      const raw = await this.evaluateOnTab(
        tab,
        `
          JSON.stringify((function() {
            const seen = new Set();
            const out = [];
            for (const a of document.querySelectorAll('a[href*="/song/"]')) {
              const m = a.href.match(/\\/song\\/([a-zA-Z0-9-]+)/);
              if (!m) continue;
              const id = m[1];
              if (seen.has(id)) continue;
              seen.add(id);
              const row = a.closest('[class*="row"], [class*="card"], [class*="item"], li, tr, article');
              const titleEl = row?.querySelector('[class*="title"], h1, h2, h3, h4');
              out.push({ songId: id, title: (titleEl?.textContent || a.textContent || '').trim().slice(0, 120) });
            }
            return out;
          })())
        `,
      );

      const songs = this.unwrapJson<Array<{ songId: string; title: string }>>(
        raw,
        [],
      );
      const fresh = songs.filter((s) => !beforeIds.has(s.songId));

      logger.info(
        {
          elapsed: `${Math.round((Date.now() - start) / 1000)}s`,
          newSongCount: fresh.length,
        },
        "[Raziel] Poll for new songs",
      );

      if (fresh.length >= minNew) {
        return fresh.map((s) => ({
          songId: s.songId,
          title: s.title,
          audioUrl: `https://cdn1.suno.ai/${s.songId}.mp3`,
        }));
      }
    }

    throw new Error(
      `[Raziel] No new songs detected after ${timeoutMs}ms (expected ≥${minNew})`,
    );
  }

  /**
   * Verify a Suno CDN audio URL is reachable. Suno encodes asynchronously —
   * the song link appears in DOM before the MP3 is fully ready on the CDN,
   * so we retry with backoff.
   */
  async verifyAudioUrl(
    url: string,
    { timeoutMs = 120_000, intervalMs = 5_000 }: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<{ ready: true; sizeBytes: number; contentType: string } | { ready: false; lastStatus: number | string }> {
    const start = Date.now();
    let lastStatus: number | string = "no attempt";
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
        lastStatus = res.status;
        if (res.ok) {
          const ct = res.headers.get("content-type") ?? "";
          if (ct.startsWith("audio/")) {
            return {
              ready: true,
              sizeBytes: Number(res.headers.get("content-length")) || 0,
              contentType: ct,
            };
          }
        }
      } catch (err) {
        lastStatus = err instanceof Error ? err.message : String(err);
      }
      logger.info(
        { url, lastStatus, elapsed: `${Math.round((Date.now() - start) / 1000)}s` },
        "[Raziel] Audio CDN not yet ready, retrying",
      );
      await this.sleep(intervalMs);
    }
    return { ready: false, lastStatus };
  }

  async runFullPipeline(data: SunoFormData): Promise<SunoResult> {
    logger.info("[Raziel] === Starting Suno generation pipeline ===");
    await this.connect();
    await this.navigateToSuno();

    // Snapshot the existing song-link IDs BEFORE clicking Create so we can
    // detect the freshly-generated ones afterward. Suno doesn't put the
    // generated audio onto the /create page — it only inserts new song-row
    // links, and the actual audio is served from cdn1.suno.ai/<id>.mp3.
    await this.fillForm(data);
    const beforeIds = await this.snapshotSongIds();
    logger.info({ existingSongs: beforeIds.size }, "[Raziel] Snapshot before Create click");

    await this.clickGenerate();

    // Wait for Suno to insert the new song-row links into the DOM.
    const variants = await this.pollForNewSongs(beforeIds);
    logger.info(
      { count: variants.length, ids: variants.map((v) => v.songId) },
      "[Raziel] New song variants detected",
    );

    // Verify the CDN URL for the primary variant is actually reachable.
    // Suno encodes asynchronously, so the song-link can appear before the
    // MP3 finishes uploading. We block on the first variant only — once
    // it's ready, the second is virtually always ready too.
    const primary = variants[0];
    const probe = await this.verifyAudioUrl(primary.audioUrl);
    if (!probe.ready) {
      throw new Error(
        `[Raziel] Primary variant CDN URL never became ready: ${primary.audioUrl} (last=${probe.lastStatus})`,
      );
    }
    logger.info(
      { url: primary.audioUrl, sizeBytes: probe.sizeBytes, contentType: probe.contentType },
      "[Raziel] Primary audio CDN ready",
    );

    return {
      songId: primary.songId,
      audioUrl: primary.audioUrl,
      title: primary.title,
      duration: 0,
      variants,
    };
  }

  // ——— CDP primitives ———

  private async cdpHttp(
    method: "GET" | "POST" | "PUT",
    endpoint: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `http://${this.config.host}:${this.config.port}${endpoint}`;
    const opts: RequestInit = {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    };

    const res = await fetch(url, opts);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private async evaluateOnTab(
    tabId: string,
    expression: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.cdpSend(tabId, "Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: false,
    });
    const value = (result as any)?.result?.value;
    if (value && typeof value === "object") return value as Record<string, unknown>;
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch { /* not JSON */ }
    }
    return { value };
  }

  /**
   * Send a CDP command via WebSocket. Opens a short-lived WS connection to the
   * tab's debugger URL, sends the command, waits for the response, then closes.
   */
  private async cdpSend(
    tabId: string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    // Get the WebSocket URL for this tab
    const tabs = (await this.cdpHttp("GET", "/json/list")) as Array<{
      id: string;
      webSocketDebuggerUrl?: string;
    }>;
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab?.webSocketDebuggerUrl) {
      throw new Error(`[Raziel] No WebSocket URL for tab ${tabId}`);
    }

    // WebSocket imported at top of file
    return new Promise((resolve, reject) => {
      const wsUrl = tab.webSocketDebuggerUrl!;
      logger.info(`[Raziel] CDP WS connecting: ${wsUrl.slice(0, 80)}`);
      const ws = new WebSocket(wsUrl);
      const msgId = 1;
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`[Raziel] CDP command ${method} timed out after 30s`));
      }, 30000);

      ws.on("open", () => {
        const payload = JSON.stringify({ id: msgId, method, params });
        logger.info(`[Raziel] CDP sending: ${method}`);
        ws.send(payload);
      });
      ws.on("message", (data) => {
        const raw = typeof data === "string" ? data : data.toString();
        try {
          const msg = JSON.parse(raw);
          if (msg.id === msgId) {
            clearTimeout(timer);
            ws.close();
            if (msg.error) {
              reject(new Error(`[Raziel] CDP error: ${JSON.stringify(msg.error)}`));
            } else {
              resolve(msg.result);
            }
          }
        } catch { /* ignore non-JSON messages */ }
      });
      ws.on("error", (err: Error) => {
        logger.error(`[Raziel] WS error: ${err.message}`);
        clearTimeout(timer);
        reject(new Error(`[Raziel] WebSocket error: ${err.message}`));
      });
    });
  }

  /**
   * evaluateOnTab returns either a parsed object (when the page returns one
   * directly) or `{ value: <stringified-json> }` when the page returns a
   * JSON string. This unwraps both shapes.
   */
  private unwrapJson<T>(raw: Record<string, unknown>, fallback: T): T {
    if (typeof raw.value === "string") {
      try {
        return JSON.parse(raw.value) as T;
      } catch {
        return fallback;
      }
    }
    if (raw && typeof raw === "object" && !("value" in raw)) {
      return raw as unknown as T;
    }
    return fallback;
  }

  private requireTab(): string {
    if (!this.activeTabId) {
      throw new Error(
        "[Raziel] No active tab. Call connect() or navigateToSuno() first.",
      );
    }
    return this.activeTabId;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ── Convenience wrapper ─────────────────────────────────────────────────────

/**
 * One-shot Suno generation via browser automation (Raziel).
 *
 * Creates a SunoBrowserAgent, runs the full pipeline, and returns the result.
 * Handles errors gracefully and logs them via the Paperclip logger.
 */
export async function generateViaSuno(prompt: string): Promise<SunoResult> {
  // Strategy: try CDP browser automation first, fall back to cookie client
  logger.info(
    { promptLength: prompt.length },
    "[Raziel] generateViaSuno — attempting CDP then cookie fallback",
  );

  let cdpError = "";

  // Attempt 1: CDP browser automation
  try {
    const agent = new SunoBrowserAgent();
    const result = await agent.runFullPipeline({ soundPrompt: prompt });
    logger.info(
      { songId: result.songId, audioUrl: result.audioUrl, method: "cdp" },
      "[Raziel] generateViaSuno — CDP succeeded",
    );
    return result;
  } catch (err) {
    cdpError = err instanceof Error ? err.message : String(err);
    logger.warn(
      { error: cdpError },
      "[Raziel] CDP browser automation failed — trying cookie fallback",
    );
  }

  // Attempt 2: Cookie-based HTTP client (no Chrome needed)
  const { generateViaSunoCookie, hasSunoCookie } = await import("./suno-cookie-client.js");

  if (!hasSunoCookie()) {
    throw new Error(
      `[Raziel] CDP failed (${cdpError}) and SUNO_COOKIE is not set. Either launch Chrome with --remote-debugging-port=9222 or set SUNO_COOKIE in .env`,
    );
  }

  logger.info("[Raziel] Falling back to cookie-based Suno client");
  const cookieResult = await generateViaSunoCookie(prompt, {
    makeInstrumental: true,
  });

  return {
    songId: cookieResult.songId,
    audioUrl: cookieResult.audioUrl,
    title: cookieResult.title,
    duration: cookieResult.duration,
    variants: cookieResult.variants,
  };
}

export default SunoBrowserAgent;
