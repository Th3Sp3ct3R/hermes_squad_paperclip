/**
 * Suno Clerk Client — live Suno.com access using the SAME auth the
 * suno-engagement bot uses (proven working as of 2026-06-24).
 *
 * Unlike the legacy `suno-cookie-client.ts` (which targets the dead
 * `studio-api.suno.ai` with a static cookie), this client:
 *   1. Mints a fresh short-lived Clerk JWT from the long-lived `__client`
 *      refresh cookie  (POST auth.suno.com/v1/client/sessions/{SID}/tokens)
 *   2. Calls the CURRENT API base `studio-api-prod.suno.com` with
 *      `Authorization: Bearer <jwt>`
 *
 * Source of truth for the `__client` cookie is the engagement bot's persist
 * file, so a single re-login rotates the token for both systems. Everything is
 * env-overridable.
 *
 * IMPORTANT — generation reality (see songwriting-and-ai-music/suno-tool-status.md):
 * Suno's song-CREATE endpoint is gated by Cloudflare Turnstile and changes
 * often; there is no reliably-working HTTP generate endpoint. So
 * `generateViaSunoClerk()` ATTEMPTS submission and throws cleanly on failure —
 * callers (suno-browser-agent.ts) then fall back to CDP browser automation,
 * which drives the real Suno web UI and IS the dependable "create a song
 * through your account" path. The endpoints this client is verified-good for
 * are session/billing/projects/clip-fetch — used for health + result polling.
 */

import { readFileSync } from "node:fs";
import { logger } from "../middleware/logger.js";

const API_BASE = process.env.SUNO_API_BASE ?? "https://studio-api-prod.suno.com";
const SESSION_ID = process.env.SUNO_SESSION_ID ?? "session_2dfb16212bb421b53333d4";
const CLIENT_UAT = process.env.SUNO_CLIENT_UAT ?? "1779007810";
const PERSIST_PATH =
  process.env.SUNO_SESSION_PERSIST ??
  "/Users/growthgod/.hermes/skills/devops/suno-browser-automation/references/suno-session-persist.json";

const AUTH_URL = `https://auth.suno.com/v1/client/sessions/${SESSION_ID}/tokens?__clerk_api_version=2025-04-10&_clerk_js_version=5`;

// ── JWT cache (Clerk access tokens live ~60s) ──────────────────────────────
let cachedJwt: { token: string; expiresAt: number } | null = null;

function readClientCookie(): string {
  if (process.env.SUNO_CLIENT_COOKIE) return process.env.SUNO_CLIENT_COOKIE;
  try {
    const data = JSON.parse(readFileSync(PERSIST_PATH, "utf8")) as Record<string, unknown>;
    const client = data.__client;
    if (typeof client === "string" && client.length > 0) return client;
  } catch (err) {
    throw new Error(
      `[suno-clerk] Could not read __client cookie from ${PERSIST_PATH} (${err instanceof Error ? err.message : String(err)}). ` +
        `Set SUNO_CLIENT_COOKIE env, or re-login the Suno session.`,
    );
  }
  throw new Error("[suno-clerk] __client cookie not found — set SUNO_CLIENT_COOKIE or refresh the persist file.");
}

