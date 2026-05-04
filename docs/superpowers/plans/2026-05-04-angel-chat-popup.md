# Angel Chat Popup — LLM Refinement Upgrade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing `AngelInvocationDialog` to use LLM-mediated concept refinement (via a new `angel-refine` backend endpoint) and fire auto-run after dispatch, transforming the ritual from template-based DRAFT creation into intelligent composition + autonomous generation.

**Architecture:** The existing 4-step state machine (ENTERING → MATERIA → SUMMARIZING → DISPATCHED) gains a new REFINING step between MATERIA and SUMMARIZING. The SUMMARIZING step now shows LLM-refined output. Dispatch now calls create + auto-run. One new backend service (`angel-refine.ts`) + one new route. Header count changed to spelled-out English.

**Tech Stack:** React + TanStack Query (frontend), Express + Zod + OpenRouter (backend), existing `callOpenRouter` + `CHAKRA_ANGEL` from `day-plan.ts`.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `server/src/services/angel-refine.ts` | LLM prompt builder for angel-mediated concept refinement |
| Create | `ui/src/lib/numberToWords.ts` | Integer → English words for header count |
| Modify | `server/src/routes/suno-pipeline.ts` | Register `POST /angel-refine` route |
| Modify | `ui/src/api/sunoPipeline.ts` | Add `AngelRefineInput/Result` types + `angelRefine()` API method |
| Modify | `ui/src/components/AngelInvocationDialog.tsx` | Add REFINING step, LLM call, auto-run on dispatch, richer greetings |
| Modify | `ui/src/pages/SunoPipeline.tsx` | Update header count to spelled-out words |

---

### Task 1: Create `angel-refine` backend service

**Files:**
- Create: `server/src/services/angel-refine.ts`

LLM prompt builder for angel-mediated concept refinement. Uses existing `callOpenRouter` and `CHAKRA_ANGEL` from `day-plan.ts`.

- [ ] **Step 1: Create the service file**

```typescript
/**
 * Angel Refine — LLM-mediated concept refinement for the Angel Invocation flow.
 *
 * A ruling angel receives the user's free-text "materia" and refines it into
 * a structured concept (concept, genre, rationale) that can be passed directly
 * to the Suno issue create endpoint.
 */
import { callOpenRouter, SUNO_MODELS } from "./suno-llm.js";
import { CHAKRA_ANGEL } from "./day-plan.js";
import { SUNO_CHAKRA_FREQUENCIES } from "@paperclipai/db";
import type { SunoChakra } from "@paperclipai/db";
import { VANTA_MASTER_PRESET, EXCLUDE_STYLES } from "./null-angel-identity.js";
import { logger } from "../middleware/logger.js";
import type { Db } from "@paperclipai/db";

export interface AngelRefineInput {
  chakra: SunoChakra;
  rulingAngel: string;
  userInput: string;
  presetId?: string;
  presetConcept?: string;
  presetGenre?: string;
}

export interface AngelRefineResult {
  concept: string;
  genre: string;
  targetChakra: SunoChakra;
  targetFrequency: number;
  rationale: string;
}

export interface AngelRefineContext {
  db?: Db;
  companyId?: string;
}

export async function angelRefine(
  input: AngelRefineInput,
  ctx: AngelRefineContext = {},
): Promise<AngelRefineResult> {
  const angel = CHAKRA_ANGEL[input.chakra];
  const frequency = SUNO_CHAKRA_FREQUENCIES[input.chakra];

  const systemPrompt = `You are ${angel.name}, ruling angel of the ${input.chakra} chakra (${frequency} Hz). Your voice is ${angel.voice}.

You are inside the Hermetic Opera chamber. A human has entered your domain and described what they want to compose. Your job is to refine their free-text description into a precise musical concept.

Sound identity constraints (Null Angel / Vanta Architect):
- ${VANTA_MASTER_PRESET.vocal_policy}
- ${VANTA_MASTER_PRESET.rhythm_policy} unless minimal sparse kicks
- Frequency bias: ${VANTA_MASTER_PRESET.frequency_bias}, rolled-off highs
- Textures: ${VANTA_MASTER_PRESET.textures.join(", ")}
- Avoid: ${VANTA_MASTER_PRESET.avoid.join(", ")}
- Exclude styles: ${EXCLUDE_STYLES}

