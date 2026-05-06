/**
 * Model tier configurations for the Hermes orchestrator.
 *
 * Three tiers map to OpenRouter's provider preferences + auto-routing.
 * Each tier is a typed const that can be spread into a `callModel` invocation.
 *
 * Privacy: all tiers set dataCollection: 'deny' — no provider may train on
 * our prompts or store them beyond the request lifecycle.
 *
 * Pricing is in USD per 1M tokens unless noted otherwise.
 * NOTE: The SDK's MaxPrice fields are strings per the OpenRouter API spec.
 */

import type { StopCondition } from "@openrouter/agent";
import { stepCountIs, maxCost } from "@openrouter/agent/stop-conditions";

// ─────────────────────────────────────────────────────────────
// Provider preferences type (matches SDK's ProviderPreferences)
// Defined here to avoid deep import from @openrouter/sdk/models
// ─────────────────────────────────────────────────────────────

export interface HermesProviderPreferences {
  sort?: { by: "price" | "throughput" | "latency"; partition?: "model" | "none" } | null;
  maxPrice?: { prompt?: string; completion?: string } | undefined;
  preferredMaxLatency?: { p90?: number } | number | null;
  preferredMinThroughput?: { p90?: number } | number | null;
  dataCollection?: "deny" | "allow" | null;
  requireParameters?: boolean | null;
  allowFallbacks?: boolean | null;
}

// ─────────────────────────────────────────────────────────────
// Tier config type
// ─────────────────────────────────────────────────────────────

export interface TierConfig {
  /** Display name for logging */
  name: string;
  /** Model identifier(s) — single string for auto, array for explicit fallback */
  model: string | string[];
  /** Provider-level routing preferences */
  provider: HermesProviderPreferences;
  /** Hard cost cap per individual call (USD) */
  hardCostCap: number;
  /** Default stop conditions for agentic loops using this tier */
  stopWhen: StopCondition[];
}

// ─────────────────────────────────────────────────────────────
// CHEAP_TIER — mechanical work, validators, timing
// Agents: Cassiel (planetary hour), Uriel (EQ / sound prompt)
// ─────────────────────────────────────────────────────────────

export const CHEAP_TIER: TierConfig = {
  name: "cheap",
  model: "openrouter/auto",
  provider: {
    sort: { by: "price", partition: "none" },
    maxPrice: { prompt: "0.5", completion: "1.5" },
    preferredMaxLatency: { p90: 3 },
    dataCollection: "deny",
    requireParameters: true,
    allowFallbacks: true,
  },
  hardCostCap: 0.05,
  stopWhen: [stepCountIs(3), maxCost(0.05)],
};

// ─────────────────────────────────────────────────────────────
// STANDARD_TIER — creative work, most Sephirotic agents
// Agents: Raziel, Zadkiel, Michael, Gabriel, Jophiel, Sandalphon
// ─────────────────────────────────────────────────────────────

export const STANDARD_TIER: TierConfig = {
  name: "standard",
  model: "openrouter/auto",
  provider: {
    sort: { by: "price", partition: "none" },
    maxPrice: { prompt: "3", completion: "10" },
    preferredMinThroughput: { p90: 50 },
    preferredMaxLatency: { p90: 5 },
    dataCollection: "deny",
    requireParameters: true,
    allowFallbacks: true,
  },
  hardCostCap: 0.25,
  stopWhen: [stepCountIs(8), maxCost(0.25)],
};

// ─────────────────────────────────────────────────────────────
// PREMIUM_TIER — nuance-critical, orchestrator + harmonization
// Agents: Hermes (orchestrator), Raphael, Metatron
//
// NOTE: Uses explicit fallback chain, NOT openrouter/auto.
// Models tried in order: Sonnet 4.5 → GPT-5 → Opus 4.7 (last resort)
// ─────────────────────────────────────────────────────────────

export const PREMIUM_TIER: TierConfig = {
  name: "premium",
  model: [
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-5",
    "anthropic/claude-opus-4.7",
  ],
  provider: {
    sort: { by: "price", partition: "none" },
    preferredMaxLatency: { p90: 10 },
    dataCollection: "deny",
    requireParameters: true,
    allowFallbacks: true,
  },
  hardCostCap: 1.0,
  stopWhen: [stepCountIs(12), maxCost(1.0)],
};

// ─────────────────────────────────────────────────────────────
// Tier lookup map
// ─────────────────────────────────────────────────────────────

export type TierName = "cheap" | "standard" | "premium";

export const TIERS: Record<TierName, TierConfig> = {
  cheap: CHEAP_TIER,
  standard: STANDARD_TIER,
  premium: PREMIUM_TIER,
};
