/**
 * Research Skills Loader — Raziel's Sefer HaMalakh.
 *
 * Scans `server/src/hermes/skills/research/*.md` at import time,
 * parses YAML frontmatter (name, description) from each file,
 * and caches the results. Exposes three functions:
 *
 *   - getResearchSkills()        — all loaded skill metadata
 *   - getSkillById(id)           — full content for a single skill
 *   - buildResearchSkillsIndex() — condensed markdown table for prompt injection
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ResearchSkill {
  id: string;
  name: string;
  description: string;
  fullContent: string;
}

// ─────────────────────────────────────────────────────────────
// Skills directory resolution
// ─────────────────────────────────────────────────────────────

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const DEFAULT_SKILLS_DIR = resolve(__dirname, "skills", "research");

function getSkillsDir(): string {
  return process.env.RAZIEL_SKILLS_DIR || DEFAULT_SKILLS_DIR;
}

// ─────────────────────────────────────────────────────────────
// YAML frontmatter parser (minimal — no external dep)
// ─────────────────────────────────────────────────────────────

interface Frontmatter {
  name: string;
  description: string;
}

function parseFrontmatter(raw: string): { meta: Frontmatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return {
      meta: { name: "Unknown", description: "" },
      body: raw,
    };
  }

  const yamlBlock = match[1]!;
  const body = match[2]!;

  // Simple key: value extraction (handles single-line values only)
  const meta: Record<string, string> = {};
  for (const line of yamlBlock.split("\n")) {
    const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (kv) {
      meta[kv[1]!] = kv[2]!.trim();
    }
  }

  return {
    meta: {
      name: meta.name ?? "Unknown",
      description: meta.description ?? "",
    },
    body,
  };
}

// ─────────────────────────────────────────────────────────────
// Cache — populated on first access
// ─────────────────────────────────────────────────────────────

let _cache: Map<string, ResearchSkill> | null = null;

function loadSkills(): Map<string, ResearchSkill> {
  if (_cache) return _cache;

  _cache = new Map();
  const dir = getSkillsDir();

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    // Directory doesn't exist or unreadable — return empty
    console.warn(`[raziel/research-skills] Skills directory not found: ${dir}`);
    return _cache;
  }

  for (const file of files) {
    const id = basename(file, ".md");
    const raw = readFileSync(resolve(dir, file), "utf-8");
    const { meta, body } = parseFrontmatter(raw);

    _cache.set(id, {
      id,
      name: meta.name,
      description: meta.description,
      fullContent: body.trim(),
    });
  }

  return _cache;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/** Returns all loaded research skills (metadata + content). */
export function getResearchSkills(): ResearchSkill[] {
  return Array.from(loadSkills().values());
}

/** Returns a single skill by ID, or undefined if not found. */
export function getSkillById(id: string): ResearchSkill | undefined {
  return loadSkills().get(id);
}

/**
 * Builds a condensed markdown table of all available research skills.
 * Designed for injection into Raziel's research system prompt so the LLM
 * knows what frameworks are available.
 */
export function buildResearchSkillsIndex(): string {
  const skills = getResearchSkills();
  if (skills.length === 0) return "_No research skills loaded._";

  const rows = skills.map(
    (s) => `| \`${s.id}\` | ${s.name} | ${s.description} |`
  );

  return [
    "| ID | Name | Description |",
    "|---|---|---|",
    ...rows,
  ].join("\n");
}