Output contract — return EXACTLY this JSON shape, no markdown fences, no commentary:
{
  "concept": "<1-3 sentences, vivid sensory description of the sonic landscape>",
  "genre": "<comma-separated genre tags, 3-6 tags>",
  "targetChakra": "${input.chakra}",
  "targetFrequency": ${frequency},
  "rationale": "<1-2 sentences in YOUR voice (${angel.voice}) explaining why this working serves the human's intent>"
}`;

  const userMessage = [
    `The human speaks:`,
    `"${input.userInput}"`,
    input.presetConcept
      ? `\nThey selected the "${input.presetId}" mood preset, which suggests: "${input.presetConcept}"`
      : null,
    input.presetGenre ? `Preset genre hint: ${input.presetGenre}` : null,
    `\nRefine this into a precise musical concept. Stay within the Null Angel aesthetic. Return JSON only.`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callOpenRouter({
    model: SUNO_MODELS.soundPrompt,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    maxTokens: 600,
    context: {
      db: ctx.db,
      companyId: ctx.companyId,
      stage: "angel-refine",
    },
  });

  // Parse JSON — strip markdown fences if the model wraps them
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: AngelRefineResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    logger.error(
      { raw: raw.slice(0, 500), error: err },
      "[angel-refine] Failed to parse LLM JSON response",
    );
    throw new Error("Angel refinement returned invalid JSON — try rewording your request");
  }

  // Enforce chakra/frequency and provide defaults for missing fields
  parsed.targetChakra = input.chakra;
  parsed.targetFrequency = frequency;
  parsed.concept = parsed.concept || input.userInput;
  parsed.genre = parsed.genre || "ambient, dark minimal";
  parsed.rationale = parsed.rationale || "";

  return parsed;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/growthgod/gitgod/paperclip && npx tsc --noEmit --project server/tsconfig.json 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add server/src/services/angel-refine.ts
git commit -m "feat(suno): add angel-refine LLM service for invocation dialog"
```

---

### Task 2: Register `POST /angel-refine` route

**Files:**
- Modify: `server/src/routes/suno-pipeline.ts`

- [ ] **Step 1: Add import**

After the existing `import { parseDayPlan, CHAKRA_ANGEL, type DayPlan } from "../services/day-plan.js";` line, add:

```typescript
import { angelRefine, type AngelRefineInput } from "../services/angel-refine.js";
```

- [ ] **Step 2: Add Zod schema**

After the existing `dayPlanParseSchema` (search for `dayPlanParseSchema`), add:

```typescript
const angelRefineSchema = z.object({
  companyId: z.string().uuid(),
  chakra: chakraSchema,
  rulingAngel: z.string().min(1),
  userInput: z.string().min(1).max(2000),
  presetId: z.string().optional(),
  presetConcept: z.string().max(2000).optional(),
  presetGenre: z.string().max(400).optional(),
});
```

- [ ] **Step 3: Add route handler**

Place this directly before the `// ── POST /day-plan/parse` comment block:

```typescript
  // ── POST /angel-refine ──────────────────────────────────────────────
  // Angel Invocation — ruling angel LLM-refines the user's free-text
  // "materia" into a structured concept. No state mutated — preview only.
  // After the user confirms, the frontend calls create + auto-run.
  router.post(
    "/suno-pipeline/angel-refine",
    validate(angelRefineSchema),
    async (req, res) => {
      const body = req.body as z.infer<typeof angelRefineSchema>;
      assertCompanyAccess(req, body.companyId);
      const result = await angelRefine(
        {
          chakra: body.chakra,
          rulingAngel: body.rulingAngel,
          userInput: body.userInput,
          presetId: body.presetId,
          presetConcept: body.presetConcept,
          presetGenre: body.presetGenre,
        },
        { db, companyId: body.companyId },
      );
      res.json(result);
    },
  );
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/growthgod/gitgod/paperclip && npx tsc --noEmit --project server/tsconfig.json 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/suno-pipeline.ts
git commit -m "feat(suno): register POST /angel-refine route"
```

---

### Task 3: Add `angelRefine` API method to frontend client

**Files:**
- Modify: `ui/src/api/sunoPipeline.ts`

- [ ] **Step 1: Add types after `AutoRunResult` interface (around line 410)**

