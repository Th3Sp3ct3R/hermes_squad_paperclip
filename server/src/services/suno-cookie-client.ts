/**
 * Suno Cookie Client — HTTP-based Suno music generation using session cookies.
 *
 * Fallback for when CDP browser automation isn't available (Chrome not running).
 * Uses Suno's internal API directly with session cookies from a logged-in account.
 *
 * Env:
 *   SUNO_COOKIE — full cookie string from suno.com (get from browser DevTools)
 *   SUNO_API_BASE — defaults to https://studio-api.suno.ai
 *
 * Cookie acquisition:
 *   1. Open suno.com/create in Chrome
 *   2. Open DevTools → Network tab
 *   3. Refresh the page
 *   4. Find any request to studio-api.suno.ai
 *   5. Copy the full Cookie header value
 *   6. Set SUNO_COOKIE=<value> in .env
 *
 * Cookies expire periodically — refresh when generation starts failing with 401.
 */

import { logger } from "../middleware/logger.js";

const SUNO_API_BASE = process.env.SUNO_API_BASE ?? "https://studio-api.suno.ai";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SunoCookieResult {
  songId: string;
  audioUrl: string;
  title: string;
  duration: number;
  imageUrl: string | null;
  status: string;
  variants: Array<{ songId: string; audioUrl: string; title: string }>;
}

interface SunoClip {
  id: string;
  title: string;
  audio_url: string;
  image_url: string | null;
  image_large_url: string | null;
  status: string;
  duration: number | null;
  metadata?: {
    duration?: number;
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getCookie(): string {
  const cookie = process.env.SUNO_COOKIE;
  if (!cookie) {
    throw new Error(
      "[suno-cookie] SUNO_COOKIE is not set. Log into suno.com, copy the Cookie header from DevTools, and set it in .env",
    );
  }
  return cookie;
}

function headers(): Record<string, string> {
  return {
    Cookie: getCookie(),
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Origin: "https://suno.com",
    Referer: "https://suno.com/create",
  };
}

async function sunoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${SUNO_API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string> ?? {}) },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => `${res.status}`);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `[suno-cookie] Auth failed (${res.status}). Cookie expired — refresh SUNO_COOKIE in .env. Response: ${body.slice(0, 200)}`,
      );
    }
    throw new Error(`[suno-cookie] API error (${res.status}): ${body.slice(0, 400)}`);
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────
// Core API
// ─────────────────────────────────────────────────────────────

/**
 * Generate a song via Suno's internal API using session cookies.
 * Submits the prompt, polls for completion, returns the audio URL.
 */
export async function generateViaSunoCookie(
  prompt: string,
  opts: {
    makeInstrumental?: boolean;
    /** Poll interval in ms. Default 5000. */
    pollInterval?: number;
    /** Max wait in ms. Default 5 minutes. */
    timeout?: number;
  } = {},
): Promise<SunoCookieResult> {
  const startedAt = Date.now();
  const pollInterval = opts.pollInterval ?? 5_000;
  const timeout = opts.timeout ?? 5 * 60 * 1000;

  // Step 1: Submit generation request
  logger.info({ promptLength: prompt.length }, "[suno-cookie] Submitting generation");

  const submitResult = await sunoFetch<{
    clips?: Array<{ id: string }>;
    id?: string;
    status?: string;
  }>("/api/generate/v2/", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      make_instrumental: opts.makeInstrumental ?? true,
      mv: "chirp-v4",
      gpt_description_prompt: prompt,
    }),
  });

  // Extract clip IDs from the response
  const clipIds: string[] = [];
  if (submitResult.clips && Array.isArray(submitResult.clips)) {
    for (const clip of submitResult.clips) {
      if (clip.id) clipIds.push(clip.id);
    }
  }

  if (clipIds.length === 0) {
    throw new Error(
      `[suno-cookie] No clip IDs returned from generate. Response: ${JSON.stringify(submitResult).slice(0, 300)}`,
    );
  }

  logger.info({ clipIds }, "[suno-cookie] Generation submitted, polling for results");

  // Step 2: Poll for completion
  const idsParam = clipIds.join(",");
  let clips: SunoClip[] = [];

  while (Date.now() - startedAt < timeout) {
    await new Promise((r) => setTimeout(r, pollInterval));

    try {
      const feedResult = await sunoFetch<SunoClip[] | { clips?: SunoClip[] }>(
        `/api/feed/?ids=${encodeURIComponent(idsParam)}`,
      );

      // Normalize response shape
      if (Array.isArray(feedResult)) {
        clips = feedResult;
      } else if (feedResult.clips) {
        clips = feedResult.clips;
      }

      const ready = clips.filter(
        (c) => c.audio_url && (c.status === "streaming" || c.status === "complete"),
      );

      logger.info(
        {
          elapsed: `${Math.round((Date.now() - startedAt) / 1000)}s`,
          ready: ready.length,
          total: clips.length,
          statuses: clips.map((c) => c.status),
        },
        "[suno-cookie] Polling feed",
      );

      if (ready.length > 0) {
        const primary = ready[0]!;
        const variants = ready.map((c) => ({
          songId: c.id,
          audioUrl: c.audio_url,
          title: c.title ?? "",
        }));

        return {
          songId: primary.id,
          audioUrl: primary.audio_url,
          title: primary.title ?? "",
          duration: primary.duration ?? primary.metadata?.duration ?? 0,
          imageUrl: primary.image_large_url ?? primary.image_url ?? null,
          status: primary.status,
          variants,
        };
      }
    } catch (err) {
      // Log but keep polling — transient errors are common
      logger.warn({ err }, "[suno-cookie] Feed poll error (retrying)");
    }
  }

  throw new Error(
    `[suno-cookie] Generation timed out after ${timeout / 1000}s. Last statuses: ${clips.map((c) => c.status).join(", ")}`,
  );
}

/**
 * Check if the Suno cookie is valid by hitting the account endpoint.
 */
export async function checkSunoCookieHealth(): Promise<{
  valid: boolean;
  creditsLeft?: number;
  error?: string;
}> {
  try {
    const result = await sunoFetch<{
      credits_left?: number;
      monthly_limit?: number;
      monthly_usage?: number;
    }>("/api/billing/info/");

    return {
      valid: true,
      creditsLeft: result.credits_left,
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if SUNO_COOKIE is configured.
 */
export function hasSunoCookie(): boolean {
  return !!process.env.SUNO_COOKIE;
}
