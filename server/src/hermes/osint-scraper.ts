/**
 * Azrael's Eyes — OSINT people-search scraper.
 *
 * Scrapes ThatsThem.com to resolve a full legal name into
 * phone numbers, emails, addresses, aliases, and family members.
 *
 * Uses native fetch (Node 24) + jsdom (already a server dependency).
 * No new packages required.
 */

import { JSDOM } from "jsdom";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PersonResult {
  name: string;
  aliases: string[];
  location: string;
  age: number | null;
  deceased: boolean;
  phones: string[];
  emails: string[];
  addresses: string[];
  family: string[];
}

export interface ScrapeResult {
  source: string;
  query: string;
  results: PersonResult[];
  resultCount: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const THATSTHEM_BASE = "https://thatsthem.com/name";

// ─────────────────────────────────────────────────────────────
// Name → URL slug
// ─────────────────────────────────────────────────────────────

function nameToSlug(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("-");
}

// ─────────────────────────────────────────────────────────────
// HTML parser — extracts PersonResult[] from ThatsThem DOM
// ─────────────────────────────────────────────────────────────

function parseThatsThem(html: string): PersonResult[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const results: PersonResult[] = [];

  // ThatsThem wraps each person in an h2 heading followed by content sections.
  // We split the main content by h2 headings to isolate each person block.
  const mainContent = doc.querySelector("#main-content") ?? doc.body;
  const headings = mainContent.querySelectorAll("h2");

  for (const heading of headings) {
    const nameText = heading.textContent?.trim() ?? "";
    if (!nameText || nameText.toLowerCase().includes("search")) continue;

    // Walk siblings from this h2 until the next h2 or end
    const blockElements: Element[] = [];
    let sibling = heading.nextElementSibling;
    while (sibling && sibling.tagName !== "H2") {
      blockElements.push(sibling);
      sibling = sibling.nextElementSibling;
    }

    const blockHtml = blockElements.map((el) => el.outerHTML).join("\n");
    const blockText = blockElements.map((el) => el.textContent ?? "").join("\n");

    // Parse name (strip "Deceased" suffix)
    const deceased = nameText.includes("Deceased") || blockText.includes("Deceased");
    const cleanName = nameText.replace(/Deceased/gi, "").trim();

    // Aliases — "Known as: ..." line
    const aliases: string[] = [];
    const aliasMatch = blockText.match(/Known as:\s*([^\n]+)/i);
    if (aliasMatch) {
      aliases.push(
        ...aliasMatch[1]!
          .split("•")
          .map((a) => a.trim())
          .filter(Boolean)
      );
    }

    // Location — "Lives in ..." or "Lived in ..."
    let location = "";
    const locMatch = blockText.match(/Lived? in\s+([^\n]+)/i);
    if (locMatch) location = locMatch[1]!.trim();

    // Age — "Born Month YYYY (NN years old)"
    let age: number | null = null;
    const ageMatch = blockText.match(/\((\d+)\s+years?\s+old\)/i);
    if (ageMatch) age = parseInt(ageMatch[1]!, 10);

    // Phone numbers — listed under "Phone Numbers:" heading
    const phones: string[] = [];
    const phoneSection = blockText.match(
      /Phone Numbers?:\s*([\s\S]*?)(?=(?:Current Address|Previous Address|Email Address|Family|$))/i
    );
    if (phoneSection) {
      const phoneMatches = phoneSection[1]!.match(/\d{3}-\d{3}-[\d]*/g);
      if (phoneMatches) phones.push(...phoneMatches);
    }

    // Email addresses — listed under "Email Addresses:" heading
    const emails: string[] = [];
    const emailSection = blockText.match(
      /Email Addresses?:\s*([\s\S]*?)(?=(?:Search for|Family|Run Full|$))/i
    );
    if (emailSection) {
      const emailMatches = emailSection[1]!.match(/\S+@\S+\.\S+/g);
      if (emailMatches) emails.push(...emailMatches);
    }

    // Addresses — current + previous
    const addresses: string[] = [];
    const addrSection = blockText.match(
      /(?:Current|Previous) Address(?:es)?:\s*([\s\S]*?)(?=(?:Email Address|Phone Number|Family|Search for|Run Full|$))/gi
    );
    if (addrSection) {
      for (const section of addrSection) {
        // Each address is typically 2 lines: street + city/state/zip
        const lines = section
          .replace(/(?:Current|Previous) Address(?:es)?:\s*/gi, "")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("Uncover") && !l.startsWith("Reveal"));

        for (let i = 0; i < lines.length - 1; i += 2) {
          const street = lines[i]!;
          const cityState = lines[i + 1] ?? "";
          if (street && cityState && /[A-Z]{2}\s+\d{5}/.test(cityState)) {
            addresses.push(`${street}, ${cityState}`);
          }
        }
      }
    }

    // Family members
    const family: string[] = [];
    const familySection = blockText.match(
      /Family:\s*([\s\S]*?)(?=(?:Run Full|Last updated|$))/i
    );
    if (familySection) {
      const names = familySection[1]!
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && l.includes(" ") && !l.startsWith("Run") && !l.startsWith("Last"));
      family.push(...names);
    }

    results.push({
      name: cleanName,
      aliases,
      location,
      age,
      deceased,
      phones: [...new Set(phones)],
      emails: [...new Set(emails)],
      addresses: [...new Set(addresses)],
      family: [...new Set(family)],
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export async function scrapeThatsThem(
  name: string,
  _location?: string
): Promise<ScrapeResult> {
  const slug = nameToSlug(name);
  const url = `${THATSTHEM_BASE}/${slug}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      return {
        source: "thatsthem",
        query: name,
        results: [],
        resultCount: 0,
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const html = await res.text();
    const results = parseThatsThem(html);

    // If location was provided, prioritize results matching that location
    if (_location) {
      const loc = _location.toLowerCase();
      results.sort((a, b) => {
        const aMatch = a.location.toLowerCase().includes(loc) ? 0 : 1;
        const bMatch = b.location.toLowerCase().includes(loc) ? 0 : 1;
        return aMatch - bMatch;
      });
    }

    return {
      source: "thatsthem",
      query: name,
      results,
      resultCount: results.length,
    };
  } catch (err) {
    return {
      source: "thatsthem",
      query: name,
      results: [],
      resultCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