```typescript
export interface AngelRefineInput {
  chakra: SunoChakra;
  rulingAngel: string;
  userInput: string;
  presetId?: string;
  presetConcept?: string;
  presetGenre?: string;
}

export interface AngelRefineResult {
  concept: string;
  genre: string;
  targetChakra: SunoChakra;
  targetFrequency: number;
  rationale: string;
}
```

- [ ] **Step 2: Add method to `sunoPipelineApi` object**

Inside the `sunoPipelineApi` object, after the `autoRun` method, add:

```typescript
  /** Ruling angel LLM-refines the user's free-text into a structured concept. Preview only. */
  angelRefine: (companyId: string, input: AngelRefineInput) =>
    api.post<AngelRefineResult>("/suno-pipeline/angel-refine", {
      companyId,
      ...input,
    }),
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/growthgod/gitgod/paperclip && npx tsc --noEmit --project ui/tsconfig.json 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add ui/src/api/sunoPipeline.ts
git commit -m "feat(suno): add angelRefine API method"
```

---

### Task 4: Upgrade `AngelInvocationDialog` — LLM refinement + auto-run

**Files:**
- Modify: `ui/src/components/AngelInvocationDialog.tsx`

This is the core upgrade. Changes:
1. Add `REFINING` to the step union
2. Replace the template-based SUMMARIZING with LLM-refined output
3. Change dispatch from `create` only → `create + auto-run`
4. Update `materiaPrompt` strings with frequency-informed greetings

- [ ] **Step 1: Add imports for the new API types**

At the import from `@/api/sunoPipeline` (line 22-26), add `AngelRefineResult` to the import list:

```typescript
import {
  sunoPipelineApi,
  SUNO_CHAKRA_FREQUENCIES,
  type SunoChakra,
  type AngelRefineResult,
} from "@/api/sunoPipeline";
```

- [ ] **Step 2: Update the step type union**

Change line 31 from:

```typescript
type InvocationStep = "ENTERING" | "MATERIA" | "SUMMARIZING" | "DISPATCHED";
```

to:

```typescript
type InvocationStep = "ENTERING" | "MATERIA" | "REFINING" | "SUMMARIZING" | "DISPATCHING" | "DISPATCHED";
```

- [ ] **Step 3: Update `materiaPrompt` strings in `RULING_ANGELS`**

Replace the entire `RULING_ANGELS` constant (lines 46-97) with:

```typescript
const RULING_ANGELS: Record<SunoChakra, RulingAngelDef> = {
  ROOT: {
    name: "Uriel",
    glyph: "\u26F0",
    voice: "Grounded, terse, earthbound",
    materiaPrompt:
      "Root frequency, 396 Hz. Liberation from fear and guilt. " +
      "This is where you ground \u2014 gym sessions, shadow integration, " +
      "returning to the body after living too long in the mind. " +
      "What needs anchoring?",
    hasPortrait: true,
  },
  SACRAL: {
    name: "Haniel",
    glyph: "\u2640",
    voice: "Sensual, flowing",
    materiaPrompt:
      "Sacral frequency, 417 Hz. The frequency of change \u2014 " +
      "undoing situations, dissolving what no longer serves. Best invoked " +
      "during night drives, transformation rituals, the liminal hours " +
      "between midnight and dawn. What transformation calls you?",
    hasPortrait: false,
  },
  SOLAR: {
    name: "Michael",
    glyph: "\u2609",
    voice: "Direct, fiery, commanding",
    materiaPrompt:
      "Solar frequency, 528 Hz. The miracle tone \u2014 clarity, repair, " +
      "return to natural order. This is your morning frequency. Walking through " +
      "cold air with purpose, first coffee with intention. What needs illumination?",
    hasPortrait: true,
  },
  HEART: {
    name: "Raphael",
    glyph: "\u2609",
    voice: "Healing, balanced, central",
    materiaPrompt:
      "Heart frequency, 639 Hz. Connection and harmony. Where creativity " +
      "flows easiest \u2014 golden hour coding, winding down in a clean kitchen, " +
      "the quiet confidence of unhurried mastery. Speak the materia \u2014 a mood, " +
      "a memory, a wound to mend.",
    hasPortrait: true,
  },
  THROAT: {
    name: "Da\u2019ath",
    glyph: "\u26A0",
    voice: "The Abyss. No angel rules here. Only the Crosser.",
    materiaPrompt:
      "Throat frequency, 741 Hz. Da\u2019ath \u2014 the Abyss between what is known " +
      "and what must be spoken. Expression, problem-solving, cleansing. Most powerful " +
      "during difficult conversations or when something must be said aloud. " +
      "What needs to be spoken into existence?",
    hasPortrait: false,
    isVoid: true,
  },
  THIRD_EYE: {
    name: "Tzaphkiel",
    glyph: "\u2644",
    voice: "Contemplative, slow, knowing",
    materiaPrompt:
      "Third Eye frequency, 852 Hz. The frequency of inner knowing. " +
      "Your architect register \u2014 deep coding sessions, system design at 3am, " +
      "the state where the code writes itself. I see what you cannot yet name. " +
      "Describe the vision.",
    hasPortrait: false,
  },
  CROWN: {
    name: "Metatron",
    glyph: "\u25EF",
    voice: "Scribe, omniscient, sparse",
    materiaPrompt:
      "Crown frequency, 963 Hz. The highest register \u2014 pineal activation, " +
      "the threshold between waking and dissolution. Reserved for sleep descent, " +
      "void states, and the moments before unconsciousness claims you. " +
      "What approaches the threshold of form?",
    hasPortrait: true,
  },
};
```

