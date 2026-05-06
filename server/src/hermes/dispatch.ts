/**
 * Hermes dispatch — the single callModel gateway for all Sephirotic agents.
 *
 * Every LLM invocation in the orchestration system flows through `dispatch()`.
 * This gives us:
 *   1. Tier-based cost guardrails (auto-applied from model-tiers.ts)
 *   2. Per-request cost override (lower cap for known-cheap operations)
 *   3. JSONL cost telemetry at ./logs/dispatch.jsonl
 *   4. Privacy enforcement (dataCollection: 'deny' on all calls)
 *
 * Uses the OpenRouter Agent SDK's Responses API format:
 *   - `instructions` field for system prompt
 *   - `input` as string for user messages
 *   - `model` / `models` for routing
 *   - `provider` for ProviderPreferences
 */

import { OpenRouter } from "@openrouter/agent";
import { maxCost, stepCountIs } from "@openrouter/agent/stop-conditions";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { TIERS, type TierName, type TierConfig } from "./model-tiers.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface DispatchOptions {
  tier: TierName;
  /** User message content (sent as string input to callModel) */
  input: string;
  /** System prompt (sent via `instructions` field) */
  systemPrompt: string;
  /** Tools to expose to the model for this call */
  tools?: Parameters<InstanceType<typeof OpenRouter>["callModel"]>[0]["tools"];
  /** Override the tier's hard cost cap — can only LOWER, never raise */
  costOverride?: number;
  /** Agent name for telemetry attribution */
  agentName: string;
  /** Override max steps (defaults to tier's stopWhen step count) */
  maxSteps?: number;
}

export interface DispatchResult {
  text: string;
  model_used: string;
  cost_actual: number;
  tokens_input: number;
  tokens_output: number;
  latency_ms: number;
}

export interface DispatchLogEntry {
  timestamp: string;
  tier: TierName;
  model_used: string;
  cost_actual: number;
  latency_ms: number;
  agent_name: string;
  tokens_input: number;
  tokens_output: number;
  cost_cap_applied: number;
}

// ─────────────────────────────────────────────────────────────
// Client singleton
// ─────────────────────────────────────────────────────────────

let _client: InstanceType<typeof OpenRouter> | null = null;

function getClient(): InstanceType<typeof OpenRouter> {
  if (!_client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[hermes/dispatch] OPENROUTER_API_KEY is required. Set it in env."
      );
    }
    _client = new OpenRouter({
      apiKey,
      httpReferer: process.env.OPENROUTER_REFERER ?? "https://paperclip.ing",
      appTitle: process.env.OPENROUTER_APP_TITLE ?? "Paperclip Hermes",
    });
  }
  return _client;
}

// ─────────────────────────────────────────────────────────────
// JSONL logger
// ─────────────────────────────────────────────────────────────

const LOG_DIR = resolve(process.cwd(), "logs");
const LOG_PATH = resolve(LOG_DIR, "dispatch.jsonl");

function ensureLogDir(): void {
  mkdirSync(LOG_DIR, { recursive: true });
}

function logDispatch(entry: DispatchLogEntry): void {
  ensureLogDir();
  appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
}

// ─────────────────────────────────────────────────────────────
// Core dispatch function
// ─────────────────────────────────────────────────────────────

export async function dispatch(opts: DispatchOptions): Promise<DispatchResult> {
  const tier: TierConfig = TIERS[opts.tier];
  const client = getClient();

  // Cost cap: use override if lower than tier default
  const effectiveCap =
    opts.costOverride !== undefined
      ? Math.min(opts.costOverride, tier.hardCostCap)
      : tier.hardCostCap;

  // Build stop conditions
  const defaultSteps = opts.tier === "premium" ? 12 : opts.tier === "standard" ? 8 : 3;
  const stopWhen = [
    stepCountIs(opts.maxSteps ?? defaultSteps),
    maxCost(effectiveCap),
  ];

  // Resolve model config — array = fallback chain (models), string = single (model)
  const modelConfig = Array.isArray(tier.model)
    ? { models: tier.model }
    : { model: tier.model };

  const startMs = performance.now();

  const result = client.callModel({
    ...modelConfig,
    input: opts.input,
    instructions: opts.systemPrompt,
    // Cast to satisfy SDK's ProviderPreferences type (our interface is compatible)
    provider: tier.provider as Parameters<typeof client.callModel>[0]["provider"],
    tools: opts.tools,
    stopWhen,
  });

  // Await full response for telemetry
  const text = await result.getText();
  const response = await result.getResponse();
  const endMs = performance.now();
  const latencyMs = Math.round(endMs - startMs);

  const usage = response.usage ?? { inputTokens: 0, outputTokens: 0 };
  const modelUsed = response.model ?? (Array.isArray(tier.model) ? tier.model[0] : tier.model);

  // OpenRouter may include cost in response metadata
  const responseMeta = response as Record<string, unknown>;
  const costActual = (responseMeta.cost_usd ?? responseMeta.totalCost ??
    estimateCost(
      (usage as Record<string, number>).inputTokens ?? 0,
      (usage as Record<string, number>).outputTokens ?? 0,
      tier
    )) as number;

  const tokensIn = (usage as Record<string, number>).inputTokens ?? 0;
  const tokensOut = (usage as Record<string, number>).outputTokens ?? 0;

  const entry: DispatchLogEntry = {
    timestamp: new Date().toISOString(),
    tier: opts.tier,
    model_used: modelUsed,
    cost_actual: costActual,
    latency_ms: latencyMs,
    agent_name: opts.agentName,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
    cost_cap_applied: effectiveCap,
  };

  logDispatch(entry);

  return {
    text,
    model_used: modelUsed,
    cost_actual: costActual,
    tokens_input: tokensIn,
    tokens_output: tokensOut,
    latency_ms: latencyMs,
  };
}

// ─────────────────────────────────────────────────────────────
// Cost estimation fallback (when SDK doesn't expose actual cost)
// Uses tier maxPrice as upper bound estimate
// ─────────────────────────────────────────────────────────────

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  tier: TierConfig
): number {
  const maxPrice = tier.provider.maxPrice;
  if (!maxPrice) return 0;
  const promptRate = parseFloat(maxPrice.prompt ?? "0");
  const completionRate = parseFloat(maxPrice.completion ?? "0");
  const inputCost = (inputTokens / 1_000_000) * promptRate;
  const outputCost = (outputTokens / 1_000_000) * completionRate;
  return parseFloat((inputCost + outputCost).toFixed(6));
}
