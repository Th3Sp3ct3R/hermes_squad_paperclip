/**
 * render-archangels.ts — Jophiel renders all 10 archangel portraits.
 *
 * Calls OpenRouter `chat/completions` with modalities:["image","text"] for
 * each archangel using sphere-aligned prompts (Tree of Life). Saves PNG to
 * `ui/public/archangels/<name>.png` and a manifest at
 * `ui/public/archangels/manifest.json` with avatar paths + metadata.
 *
 * Env required:
 *   OPENROUTER_API_KEY
 *
 * Usage:
 *   set -a && . /Users/growthgod/gitgod/paperclip/.env && set +a
 *   pnpm tsx scripts/render-archangels.ts                # render all 10 in parallel
 *   pnpm tsx scripts/render-archangels.ts --only=Michael,Jophiel
 *   pnpm tsx scripts/render-archangels.ts --model=google/gemini-2.5-flash-image
 *   pnpm tsx scripts/render-archangels.ts --serial      # one-at-a-time (debug)
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(REPO_ROOT, "ui", "public", "archangels");
const MANIFEST_PATH = join(PUBLIC_DIR, "manifest.json");

const OPENROUTER_BASE =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const DEFAULT_MODEL =
  process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image";

// Unified style prefix — every archangel shares this aesthetic so they read
// as a coherent tarot-deck-style series.
const STYLE_PREFIX = `Single centered celestial figure rendered as a sacred glyph in a vintage tarot card aesthetic merged with subtle digital decoration. Flat illustration with soft glowing edges. 1:1 square composition. The figure is symbolic and stylized — NOT photorealistic, no live-action person, no human-style portrait, no text/letters/labels anywhere. Behind the figure: a glowing sacred geometry shape acting as a luminous halo or aura. Cohesive series style — same artist, same sacred lineage, same lighting language across the whole deck. Mid-distance composition, dark uniform void background, no environmental elements, single figure only.`;

interface ArchangelPrompt {
  name: string;
  sphere: string;
  geometry: string;
  palette: string;
  symbolism: string;
}

const ARCHANGEL_PROMPTS: ArchangelPrompt[] = [
  {
    name: "Michael",
    sphere: "Geburah (Mars, Severity)",
    geometry: "glowing pentagram",
    palette: "deep crimson, burnt copper, solar gold accents",
    symbolism:
      "Crowned warrior archangel raising a sword of solar fire, armored in burnished crimson and gold, posture of disciplined fury, expression of righteous calm.",
  },
  {
    name: "Raphael",
    sphere: "Tiphareth (Sun, Beauty)",
    geometry: "glowing hexagram (Solomon's seal)",
    palette: "warm gold, amber, sunlit honey",
    symbolism:
      "Healing archangel holding a caduceus staff entwined with twin serpents, robed in radiant amber and gold, calm radiant face, hands open in blessing.",
  },
  {
    name: "Gabriel",
    sphere: "Yesod (Moon, Foundation)",
    geometry: "glowing nonagonal halo (nine-pointed)",
    palette: "lunar silver, twilight violet, midnight blue",
    symbolism:
      "Trumpet-bearing archangel, robed in lunar silver and violet, raising a horn that glows with dawn, eyes closed in revelation, face serene.",
  },
  {
    name: "Metatron",
    sphere: "Keter (Crown, Source)",
    geometry: "glowing Metatron's Cube — interlocking circles and lines forming the seed of all geometry",
    palette: "pure white, pearl, faint iridescence",
    symbolism:
      "Scribe archangel writing in the great Book of Records with a quill of light, robed in pearl white, expression of infinite serenity, the perfect geometric structure of Metatron's Cube glowing perfectly behind him.",
  },
  {
    name: "Uriel",
    sphere: "Netzach (Venus, Victory)",
    geometry: "glowing heptagram (seven-pointed star of Venus)",
    palette: "deep emerald, gold, soft green flame",
    symbolism:
      "Flame-bearing archangel cradling fire that bursts upward into harmonic waveforms, robed in emerald green and gold, expression of focused inspiration, sound made visible as light around him.",
  },
  {
    name: "Jophiel",
    sphere: "Chokmah (Wisdom)",
    geometry: "glowing Vesica Piscis — two intersecting circles forming a luminous almond",
    palette: "opal grey, starlight white, soft white-gold",
    symbolism:
      "Painter archangel with a luminous brush trailing constellations, robed in opal grey and starlight, expression of quiet wonder, painting stars into existence.",
  },
  {
    name: "Zadkiel",
    sphere: "Chesed (Jupiter, Mercy)",
    geometry: "glowing hexagram inscribed inside a square",
    palette: "royal sapphire, deep indigo, gold",
    symbolism:
      "Lyric-bearing archangel holding an unfurling scroll trailing glowing letters that turn to song, robed in royal sapphire and gold, expression of generous wisdom.",
  },
  {
    name: "Raziel",
    sphere: "Chokmah (Mystery)",
    geometry: "glowing Sri Yantra — interlocking sacred triangles",
    palette: "misty grey, deep violet, starlight",
    symbolism:
      "Keeper of mysteries archangel holding the Sefer Raziel, the book of secrets, robed in misty grey-violet, half his face shadowed in mystery, the other half lit by starlight.",
  },
  {
    name: "Sandalphon",
    sphere: "Malkuth (Earth, Kingdom)",
    geometry: "glowing cube of manifestation",
    palette: "umber, ochre, deep forest green, terracotta",
    symbolism:
      "Earthen archangel with prayers blossoming into flowers from his open hands, robed in umber and ochre and forest green, grounded posture, feet planted on living earth.",
  },
  {
    name: "Cassiel",
    sphere: "Binah (Saturn, Understanding)",
    geometry: "glowing heptagon as Saturnine seal, with faint orbital rings",
    palette: "deep black, slate silver, faint cold blue",
    symbolism:
      "Solemn time-keeper archangel encircled by Saturn's rings, robed in deep black and silver, holding an hourglass-scythe hybrid, expression of patient sorrow, face mostly in shadow.",
  },
];

function buildPrompt(a: ArchangelPrompt): string {
  return [
    STYLE_PREFIX,
    "",
    `ARCHANGEL: ${a.name}, of the sphere ${a.sphere}.`,
    `SACRED GEOMETRY (halo/aura): ${a.geometry}.`,
    `COLOR PALETTE: ${a.palette}, with metallic highlights.`,
    `FIGURE: ${a.symbolism}`,
  ].join("\n");
}

interface OpenRouterImageResponse {
  choices?: Array<{
    message?: {
      content?: string;
      images?: Array<{
        type?: string;
        image_url?: { url?: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function renderOne(
  archangel: ArchangelPrompt,
  model: string,
  apiKey: string,
): Promise<{ name: string; ok: true; path: string; mimeType: string; bytes: number; elapsedMs: number } |
            { name: string; ok: false; error: string }> {
  const startedAt = Date.now();
  const prompt = buildPrompt(archangel);

  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://paperclip.ing",
        "X-Title": "Paperclip Archangel Portraits",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
        image_config: {
          aspect_ratio: "1:1",
          image_size: "1K",
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => `${res.status}`);
      return { name: archangel.name, ok: false, error: `${res.status}: ${text.slice(0, 300)}` };
    }

    const data = (await res.json()) as OpenRouterImageResponse;
    const dataUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return { name: archangel.name, ok: false, error: "no image in response" };
    }

    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) {
      return { name: archangel.name, ok: false, error: "could not parse data URL" };
    }
    const mimeType = m[1] ?? "image/png";
    const base64 = m[2] ?? "";
    const buffer = Buffer.from(base64, "base64");

    const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg"
      : mimeType.includes("webp") ? "webp"
      : "png";
    const fileName = `${archangel.name.toLowerCase()}.${ext}`;
    const filePath = join(PUBLIC_DIR, fileName);
    await writeFile(filePath, buffer);

    return {
      name: archangel.name,
      ok: true,
      path: `/archangels/${fileName}`,
      mimeType,
      bytes: buffer.byteLength,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      name: archangel.name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not set in the environment");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const modelArg = args.find((a) => a.startsWith("--model="));
  const serial = args.includes("--serial");

  const model = modelArg ? modelArg.split("=", 2)[1]! : DEFAULT_MODEL;
  const onlyNames = onlyArg
    ? new Set(onlyArg.split("=", 2)[1]!.split(",").map((s) => s.trim()))
    : null;

  const targets = ARCHANGEL_PROMPTS.filter((a) => !onlyNames || onlyNames.has(a.name));

  await mkdir(PUBLIC_DIR, { recursive: true });

  console.log(`[render-archangels] target=${targets.length} model=${model} mode=${serial ? "serial" : "parallel"}`);
  console.log(`[render-archangels] output dir: ${PUBLIC_DIR}`);

  const startedAt = Date.now();
  const results = serial
    ? await (async () => {
        const out: Awaited<ReturnType<typeof renderOne>>[] = [];
        for (const a of targets) {
          out.push(await renderOne(a, model, apiKey));
        }
        return out;
      })()
    : await Promise.all(targets.map((a) => renderOne(a, model, apiKey)));

  const totalElapsedMs = Date.now() - startedAt;

  // Manifest combines new results with any existing on-disk entries we didn't re-render.
  let existingManifest: Record<string, unknown> = {};
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(MANIFEST_PATH, "utf-8");
    existingManifest = JSON.parse(raw);
  } catch {
    /* manifest does not exist yet — fine */
  }

  const archangelsOut: Record<string, {
    name: string;
    sphere: string;
    geometry: string;
    palette: string;
    avatarUrl?: string;
    bytes?: number;
    mimeType?: string;
    error?: string;
    renderedAt?: string;
    model?: string;
  }> = (existingManifest.archangels as typeof archangelsOut) ?? {};

  for (const r of results) {
    const spec = ARCHANGEL_PROMPTS.find((a) => a.name === r.name)!;
    if (r.ok) {
      archangelsOut[r.name] = {
        name: r.name,
        sphere: spec.sphere,
        geometry: spec.geometry,
        palette: spec.palette,
        avatarUrl: r.path,
        bytes: r.bytes,
        mimeType: r.mimeType,
        renderedAt: new Date().toISOString(),
        model,
      };
    } else {
      archangelsOut[r.name] = {
        ...(archangelsOut[r.name] ?? {
          name: r.name,
          sphere: spec.sphere,
          geometry: spec.geometry,
          palette: spec.palette,
        }),
        error: r.error,
      };
    }
  }

  await writeFile(
    MANIFEST_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model,
        totalElapsedMs,
        archangels: archangelsOut,
      },
      null,
      2,
    ),
  );

  console.log("");
  console.log("results:");
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✓ ${r.name.padEnd(11)} ${r.path}  ${(r.bytes / 1024).toFixed(1)}KB  ${r.mimeType}  ${r.elapsedMs}ms`);
    } else {
      console.log(`  ✗ ${r.name.padEnd(11)} FAIL: ${r.error}`);
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log("");
  console.log(`[render-archangels] ${okCount}/${results.length} ok in ${totalElapsedMs}ms`);
  console.log(`[render-archangels] manifest: ${MANIFEST_PATH}`);

  if (okCount < results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[render-archangels] FATAL:", err);
  process.exit(1);
});