- [ ] **Step 4: Add state for refined result and a ref to track created issue ID**

After `const textareaRef` (line 135), add:

```typescript
  const [refined, setRefined] = useState<AngelRefineResult | null>(null);
  const createdIssueIdRef = useRef<string | null>(null);
```

And update the reset function to clear them:

```typescript
  const reset = () => {
    setStep("ENTERING");
    setConcept("");
    setGenre("");
    setRefined(null);
    createdIssueIdRef.current = null;
    createMutation.reset();
  };
```

- [ ] **Step 5: Add a `refineMutation` using the new `angelRefine` endpoint**

After the `createMutation`, add:

```typescript
  const refineMutation = useMutation({
    mutationFn: () =>
      sunoPipelineApi.angelRefine(companyId, {
        chakra,
        rulingAngel: angel.name,
        userInput: concept.trim(),
        presetConcept: preloadedConcept,
        presetGenre: preloadedGenre,
      }),
    onMutate: () => setStep("REFINING"),
    onSuccess: (result) => {
      setRefined(result);
      setStep("SUMMARIZING");
    },
    onError: () => {
      refineMutation.reset();
      setStep("MATERIA");
    },
  });
```

- [ ] **Step 6: Replace the `createMutation` with a dispatch that creates + auto-runs**

Replace the existing `createMutation` (lines 167-182) with:

```typescript
  const createMutation = useMutation({
    mutationFn: async () => {
      const source = refined ?? {
        concept: concept.trim(),
        genre: genre.trim() || null,
        targetChakra: chakra,
      };
      // Only create if we haven't already (prevents duplicates on retry)
      if (!createdIssueIdRef.current) {
        const issue = await sunoPipelineApi.create(companyId, {
          concept: source.concept,
          targetChakra: chakra,
          genre: source.genre || null,
          metadata: {
            invocationSource: "angel-chamber",
            rulingAngel: angel.name,
            refinedByLlm: !!refined,
          },
        });
        createdIssueIdRef.current = issue.id;
      }
      // Fire auto-run
      const result = await sunoPipelineApi.autoRun(
        createdIssueIdRef.current,
        companyId,
        { musicBackend: "minimax" },
      );
      return result;
    },
    onMutate: () => setStep("DISPATCHING"),
    onSuccess: () => {
      setStep("DISPATCHED");
      onDispatched?.();
    },
    onError: () => setStep("SUMMARIZING"),
  });
```

- [ ] **Step 7: Change the "Speak" button in MATERIA step to call `refineMutation`**

In the MATERIA step, find the "Speak" button's `onClick` (currently `() => setStep("SUMMARIZING")` at line 386). Change it to:

```typescript
onClick={() => refineMutation.mutate()}
disabled={concept.trim().length < 3 || refineMutation.isPending}
```

Also add an error display for the refineMutation above the button area:

```typescript
{refineMutation.error && (
  <p className="text-xs" style={{ color: ALBEDO.red }}>
    {refineMutation.error instanceof Error
      ? refineMutation.error.message
      : "The refinement failed. Try again."}
  </p>
)}
```

