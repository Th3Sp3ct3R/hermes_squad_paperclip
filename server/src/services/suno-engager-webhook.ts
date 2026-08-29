/**
 * Suno Engager Webhook — paperclip → VAN/suno-engine bridge.
 *
 * On every PUBLISHED transition (manual or scheduled) paperclip fires a
 * best-effort POST to SUNO_ENGAGER_WEBHOOK_URL (if set). Engager enqueues
 * a growth burst for that song without paperclip ever importing engager code.
 *
 * Idempotent: engager de-dupes by sunoIssueId. Timeouts/certs fail open.
 */

import { logger } from "../middleware/logger.js";

export interface EngagerWebhookPayload {
  event: "suno_issue.published";
  at: string; // ISO
  companyId: string;
  sunoIssueId: string;
  audioUrl: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  minimaxAudioUrl: string | null;
  canonAudioVariant: string | null;
  targetChakra: string;
  targetFrequency: number;
  genre: string | null;
  concept: string;
  scheduled: boolean;
  publishTargets: string[] | null;
}

function webhookUrl(): string | null {
  const raw = process.env.SUNO_ENGAGER_WEBHOOK_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function webhookSecret(): string | null {
  return process.env.SUNO_ENGAGER_WEBHOOK_SECRET?.trim() || null;
}

export async function notifyEngagerOnPublish(payload: EngagerWebhookPayload): Promise<void> {
  const url = webhookUrl();
  if (!url) return; // engager not configured — paperclip still publishes fine

  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = webhookSecret();
  if (secret) headers["x-webhook-secret"] = secret;
  // also support HMAC downstream if engager wants it; we send raw secret for now

  const body = JSON.stringify(payload);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);

  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ url, status: res.status, body: text.slice(0, 500) }, "[engager-webhook] non-2xx");
    } else {
      logger.info({ sunoIssueId: payload.sunoIssueId, url }, "[engager-webhook] delivered");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ url, err: msg, sunoIssueId: payload.sunoIssueId }, "[engager-webhook] delivery failed (fail-open)");
  } finally {
    clearTimeout(t);
  }
}