/** Mint (or reuse) a short-lived Suno Clerk JWT. */
export async function refreshJwt(force = false): Promise<string> {
  const now = Date.now();
  if (!force && cachedJwt && cachedJwt.expiresAt > now) return cachedJwt.token;

  const client = readClientCookie();
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { Cookie: `__client=${client}; __client_uat=${CLIENT_UAT}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[suno-clerk] JWT refresh failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { jwt?: string };
  if (!json.jwt) throw new Error("[suno-clerk] auth response had no jwt");
  cachedJwt = { token: json.jwt, expiresAt: now + 50_000 }; // refresh a bit before the ~60s expiry
  return json.jwt;
}

/** Authenticated call to the current Suno production API. */
export async function sunoApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T | null; text: string }> {
  const jwt = await refreshJwt();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Origin: "https://suno.com",
      Referer: "https://suno.com/",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: T | null = null;
  try {
    json = JSON.parse(text) as T;
  } catch {
    /* non-JSON (HTML error page, etc.) */
  }
  return { status: res.status, json, text };
}

export interface SunoClerkHealth {
  valid: boolean;
  isActive?: boolean;
  credits?: number;
  error?: string;
}

/** Verify the session is live and report remaining credits. */
export async function checkSunoClerkHealth(): Promise<SunoClerkHealth> {
  try {
    const { status, json, text } = await sunoApi<{
      is_active?: boolean;
      credits?: number;
      total_credits_left?: number;
    }>("GET", "/api/billing/info/");
    if (status !== 200 || !json) {
      return { valid: false, error: `billing/info -> HTTP ${status}: ${text.slice(0, 120)}` };
    }
    return {
      valid: true,
      isActive: json.is_active,
      credits: json.credits ?? json.total_credits_left,
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Whether a Suno session is configured (cookie reachable). */
export function hasSunoClerkSession(): boolean {
  try {
    readClientCookie();
    return true;
  } catch {
    return false;
  }
}

/** Fetch finished clip details by id — verified-working Bearer endpoint. */
export async function fetchClipsByIds(ids: string[]): Promise<
  Array<{ id: string; audio_url: string; title: string; status: string; image_url: string | null; duration: number | null }>
> {
  if (ids.length === 0) return [];
  const { status, json } = await sunoApi<
    Array<{ id: string; audio_url: string; title: string; status: string; image_url: string | null; metadata?: { duration?: number } }>
  >("GET", `/api/clips/get_songs_by_ids?ids=${encodeURIComponent(ids.join(","))}`);
  if (status !== 200 || !Array.isArray(json)) return [];
  return json.map((c) => ({
    id: c.id,
    audio_url: c.audio_url,
    title: c.title,
    status: c.status,
    image_url: c.image_url ?? null,
    duration: c.metadata?.duration ?? null,
  }));
}

export interface SunoClerkResult {
  songId: string;
  audioUrl: string;
  title: string;
  imageUrl: string | null;
  duration: number;
  variants: Array<{ songId: string; audioUrl: string; title: string }>;
}

/**
 * Attempt to CREATE a song over HTTP, then poll completed clips via the
 * verified clip-fetch endpoint. Throws cleanly if Suno rejects the submit
 * (Turnstile / changed endpoint) so the caller falls back to CDP browser
 * automation.
 */
export async function generateViaSunoClerk(
  prompt: string,
  opts: { makeInstrumental?: boolean; pollInterval?: number; timeout?: number } = {},
): Promise<SunoClerkResult> {
  const pollInterval = opts.pollInterval ?? 6_000;
  const timeout = opts.timeout ?? 10 * 60 * 1000;
  const startedAt = Date.now();

  const submit = await sunoApi<{ clips?: Array<{ id: string }>; detail?: string }>(
    "POST",
    "/api/generate/v2/",
    {
      gpt_description_prompt: prompt,
      prompt: "",
      make_instrumental: opts.makeInstrumental ?? true,
      mv: "chirp-bluejay",
      generation_type: "TEXT",
    },
  );

  if (submit.status !== 200 || !submit.json?.clips?.length) {
    throw new Error(
      `[suno-clerk] generate submit failed (HTTP ${submit.status}) — Suno HTTP gen is Turnstile-gated; fall back to CDP. ` +
        `Body: ${submit.text.slice(0, 200)}`,
    );
  }

  const clipIds = submit.json.clips.map((c) => c.id).filter(Boolean);
  logger.info({ clipIds }, "[suno-clerk] submit accepted, polling clips");

  while (Date.now() - startedAt < timeout) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const clips = await fetchClipsByIds(clipIds);
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    logger.info({ clipIds, statuses: clips.map((c) => c.status), elapsed: `${elapsed}s` }, "[suno-clerk] polling clips");
    // Accept any clip with an audio_url — Suno uses "streaming" during encode,
    // "complete" after, but either means the audio is available.
    const ready = clips.filter((c) => c.audio_url);
    if (ready.length > 0) {
      const primary = ready[0]!;
      return {
        songId: primary.id,
        audioUrl: primary.audio_url,
        title: primary.title ?? "",
        imageUrl: primary.image_url,
        duration: primary.duration ?? 0,
        variants: ready.map((c) => ({ songId: c.id, audioUrl: c.audio_url, title: c.title ?? "" })),
      };
    }
  }
  throw new Error(`[suno-clerk] generation timed out after ${timeout / 1000}s`);
}