- [ ] **Step 8: Add a REFINING step render block**

Between the MATERIA and SUMMARIZING render blocks, add:

```tsx
        {/* ── Step 2.5: REFINING — LLM is working ────────────────────── */}
        {step === "REFINING" && (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <Loader2
              className="h-8 w-8 animate-spin"
              style={{ color: ALBEDO.silver }}
            />
            <p
              className="text-sm italic"
              style={{
                color: ALBEDO.white,
                textShadow: "0 0 6px rgba(192,192,192,0.4)",
              }}
            >
              {angel.isVoid
                ? "The Abyss contemplates\u2026"
                : `${angel.name} consults the council\u2026`}
            </p>
          </div>
        )}
```

- [ ] **Step 9: Update the SUMMARIZING step to show LLM-refined output**

Replace the SUMMARIZING step content (lines 401-478) to show the `refined` result when available:

```tsx
        {/* ── Step 3: SUMMARIZING — confirm the working ──────────────── */}
        {step === "SUMMARIZING" && (
          <div className="space-y-5 py-2">
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-1">{renderAvatar("lg")}</div>
              <div className="min-w-0">
                <p
                  className="text-xs uppercase tracking-[0.25em]"
                  style={{ color: ALBEDO.silver }}
                >
                  {angel.isVoid ? "The Abyss reflects" : `${angel.name} presents the working`}
                </p>
                {refined ? (
                  <>
                    <p
                      className="text-sm italic mt-2 leading-relaxed"
                      style={{
                        color: ALBEDO.white,
                        textShadow: "0 0 5px rgba(255,255,255,0.35)",
                      }}
                    >
                      {refined.rationale}
                    </p>
                    <div
                      className="rounded-lg border p-3 mt-3 space-y-1.5"
                      style={{
                        borderColor: "#1f1f1f",
                        backgroundColor: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <p className="text-sm" style={{ color: ALBEDO.white }}>
                        {refined.concept}
                      </p>
                      <p className="text-xs" style={{ color: ALBEDO.silver }}>
                        {refined.targetChakra} {"\u00B7"} {refined.targetFrequency} Hz {"\u00B7"}{" "}
                        <span className="italic">{refined.genre}</span>
                      </p>
                    </div>
                  </>
                ) : (
                  <p
                    className="text-base italic mt-2"
                    style={{
                      color: ALBEDO.white,
                      textShadow: "0 0 5px rgba(255,255,255,0.35)",
                    }}
                  >
                    We will compose{" "}
                    <span style={{ color: ALBEDO.yellow }}>
                      &ldquo;{concept.trim().length > 80
                        ? concept.trim().slice(0, 80) + "\u2026"
                        : concept.trim()}&rdquo;
                    </span>{" "}
                    at{" "}
                    <span className="font-semibold tabular-nums" style={{ color: ALBEDO.white }}>
                      {hz} Hz
                    </span>
                    .
                    {genre.trim() && (
                      <> Genre: <span style={{ color: "rgba(255,255,255,0.7)" }}>{genre.trim()}</span>.</>
                    )}
                  </p>
                )}
                <p className="text-sm mt-3" style={{ color: ALBEDO.silver }}>
                  Shall I dispatch the council?
                </p>
              </div>
            </div>

            {createMutation.error && (
              <p className="text-xs" style={{ color: ALBEDO.red }}>
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "The working could not begin. Try again."}
              </p>
            )}

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="ghost"
                onClick={() => setStep("MATERIA")}
                style={{ color: ALBEDO.silver }}
              >
                Reword
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                style={{
                  backgroundColor: ALBEDO.yellow,
                  color: ALBEDO.black,
                  borderColor: ALBEDO.silver,
                  boxShadow: "0 0 14px rgba(255,215,0,0.4)",
                }}
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : null}
                Begin Working
              </Button>
            </div>
          </div>
        )}
```

- [ ] **Step 10: Add a DISPATCHING step render block**

Between SUMMARIZING and DISPATCHED, add:

```tsx
        {/* ── Step 3.5: DISPATCHING — auto-run in progress ───────────── */}
        {step === "DISPATCHING" && (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <Loader2
              className="h-8 w-8 animate-spin"
              style={{ color: ALBEDO.yellow }}
            />
            <p
              className="text-sm italic"
              style={{
                color: ALBEDO.white,
                textShadow: "0 0 6px rgba(255,215,0,0.5)",
              }}
            >
              The council is dispatched. The working has begun.
            </p>
          </div>
        )}
```

