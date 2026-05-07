/**
 * Azrael's Chain — OSINT lookup orchestrator.
 *
 * Chains people-search scraping with optional downstream tools:
 *   1. ThatsThem scrape (name → phones, emails, addresses)
 *   2. Holehe subprocess (email → registered services)
 *
 * Returns a structured OsintDossier.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { scrapeThatsThem, type PersonResult } from "./osint-scraper.js";

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ServiceCheckResult {
  email: string;
  services: Array<{
    name: string;
    exists: boolean;
    emailRecovery: string | null;
    phoneNumber: string | null;
    rateLimit: boolean;
  }>;
  error?: string;
}

export interface OsintDossier {
  query: { name: string; location?: string };
  people: PersonResult[];
  serviceChecks: ServiceCheckResult[];
  metadata: {
    sources: string[];
    timestamp: string;
    depth: string;
    warnings: string[];
  };
}

// ─────────────────────────────────────────────────────────────
// Holehe subprocess wrapper
// ─────────────────────────────────────────────────────────────

async function runHolehe(email: string): Promise<ServiceCheckResult> {
  try {
    // holehe outputs one JSON line per service to stdout
    const { stdout, stderr } = await execFileAsync(
      "python3",
      ["-m", "holehe", email, "--only-used"],
      { timeout: 60_000, maxBuffer: 1024 * 1024 }
    );

    if (stderr && stderr.includes("No module named")) {
      return {
        email,
        services: [],
        error: "holehe not installed (pip install holehe)",
      };
    }

    // Parse holehe output — each line is a service result
    const services: ServiceCheckResult["services"] = [];
    const lines = stdout.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      // holehe outputs colored text like "[+] service: Exists" or "[-] service: Not Found"
      const existsMatch = line.match(/\[([+-])]\s+(\S+)/);
      if (existsMatch) {
        services.push({
          name: existsMatch[2]!,
          exists: existsMatch[1] === "+",
          emailRecovery: null,
          phoneNumber: null,
          rateLimit: line.toLowerCase().includes("rate"),
        });
      }
    }

    return { email, services };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // python3 not found or holehe not installed — graceful skip
    if (msg.includes("ENOENT") || msg.includes("No module named")) {
      return {
        email,
        services: [],
        error: "holehe not available (install: pip install holehe)",
      };
    }

    return { email, services: [], error: msg };
  }
}

// ─────────────────────────────────────────────────────────────
// Check if holehe is installed
// ─────────────────────────────────────────────────────────────

let _holeheAvailable: boolean | null = null;

async function isHoleheAvailable(): Promise<boolean> {
  if (_holeheAvailable !== null) return _holeheAvailable;
  try {
    await execFileAsync("python3", ["-c", "import holehe"], { timeout: 10_000 });
    _holeheAvailable = true;
  } catch {
    _holeheAvailable = false;
  }
  return _holeheAvailable;
}

// ─────────────────────────────────────────────────────────────
// Main chain
// ─────────────────────────────────────────────────────────────

export interface OsintChainOptions {
  name: string;
  location?: string;
  depth: "quick" | "standard" | "deep";
  includeServiceCheck: boolean;
  maxResults: number;
}

export async function runOsintChain(
  opts: OsintChainOptions
): Promise<OsintDossier> {
  const warnings: string[] = [];
  const sources: string[] = [];

  // ── Step 1: Scrape ThatsThem ──
  const scrapeResult = await scrapeThatsThem(opts.name, opts.location);
  sources.push("thatsthem.com");

  if (scrapeResult.error) {
    warnings.push(`ThatsThem scrape error: ${scrapeResult.error}`);
  }

  // Limit results
  const people = scrapeResult.results.slice(0, opts.maxResults);

  // ── Step 2: Service checks via holehe (if depth >= standard) ──
  const serviceChecks: ServiceCheckResult[] = [];

  if (
    opts.includeServiceCheck &&
    (opts.depth === "standard" || opts.depth === "deep")
  ) {
    const holeheReady = await isHoleheAvailable();

    if (!holeheReady) {
      warnings.push(
        "holehe not installed — skipping service checks. Install: pip install holehe"
      );
    } else {
      sources.push("holehe");

      // Collect all unique emails across all people results
      const allEmails = new Set<string>();
      for (const person of people) {
        for (const email of person.emails) {
          // Only check emails that look reasonably complete
          // ThatsThem partially masks them (e.g. "m@aol.com")
          if (email.includes("@") && email.length > 5) {
            allEmails.add(email);
          }
        }
      }

      // Run holehe on each email (sequentially to avoid rate limits)
      for (const email of allEmails) {
        const result = await runHolehe(email);
        if (result.services.length > 0 || result.error) {
          serviceChecks.push(result);
        }
      }
    }
  }

  return {
    query: { name: opts.name, location: opts.location },
    people,
    serviceChecks,
    metadata: {
      sources,
      timestamp: new Date().toISOString(),
      depth: opts.depth,
      warnings,
    },
  };
}
