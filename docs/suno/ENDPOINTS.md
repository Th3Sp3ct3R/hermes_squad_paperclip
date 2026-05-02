# Suno API — captured endpoint surface

Captured live from `https://suno.com/create` against an authenticated Pro Plan account
(godisglory / GodlyGang) on 2026-05-02 via the chrome-connect bridge. Auth is **Clerk**
(`auth.suno.com/v1/client/verify`) — sessions ride on `__session` cookies + a short-lived JWT
auto-attached by Suno's frontend wrapper.

**CORS lock confirmed:** Direct cross-origin `fetch()` to `studio-api-prod.suno.com` fails
even from a same-origin script context, because Suno wraps `window.fetch` to attach the
auth headers. This means **Raziel must drive the API by triggering Suno's own UI
(form input + button click)** rather than calling the API directly. That's exactly the
architecture his SOUL.md describes — confirmed correct.

## Hosts

| Host | Purpose |
|---|---|
| `https://studio-api-prod.suno.com` | Primary REST API |
| `https://auth.suno.com` | Clerk auth |
| `https://cdn1.suno.ai` | Audio + image CDN (delivered via `audio_url`, `image_url`) |
| `https://m-stratovibe.prod.suno.com` | Internal analytics — ignore |
| `https://browser-intake-datadoghq.com` | Datadog RUM — ignore |

## ✨ The Create flow (timed live, end-to-end)

```
t = -11,087 ms   POST /api/c/check                        (pre-flight credit/abuse check)
t = 0            POST /api/generate/v2-web/               (THE create call)
t = 988          POST /api/feed/v3   {filters:{ids:[..]},limit:2}  (poll #1)
t = 6,237        POST /api/feed/v3   (poll #2)
t = 11,443       POST /api/feed/v3   (poll #3)
t = 16,760       POST /api/feed/v3   (poll #4)
t = 21,130       POST /api/gen/{NEW_SONG_ID}/increment_play_count/v2
                  → song complete, auto-plays in player
                  → audio_url, video_url, image_url all populated
```

**Polling cadence:** ~5 second interval on `POST /api/feed/v3` while generation is in flight.
**Time-to-song:** ~21 seconds for a Simple-mode generation.
**Output count:** Suno generates **2 song variants per Create** (`limit: 2` in the polling body).
**Auto-image:** Suno auto-generates a thumbnail (`image_url` + `image_large_url`) and a
 video (`video_url`) alongside the audio — Jophiel does NOT need to do separate image gen
 for Simple flow. (Advanced flow may differ — TBD.)

## All endpoints captured

### Generation

| Method | Path | Body | Purpose |
|---|---|---|---|
| `POST` | `/api/c/check` | TBD | Pre-flight credit/abuse check before allowing generate |
| `POST` | `/api/generate/v2-web/` | TBD (need one more capture) | **THE create-song endpoint** — fires when user clicks the Create button on `/create` |

The Simple-mode form has these fields (UI-observed):
- `Song Description` (free-form text — required)
- `+ Audio` (optional reference audio)
- `+ Lyrics` (optional explicit lyrics — overrides AI lyric gen)
- `Instrumental` toggle
- Inspiration tag pills (clickable — auto-fill the description)
- Model selector (default v5.5)

So the body of `POST /api/generate/v2-web/` is highly likely to be a superset of:
```ts
{
  gpt_description_prompt: string,    // from Song Description
  prompt?: string,                    // optional explicit lyrics
  tags?: string,                      // style tags
  title?: string,                     // optional title
  make_instrumental: boolean,         // from Instrumental toggle
  mv: "chirp-v5" | "chirp-v5.5",     // major version
  generation_type: "TEXT" | ...,
  // possibly: audio_input_id (for + Audio)
}
```

This matches Suno's documented public/community pattern (see gnimoaJ/suno-api). Will
nail down the exact field names next time someone clicks Create.