- [ ] **Step 11: Verify it compiles**

Run: `cd /Users/growthgod/gitgod/paperclip && npx tsc --noEmit --project ui/tsconfig.json 2>&1 | head -20`

- [ ] **Step 12: Commit**

```bash
git add ui/src/components/AngelInvocationDialog.tsx
git commit -m "feat(suno): upgrade AngelInvocationDialog — LLM refinement + auto-run dispatch"
```

---

### Task 5: Create `numberToWords` utility + update header count

**Files:**
- Create: `ui/src/lib/numberToWords.ts`
- Modify: `ui/src/pages/SunoPipeline.tsx`

- [ ] **Step 1: Create the utility**

```typescript
/**
 * Convert a non-negative integer to English words.
 * Covers 0-999; returns the number as a string for values >= 1000.
 */
const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

export function numberToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  n = Math.floor(n);
  if (n >= 1000) return String(n);
  if (n === 0) return "zero";

  let result = "";

  if (n >= 100) {
    result += ONES[Math.floor(n / 100)] + " hundred";
    n %= 100;
    if (n > 0) result += " ";
  }

  if (n >= 20) {
    result += TENS[Math.floor(n / 10)];
    n %= 10;
    if (n > 0) result += "-" + ONES[n];
  } else if (n > 0) {
    result += ONES[n];
  }

  return result;
}

/** Capitalize the first letter: "twenty-five" -> "Twenty-five" */
export function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 2: Update the header count in `SunoPipeline.tsx`**

Add import at top of SunoPipeline.tsx:

```typescript
import { numberToWords, capitalizeFirst } from "@/lib/numberToWords";
```

Find the count paragraph (lines 481-489):

```tsx
<p
  className="text-xs mt-0.5 tabular-nums"
  style={{
    color: "rgba(192,192,192,0.6)",
    letterSpacing: "0.02em",
  }}
>
  {issues?.length ?? 0} opera and counting.
</p>
```

Replace the inner text with:

```tsx
  {(issues?.length ?? 0) > 0
    ? `${capitalizeFirst(numberToWords(issues?.length ?? 0))} opera and counting.`
    : "The first opus awaits."}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/growthgod/gitgod/paperclip && npx tsc --noEmit --project ui/tsconfig.json 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add ui/src/lib/numberToWords.ts ui/src/pages/SunoPipeline.tsx
git commit -m "feat(suno): spelled-out header count — 'Twenty-five opera and counting'"
```

---

### Task 6: Manual smoke test

No files created — verification only.

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/growthgod/gitgod/paperclip && npm run dev`

- [ ] **Step 2: Navigate to the Suno Pipeline page**

Open `http://localhost:3100/THE/suno-pipeline`

- [ ] **Step 3: Verify header count**

Confirm the count line now shows spelled-out English (e.g., "Twenty-five opera and counting.") instead of a bare number. If no tracks, it should show "The first opus awaits."

- [ ] **Step 4: Click a mood preset chip**

Click "Begin Opus" to reveal the form, then click any mood preset (e.g., "Deep Work"). Verify the Angel Invocation Dialog opens with:
- Dramatic entrance animation (1.5s pause)
- The correct ruling angel for that chakra
- Updated frequency-informed greeting text
- Materia field pre-filled with the preset concept

- [ ] **Step 5: Test the full LLM-refined flow**

With the preset pre-filled (or type custom text) → click "Speak" → verify "consults the council..." spinner appears → verify angel summary shows a refined concept with rationale + concept + genre + Hz → click "Begin Working" → verify "The council is dispatched" spinner → verify DISPATCHED confirmation → close → verify kanban card appeared.

- [ ] **Step 6: Click a chakra cell**

Click any chakra tile in ChakraFrequencyMap. Verify the dialog opens with the correct angel, empty materia field. Type a concept, complete the flow.

- [ ] **Step 7: Verify existing flows still work**

Confirm "Consult the Council" (AngelChamberDialog / day-plan flow) still opens and works independently. Confirm "Invoke the Spheres" batch still works. Confirm the manual "Custom Concept" form in "Begin Opus" still creates directly.
