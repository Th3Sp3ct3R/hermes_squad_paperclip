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
import fs from "node:fs";
import WebSocket from "ws";
import path from "node:path";
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
  lyrics: string;
}

export interface SunoResult {
  songId: string;
  audioUrl: string;
  title: string;
  duration: number;
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

    const promptSelector = `[data-testid="prompt-input"], textarea[placeholder*="prompt" i], textarea[placeholder*="style" i], input[placeholder*="prompt" i]`;
    const lyricsSelector = `[data-testid="lyrics-input"], textarea[placeholder*="lyrics" i], textarea[placeholder*="custom" i]`;

    const fillScript = `
      (function() {
        const promptEl = document.querySelector('${promptSelector}') || document.querySelector('textarea');
        const lyricsEl = document.querySelectorAll('${lyricsSelector}')[1] || document.querySelectorAll('textarea')[1];

        if (!promptEl) return { error: "prompt field not found", selectors: "${promptSelector}" };
        if (!lyricsEl) return { error: "lyrics field not found", selectors: "${lyricsSelector}" };

        promptEl.value = ${JSON.stringify(data.soundPrompt)};
        promptEl.dispatchEvent(new Event('input', { bubbles: true }));
        promptEl.dispatchEvent(new Event('change', { bubbles: true }));

        lyricsEl.value = ${JSON.stringify(data.lyrics)};
        lyricsEl.dispatchEvent(new Event('input', { bubbles: true }));
        lyricsEl.dispatchEvent(new Event('change', { bubbles: true }));

        return { success: true, promptFilled: promptEl.value.length, lyricsFilled: lyricsEl.value.length };
      })()
    `;

    const result = await this.evaluateOnTab(tab, fillScript);
    logger.info({ result }, "[Raziel] Form fill result");

    if (result.error) {
      throw new Error(
        `[Raziel] Form fill failed: ${result.error}. Selectors tried: ${result.selectors}`,
      );
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

  async pollForCompletion(
    timeoutMs: number = 120000,
  ): Promise<{ completed: boolean; audioSrc: string; screenshotPath?: string }> {
    const tab = this.requireTab();
    const start = Date.now();
    const interval = 10000;
    const screenshotDir = path.join(process.cwd(), "tmp", "suno-polls");
    fs.mkdirSync(screenshotDir, { recursive: true });

    let lastScreenshot = "";

    while (Date.now() - start < timeoutMs) {
      await this.sleep(interval);

      const timestamp = Date.now();
      const screenshotPath = path.join(screenshotDir, `poll-${timestamp}.png`);
      lastScreenshot = screenshotPath;

      try {
        await this.screenshotTab(tab, screenshotPath);
      } catch (_e) {
        // screenshot may fail during navigation, continue polling
      }

      const checkScript = `
        (function() {
          const audio = document.querySelector('audio');
          const hasAudio = !!audio && audio.src && audio.src.length > 0;

          const title = document.title;
          const url = window.location.href;

          const successMarkers = document.querySelectorAll('[data-testid="success"], .success, .completed');
          const hasSuccess = successMarkers.length > 0;

          const errorMarkers = document.querySelectorAll('[data-testid="error"], .error');
          const hasError = errorMarkers.length > 0;

          return { hasAudio, audioSrc: audio?.src || null, title, url, hasSuccess, hasError };
        })()
      `;

      const status = await this.evaluateOnTab(tab, checkScript);
      logger.info(
        {
          elapsed: Math.round((Date.now() - start) / 1000) + "s",
          hasAudio: status.hasAudio,
          hasSuccess: status.hasSuccess,
          hasError: status.hasError,
          title: status.title,
        },
        "[Raziel] Poll status",
      );

      if (status.hasError) {
        throw new Error("[Raziel] Suno generation error detected on page");
      }

      if (status.hasAudio && status.audioSrc) {
        logger.info("[Raziel] Audio detected! Completing.");
        return {
          completed: true,
          audioSrc: status.audioSrc as string,
          screenshotPath: lastScreenshot,
        };
      }
    }

    throw new Error(`[Raziel] Generation timed out after ${timeoutMs}ms`);
  }

  async extractResult(): Promise<SunoResult> {
    const tab = this.requireTab();

    const extractScript = `
      (function() {
        const audio = document.querySelector('audio');
        const audioUrl = audio?.src || null;

        const url = window.location.href;
        const songId = url.match(/song\\/([a-zA-Z0-9-_]+)/)?.[1] ||
                       url.match(/([a-zA-Z0-9]{8,})/)?.[0] ||
                       null;

        const title = document.title;

        const durationEl = document.querySelector('[data-testid="duration"]') ||
                           document.querySelector('.duration');
        const durationText = durationEl?.textContent || "";
        const durationMatch = durationText.match(/(\\d+):(\\d+)/);
        const duration = durationMatch ? parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]) : 0;

        return { audioUrl, songId, title, duration, url };
      })()
    `;

    const raw = await this.evaluateOnTab(tab, extractScript);
    logger.info({ raw }, "[Raziel] Extraction result");

    if (!raw.audioUrl || !raw.songId) {
      throw new Error(
        `[Raziel] Failed to extract song result. audioUrl=${raw.audioUrl}, songId=${raw.songId}`,
      );
    }

    return {
      songId: raw.songId as string,
      audioUrl: raw.audioUrl as string,
      title: (raw.title as string) ?? "",
      duration: (raw.duration as number) ?? 0,
    };
  }

  async runFullPipeline(data: SunoFormData): Promise<SunoResult> {
    logger.info("[Raziel] === Starting Suno generation pipeline ===");
    await this.connect();
    await this.navigateToSuno();
    await this.fillForm(data);
    await this.clickGenerate();
    const pollResult = await this.pollForCompletion();
    const result = await this.extractResult();
    return { ...result, screenshotPath: pollResult.screenshotPath };
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

  private async screenshotTab(
    tabId: string,
    outputPath: string,
  ): Promise<void> {
    const screenshotUrl = `http://${this.config.host}:${this.config.port}/json/screenshot/${tabId}`;
    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });

    const res = await fetch(screenshotUrl, {
      signal: AbortSignal.timeout(15000),
    });
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
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
export async function generateViaSuno(
  prompt: string,
  lyrics: string,
): Promise<SunoResult> {
  logger.info(
    { promptLength: prompt.length, lyricsLength: lyrics.length },
    "[Raziel] generateViaSuno — starting browser automation",
  );

  const agent = new SunoBrowserAgent();
  try {
    const result = await agent.runFullPipeline({
      soundPrompt: prompt,
      lyrics,
    });
    logger.info(
      {
        songId: result.songId,
        audioUrl: result.audioUrl,
        duration: result.duration,
      },
      "[Raziel] generateViaSuno — completed successfully",
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, "[Raziel] generateViaSuno — pipeline failed");
    throw err;
  }
}

export default SunoBrowserAgent;