### Workspace listing (the one Raziel polls)

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/feed/v3?page=N` | — | `{clips: Clip[], next_cursor, has_more}` |
| `POST` | `/api/feed/v3` | `{cursor?, limit, filters}` | same |

**POST body shape (confirmed):**
```ts
{
  cursor: string | null,         // pagination cursor (UUID of last seen song)
  limit: number,                  // typically 20 for workspace, 2 for in-flight polling
  filters: {
    disliked?: boolean,
    trashed?: boolean,
    fromStudioProject?: boolean,
    stem?: boolean,
    workspace?: boolean,           // your-songs-only when true
    ids?: string[],                // when polling specific songs
  }
}
```

**Response shape (confirmed):**
```ts
{
  clips: Clip[],
  next_cursor: string,
  has_more: boolean,
}
```

### `Clip` (song) record — confirmed top-level keys

```ts
type Clip = {
  // Identity
  id: string;                       // UUID
  entity_type: "song" | string;
  user_id: string;
  display_name: string;
  handle: string;
  is_handle_updated: boolean;
  avatar_image_url: string;

  // Status (drives the polling loop)
  status: "queued" | "streaming" | "complete" | "error" | string;

  // Content
  title: string;
  audio_url: string;                // CDN URL for the music
  video_url: string;                // auto-generated video
  image_url: string;                // thumbnail
  image_large_url: string;          // high-res thumbnail
  media_urls: Record<string,string>;

  // Model info
  major_model_version: string;      // "v5.5"
  model_name: string;

  // Engagement
  play_count: number;
  upvote_count: number;
  comment_count: number;
  flag_count: number;
  is_liked: boolean;

  // State flags
  is_public: boolean;
  is_trashed: boolean;
  is_hidden: boolean;
  is_verified: boolean;
  is_contest_clip: boolean;
  has_hook: boolean;
  explicit: boolean;
  allow_comments: boolean;

  // Tags & display
  display_tags: string[];
  batch_index: number;             // 0 or 1 (Suno emits 2 variants)
  action_config: Record<string,unknown>;

  ownership: Record<string,unknown>;
  created_at: string;              // ISO

  metadata: ClipMetadata;
}

type ClipMetadata = {
  tags: string;                    // comma-separated style tags
  prompt: string;                  // the lyrics actually sung (or "[Instrumental]")
  type: string;                    // generation type
  duration: number;                // seconds
  refund_credits: boolean;
  stream: boolean;
  make_instrumental: boolean;
  task: string;
  can_remix: boolean;
  is_remix: boolean;
  priority: number;
  has_stem: boolean;
  uses_latest_model: boolean;
  model_badges: unknown[];
  is_mumble: boolean;
  // gpt_description_prompt is likely also here for songs from Simple-mode
}
```

### Song-level operations (URL pattern: `/api/gen/{songId}/...`)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/gen/{id}/increment_play_count/v2` | Track play (we saw this fire when a song auto-plays) |
| _inferred_ | `/api/gen/{id}/extend` | Remix/extend (the **Remix** button on song detail page) |
| _inferred_ | `/api/gen/{id}/edit` | Edit lyrics (the **Edit Displayed Lyrics** button) |
| _inferred_ | `/api/gen/{id}/download` | Download audio (the **...** menu) |
| _inferred_ | `/api/gen/{id}/publish` | Publish to public (publish-nudge endpoint hints) |
| _inferred_ | `/api/gen/{id}/share` | Share (share-nudge endpoint hints) |
| _inferred_ | `/api/gen/{id}/trash` | Move to trash (`is_trashed` flag in Clip) |

### Notifications

| Method | Path |
|---|---|
| `GET` | `/api/notification/v2?after_datetime_utc=<iso>` |
| `GET` | `/api/notification/v2/badge-count` |

### Sharing / publishing UI nudges

| Method | Path |
|---|---|
| `GET` | `/api/cms/nudges/share-nudge` |
| `GET` | `/api/cms/nudges/publish-nudge` |
| `GET` | `/api/share/stats?content_type=song` |

### Billing / plan

| Method | Path |
|---|---|
| `GET` | `/api/billing/info/` |
| `GET` | `/api/billing/usage-plan-web-table-comparison/` |
| `GET` | `/api/billing/usage-plan-faq/` |
| `GET` | `/api/billing/eligible-discounts` |

