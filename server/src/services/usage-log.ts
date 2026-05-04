/**
 * Usage logging service — records every API call (OpenRouter LLM, MiniMax music,
 * cover-art generation) for cost tracking and dashboard visualization.
 *
 * Follows the same pattern as activity-log.ts: takes `db` as first argument.
 * Never throws — usage logging should never crash the pipeline.
 */
import type { Db } from "@paperclipai/db";
import { usageLogs } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

export interface LogUsageParams {
  companyId: string;
  provider: "openrouter" | "minimax" | "cover-art";
  model: string;
  callType: "llm" | "music" | "image";
  stage?: string;
  sunoIssueId?: string;
  agentId?: string;
  tokensIn?: number;
  tokensOut?: number;
  tokensCached?: number;
  tokensTotal?: number;
  costCents?: number;
  durationMs?: number;
  statusCode?: number;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

export async function logUsage(db: Db, params: LogUsageParams): Promise<void> {
  try {
    await db.insert(usageLogs).values({
      companyId: params.companyId,
      provider: params.provider,
      model: params.model,
      callType: params.callType,
      stage: params.stage,
      sunoIssueId: params.sunoIssueId,
      agentId: params.agentId,
      tokensIn: params.tokensIn ?? 0,
      tokensOut: params.tokensOut ?? 0,
      tokensCached: params.tokensCached ?? 0,
      tokensTotal: params.tokensTotal ?? 0,
      costCents: params.costCents ?? 0,
      durationMs: params.durationMs ?? 0,
      statusCode: params.statusCode,
      success: params.success !== false ? 1 : 0,
      metadata: params.metadata,
    });
  } catch (err) {
    // Never let usage logging crash the pipeline
    logger.error({ err, params }, "[usage-log] failed to log usage");
  }
}
