# Suno Pipeline — Deferred Tasks

This file captures work intentionally postponed so we can stay focused on getting
the autonomous pipeline backbone running. Pick these up after Phases 7–9 ship.

## Phase 7.5 — Song Detail UI (kanban "showcase")

**Why deferred:** The state machine + agent integration matter more first. Once
agents can actually move songs through the pipeline, having a rich detail view
becomes useful. Right now the kanban cards show enough.

### Goal
Click a kanban card → land on `/THE/suno/:id` with all the song's artifacts visible
and overrideable.

### Build list

- [ ] **New route:** `<Route path="suno/:id" element={<SunoDetail />} />` in `App.tsx`
      (right after the existing `<Route path="suno" element={<SunoPipeline />} />`)
- [ ] **New page:** `ui/src/pages/SunoDetail.tsx` with:
  - Header: concept, chakra/frequency badge, status badge, agent assignments
  - **Audio player block** — `<audio controls src={audioUrl}>` with download button
  - **Video player block** — `<video controls src={videoUrl} poster={thumbnailUrl}>`
  - **Thumbnail preview** — image with "Replace cover art" button (opens Jophiel hook)
  - **Variant picker** — when Suno returns 2 variants, show both with play buttons
        and a "Promote this variant" action that swaps top-level `audioUrl` etc.
  - **Lyrics panel** — `metadata.history` filtered to lyrics deposits, with
        "Edit lyrics" button (Zadkiel re-run)
  - **Sound prompt panel** — `metadata.soundPrompt` displayed (Uriel)
  - **Stage timeline** — read from `GET /api/suno-pipeline/:id/timeline`
        (the activity log endpoint added in Phase 7)
  - **Manual override controls** — replace audio / image / video / lyrics
        directly from URL paste box (manual escape hatch)
- [ ] **Click-through from kanban:** make `SunoCard` in `SunoPipeline.tsx` a `<Link>`
      to `/suno/${issue.id}` (preserve company prefix via the router wrapper)
- [ ] **API client:** add `sunoPipelineApi.get(id, companyId)` (single-issue fetch).
      Wire to `GET /api/suno-pipeline/:id` (add to server route in Phase 7).
- [ ] **Variants schema:** extend `metadata.variants[]` per ENDPOINTS.md §1 —
      `[{id, audioUrl, imageUrl, videoUrl, batchIndex}]`. Store both Suno variants
      after generation; the "winner" gets promoted to top-level columns.
- [ ] **Promote variant endpoint:** `POST /api/suno-pipeline/:id/variants/:variantId/promote`
      copies the chosen variant's URLs to top-level columns + logs activity.
- [ ] **Hermes events:**
  - `suno_variant_promoted` (Sandalphon picks up for delivery)
  - `suno_thumbnail_replaced` (Cassiel picks up for video re-render)

### Cards-on-kanban polish (Phase 7.5b)
- [ ] Show thumbnail (`<img>` 40x40) on each `SunoCard` left side (uses `metadata.thumbnailUrl`)
- [ ] Show duration badge (`metadata.duration`) bottom-right of card
- [ ] Hover-reveal audio scrubber (preview without leaving the kanban)
- [ ] Drag-to-status (use existing `@dnd-kit/core` already in the codebase via `KanbanBoard.tsx`)

---

## Onboarding wizard — music-orchestra theming

The wizard is THE multi-tenant signup mechanism. When a new user signs up to the
music-orchestra platform, they need a music-themed version of this 4-step flow.

- [ ] Replace "Acme Corp" placeholder → "Your Studio Name" / "Your Choir"
- [ ] Replace generic agent step with: "Choose your celestial choir size
      (10 archangels by default)" + automatically run the archangel seed once
      the company is created. Skips the manual agent-config step entirely for
      music-orchestra tenants.
- [ ] Replace generic task with: "Your first concept — what's the song?" which
      seeds the first `sunoIssues` row in DRAFT status with their input.
- [ ] Final step: "Launch your orchestra" → routes to `/{prefix}/suno` instead
      of `/{prefix}/dashboard`.
- [ ] **Tenant kind switcher:** add a `companies.kind` column (`generic` |
      `music-orchestra`) so the wizard can branch based on the tenant's flavor.
      Generic tenants get the existing flow; music tenants get the celestial flow.
- [ ] **`?skipOnboarding=1` URL flag** that suppresses the auto-open. Useful
      for dev when DB is empty.
- [ ] When `companies.length === 0` AND `localStorage["paperclip.skipOnboarding"]==="1"`,
      render a "Welcome — your tenant is empty. [Run archangel seed]" CTA
      instead of the Acme Corp wizard.

---

## Plugin extraction (architectural — long path)

The Suno work currently lives directly in Paperclip's `packages/db`, `server/`,
and `ui/`. Long-term it should be a Paperclip plugin so:
- Anyone running Paperclip can `paperclip plugin install suno-pipeline`
- Plugin owns its own schema, routes, UI components, sidebar items
- Core Paperclip stays pristine and pulls upstream cleanly

### Scope
- [ ] Create `packages/plugins/examples/plugin-suno-pipeline/` mirroring the
      `plugin-hermes-feed-example` structure
- [ ] Move schema → plugin's own DB scope (plugin DB has its own `pluginEntities`
      table they can use, OR negotiate a separate schema)
- [ ] Move routes → plugin worker tool dispatcher
- [ ] Move pages → plugin's `src/ui/index.tsx` exporting page + sidebar slot
- [ ] Move ChakraFrequencyMap, ArchangelHeatmap to plugin components
- [ ] Migration plan: keep both implementations during transition, dual-write,
      then deprecate the in-tree version

---

## Suno endpoint capture follow-ups (Phase 6f)

Captured in ENDPOINTS.md but body shapes still needed:
- [ ] Exact body of `POST /api/generate/v2-web/` — install Request-cloning
      interceptor + click Create one more time
- [ ] Body of `POST /api/c/check`
- [ ] Advanced-mode form fields (Title, Style of Music, Lyrics — what does the
      form post when those are populated?)
- [ ] `POST /api/gen/{id}/extend` (Remix flow body)
- [ ] Stem-separation endpoint trigger
- [ ] Custom thumbnail upload endpoint (Advanced flow)

---

## Misc bugs noticed during testing

- [ ] Hermes Feed plugin route shows 404 when company prefix in URL is "PLUGINS"
      (`/plugins/paperclip.hermes-feed` is being treated as a company prefix
      lookup). Fix: route `/plugins/...` BEFORE the company-prefix matcher in
      `App.tsx`.
- [ ] Stale `server/[object Object]/` directory in repo root from some earlier
      bug — gitignore + remove
- [ ] PM2 dump from before resurrect had stopped services (ground-truth,
      ingestion-queue) — investigate why they crash-looped 65+ times before
      giving up