### User / personalization

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/user/get_user_session_id/` | Session id |
| `POST` | `/api/user/user_config/` | Update user config |
| `GET` | `/api/personalization/memory` | **Suno's own per-user memory layer** — drives Inspiration tag suggestions. Worth pairing with Metatron rather than re-implementing. |

### Music player state

| Method | Path |
|---|---|
| `POST` | `/api/music_player/playbar_state` |

### Social

| Method | Path |
|---|---|
| `GET` | `/api/social/following-feed` |

## Key insights for the integration

### 1. Each Create yields 2 variants — pipeline must handle pairs

Suno emits 2 song variants per generation request (`limit: 2`, `batch_index` 0 or 1).
Our `sunoIssues` schema currently models 1 song per row. **Recommendation:** add a
`variant` table OR store both URLs in metadata.variants[] so we don't lose half the
output. Simplest path:

```ts
metadata: {
  ...,
  variants: [
    { id, audioUrl, imageUrl, videoUrl, batchIndex: 0 },
    { id, audioUrl, imageUrl, videoUrl, batchIndex: 1 },
  ]
}
```

Raphael (Quality Gate) then picks the better variant, and the chosen one's URLs get
promoted to the top-level columns.

### 2. Auto-image = Jophiel becomes optional in Simple flow

The Suno Simple-mode generate response includes `image_url` and `image_large_url`
out of the box. Jophiel's role compresses to:
- **Override mode**: Architect wants custom cover art → Jophiel generates and Raziel attaches
- **Brand mode**: User wants consistent visual identity across an arc → Jophiel generates
- **Otherwise**: skip Jophiel, use Suno's default

Cassiel (Video) still uses the auto-image as a still + the audio waveform for video montages.

### 3. Polling is by ID list, not single-song GET

Suno's frontend polls `POST /api/feed/v3` with `{filters: {ids: [...]}, limit: 2}`. There's
no separate single-song polling endpoint. Raziel's polling loop should use this exact
shape — accumulate the in-flight song IDs after generate, poll the list, drop completed
ones from the list.

### 4. Suno already has memory — don't duplicate

`GET /api/personalization/memory` is hit on every page load. Suno tracks the user's
musical patterns and surfaces them as "Inspiration" tags. Metatron should focus on
**cross-song narrative** memory (this song belongs to chakra arc X, this is part of
the Wendell EP, etc.) — *not* per-user musical taste.

### 5. Clerk auth means Raziel needs a logged-in tab

Raziel cannot do server-to-server calls. He needs:
- A Chrome browser running with the user signed into Suno
- Hermes event `suno_auth_required` fired when the Clerk session expires
- The Architect signs in once; Clerk's session token persists in cookies

### 6. The user's existing naming convention canonicalizes

Songs in the workspace are named like:

> "Theta 6 Hz · Carrier 528 Hz · Dark ambient 23 weird 100 style"

Schema extension to capture this canonically:

```ts
metadata: {
  binauralBeat: { hz: 6, band: "theta" },     // Δ θ α β γ
  carrierFrequency: 528,                        // Solfeggio (also stored top-level as target_frequency)
  styleTags: ["dark ambient", "minimalist"],
  bpm: 74,
  mode: "simple" | "advanced",
  inspirationTags: string[],                    // captured from Suno's UI suggestions
  variants: [/* see #1 */],
  history: [/* pipeline trail */]
}
```

## Phase 9 — Raziel's flow (how the integration runs)

```
Trigger:    sunoIssues row transitions to status="GENERATING" with metadata.soundPrompt set
            (Uriel just deposited the Suno description text)

Raziel:
  1. Open / focus a tab on https://suno.com/create
  2. Verify Clerk session: window.__user || cookie '__session' present
     → if not, fire Hermes 'suno_auth_required' and bail
  3. Type metadata.soundPrompt into Song Description input
  4. Toggle Instrumental flag based on metadata.makeInstrumental
  5. Click Create button
  6. Capture POST /api/generate/v2-web/ response → song IDs
  7. Poll POST /api/feed/v3 with {ids:[...], limit:2} every 5s
  8. When all songs status === 'complete':
     - extract audio_url, image_url, video_url for each variant
     - PATCH /api/suno-pipeline/{id} with {sunoSongId, audioUrl, thumbnailUrl, videoUrl,
       metadata: {...metadata, variants: [...]}}
     - dispatch Hermes event 'suno_song_ready' (Sandalphon picks up for delivery)
  9. If status === 'error' on any variant: PATCH status=FAILED with reason

Polling timeout: 90 seconds (typical = 21s, P99 = ~60s for v5.5)
```

## Still to capture (low priority, future passes)

- [ ] Exact body of `POST /api/generate/v2-web/` (need one more Create click with the
      Request-cloning interceptor armed)
- [ ] Body of `POST /api/c/check` (the pre-flight check)
- [ ] Advanced-mode form fields (Title, Style of Music, Lyrics — likely separate fields
      in the body)
- [ ] Body shape of `POST /api/gen/{id}/extend` (Remix flow)
- [ ] Stem-separation endpoint (when `has_stem` triggers)
- [ ] Hooks endpoint (the "Hooks" sidebar item — what does it call?)
- [ ] Custom thumbnail upload endpoint (Advanced flow)
