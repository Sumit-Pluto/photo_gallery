# ROADMAP — full feature checklist

Living source of truth for what's **done ✅**, **in progress 🚧**, and **planned ⬜**. Every feature is
designed to be **optional via flags** (`features={{ … }}`) — a consuming project enables only what it wants.

> Update this file as work lands. It is the authoritative cross-developer / cross-AI record.

## Legend
✅ done & verified · 🚧 in progress · ⬜ planned · 🔑 needs an API key/paid plan

---

## 1. UI & theming
- ✅ macOS Photos shell: sidebar, top toolbar, content area, window chrome (optional)
- ✅ Sidebar: Library, Collections, Pinned (Favourites/Recently Saved/Map/Videos/Screenshots/People & Pets/
  Recently Deleted w/ lock icon), Albums, Sharing (Shared Albums/Activity), Utilities, Projects
- ✅ Light mode · ✅ Dark mode · ✅ **Semi-dark** (glass dark sidebar + light content)
- ✅ **macOS vibrancy/"glass"**: translucent backdrop-blur menus, sidebar, toolbar, Info panel & search dropdown
  (theme-aware fills + hairline borders + `--apg-radius-menu`); `@supports` fallback to a solid fill where
  `backdrop-filter` is unavailable
- ✅ Responsive desktop/laptop/tablet/mobile + ultra-narrow (Galaxy Fold ~280px); mobile drawer sidebar
- ✅ Theme switch control in UI (Light/Dark/Semi-Dark/System menu) · ⬜ optional **weather-aware** auto theme
- ✅ Theming via props: **accentColor** + **borderRadius** (CSS vars); ⬜ density/font presets
- ✅ Accessibility: focus traps in overlays, ARIA dialog roles, keyboard nav, reduced-motion, contrast (AA)

## 2. Library, viewing & navigation
- ✅ Library views: Years / Months / All Photos (Days grouping supported) — **date/time grouping**
- ✅ Collections (Memories, Pinned, Albums, People, Featured, Shared, Recent Days, Trips, Utilities, Objects)
- ✅ Adaptive responsive grid + zoom in/out, lazy images
- ✅ **Lightbox** photo viewer (prev/next, keyboard, actions) — 🚧 polish to 100% macOS parity
- ✅ **Video player** (native controls in lightbox) — 🚧 macOS-style custom controls/scrubber
- ✅ Multi-select (click **toggles** select/deselect; **Select All ↔ Unselect All**), **Copy to Album** +
  **Move to Album** (album views), keyboard shortcuts (⌘A, Delete, F, Esc, Space)

## 3. Albums
- ✅ Create / rename / delete / duplicate; nested folders; covers
- ✅ Add / remove / move items; "Remove from Album"
- ✅ Smart albums (rule engine): Favourites, Videos, Screenshots, RAW, Live, Panoramas, Recently Saved
- ✅ **Object albums** (auto, from detection) via the Objects browser → object focus
- ✅ **People** (auto, from face clustering) — populates the People & Pets view; click → person-focused grid
- ✅ **Documents** smart album (auto, from OCR `hasText` rule) — in sidebar + Collections
- ⬜ "Copy into tag folder" materialized albums (e.g. a real "Table" album) — currently virtual via object focus

## 4. Import & capture
- ✅ Import via **file browse** + **drag-and-drop** (images & videos); accepted-type allow-list
- ✅ Reads dimensions / video duration; source auto-classification (camera/screenshot/download/social/scan/ai)
- ✅ **Real EXIF extraction** (GPS→location, DateTimeOriginal→capture date, Make/Model, lens, ISO) via `exifr`
- ✅ **Custom camera**: capture photo, record video (getUserMedia), front/back switch, rule-of-thirds grid
- ✅ Live annotation while capturing (shapes + measurement arrows; saved with the capture)
- ✅ Detailed metadata: format, **extension**, byte size, dimensions, lat/lon, date/time, source (Info panel)
- ✅ Geolocation detect on capture (Geolocation API, permission-gated, in the custom camera)
- ✅ Object detect on **import AND capture** → auto-tag + object albums (AIAnalyzer runs on new media)

## 5. Map & places
- ✅ Leaflet map, free tiles (OSM + Esri satellite), no API key
- ✅ Map / Satellite / **Grid** modes; markers for located media; markers re-sync on library change
- ✅ **macOS thumbnail pins** (photo cover + count badge + tail), **zoom-aware clustering**; tap a pin → that
  location's photos in a **date-grouped sheet**; any GPS item (incl. screenshots) pins automatically
- ✅ **Grid tab = Memories mosaic**: date sections, full-width **auto-sliding hero** + irregular varied tiles
- ✅ **Mini-map** in the photo info panel
- Note: demo seed intentionally locates ~half the photos; real photos populate via EXIF GPS (§4)

## 6. Editor (photo & video)
- ✅ Photo: Adjust (13 sliders), Filters (10 presets), Crop/Rotate/Flip — non-destructive
- ✅ **Annotation layer**: rectangle, ellipse/oval, line, **arrow**, **double-arrow with center text**
  (measurement, e.g. "12 cm"), text, freehand — with **color**; in gallery edit + read-only in lightbox
- ✅ Annotation in **custom camera** (live) and on **video** (markup layer in the video editor)
- ✅ **Full video editor** — Adjust, Filters, **Trim**, **Markup** (annotations), **Overlay** (composite an image),
  **Audio** (mute original + add a music track w/ volume); exports a new clip via canvas + MediaRecorder + WebAudio
  (free, no ffmpeg); **Save** (overwrite) or **Save as Copy** (pick album), Cancel-confirm — mirrors the photo editor
- ✅ Edited result persists (CSS-filter model + Gemini/canvas bakes; video bakes to a new webm)
- ✅ **Save vs Save as Copy** (overwrite the photo, or create a new copy and pick its album) + **Cancel
  confirmation** when there are unsaved edits (Escape too)

## 7. AI (all optional; free unless marked 🔑)
- ✅ **Object detection** — TensorFlow.js COCO-SSD, in-browser, no key. Powers tags/search/find-similar/Objects
- ✅ **Generative editor** — Gemini (Remove BG / Restore / Colorize / Replace Sky / prompt). 🔑 needs image-gen
  quota (billing); free-tier key returns 429. Key is server-side only via `/api/ai/edit`
- ✅ **Face detection + clustering** → People — `@vladmandic/face-api` (TF.js), in-browser, **no key**.
  Detects faces + 128-D descriptors during analysis; the SDK clusters them (`lib/cluster.ts`) into People.
  Click a person → library filters to their photos. Models lazy-loaded from jsDelivr (CSP-allow-listed).
- ✅ **OCR** (tesseract.js, in-browser, **no key**) → text extracted per image, **searchable** (search a word
  printed inside a photo and it's found), feeds the **Documents** smart album. A per-word confidence filter
  rejects the gibberish tesseract emits for photos without text, so only real documents qualify.
- ✅ **Semantic search** "show me snowy mountains" — CLIP (transformers.js, `Xenova/clip-vit-base-patch16`,
  in-browser, **no key**); image embeddings computed during analysis, query embedded on search, ranked by cosine
  and blended after keyword hits. Models from the HF CDN (allow-listed); ~512-D vectors persist with each item
- ⬜ **Captions** (transformers.js BLIP or HF, free)
- ⬜ Pluggable **Hugging Face** provider option (Inference API / transformers.js)

## 7b. Advanced-features backlog (audited; prioritized — next candidates)
> From a full feature audit vs. macOS Photos. HIGH = most-requested / highest value.
- ✅ **Custom video player** (glass scrubber, buffered/played, volume, PiP, fullscreen, keyboard)
- ⬜ **HIGH — Lightbox zoom/pan** (scroll / double-click / pinch) for detail viewing
- ⬜ **HIGH — Editable metadata** in the Info panel (caption, keywords/tags, title; bulk edit)
- ⬜ **HIGH — Slideshow / Memories playback** (auto-advance + Ken Burns transitions)
- ⬜ MED — Lightbox **filmstrip** of adjacent media; **timeline scrubber** to jump by date
- ⬜ MED — **Keyboard-shortcut help** modal (`?`); album **drag-to-reorder**
- ⬜ MED — **Skeleton loaders** on library load; selection-count bar inside the lightbox
- ⬜ LOW — Smart-album **rule builder** UI; materialized tag albums; **print** dialog; import-from-URL; undo/redo beyond the editor; true windowed virtualization

## 8. Backend & storage (all optional adapters)
- ✅ Default zero-config localStorage + IndexedDB adapter (`StorageAdapter` interface)
- ✅ **Supabase**: Postgres (data) + Supabase Storage (blobs) adapter
  (`apps/web/src/lib/adapters/supabaseAdapter.ts`); imports/captures upload blobs via `putBlob`; metadata in
  JSONB tables. Wired in the demo when env vars are set; falls back to localStorage otherwise. **Run
  `docs/supabase-setup.sql` once** (creates tables + RLS + storage policy), then reload. 🔑 creds in `.env.local`.
- ⬜ Alternate adapters documented as options: S3 / R2 / GCS / Azure / MinIO; Postgres/MySQL/SQLite/Mongo;
  Prisma/Drizzle; REST/GraphQL/WebSocket; NestJS/Fastify service; BullMQ/Redis workers; vector DB
  (Qdrant/Pinecone/Weaviate/Chroma) for semantic search

## 9. Search
- ✅ Text search (name, place, tag, detected object, source)
- ✅ Click-object → find every photo with it (object focus)
- ✅ **OCR text search** — words printed inside an image are matched by the normal search
- ✅ **Natural-language semantic search** (CLIP) — "looks like" matches blended after keyword hits (§7)

## 10. Cross-cutting
- ✅ Security: nonce CSP, headers, input validation, URL allow-list, server-only keys, sanitization
- ✅ Recycle bin (30-day), duplicate detection + merge, export/download + metadata
- ✅ **Sharing**: Share a photo / multiple / one-or-more albums → generates a copyable link (+ Download);
  **Shared Albums** (copy-link / revoke) + **Activity** feed of shares. Client-side share records (localStorage).
- ✅ **Recently Deleted password lock**: set/change/remove a password (Web Crypto SHA-256, device-local), sidebar
  lock↔unlock icon, lock screen prompts for the password; settable from the ⋯ menu or the trash header
- ✅ Lazy-load `@supabase/supabase-js` (dynamic import) — /gallery first load trimmed 234 KB → 176 KB
- ⬜ Performance: true windowing/virtualization for very large libraries (currently lazy + auto-fill)
- ✅ Docs: README + `docs/SETUP.md` + `docs/ARCHITECTURE.md` + this roadmap + project-local `CLAUDE.md`
- ✅ Testing: Playwright e2e (manual runs); ⬜ automated CI suite

## Web-meaningful UI (done 2026-06-29)
- ✅ "All Projects / App Store" (iOS-only) → **"All Albums"** overview (My Albums + Create + Recent Days).
- ✅ Sidebar Albums section: All Albums + New Album + user albums (indented).

## New requests
- ✅ **Advanced video editor** (2026-07-07): **multi-segment trim** (keep several ranges, cut middles,
  per-segment **speed**), **image/watermark overlays that actually composite** (bug fixed), **text
  overlays**, **keyframe animation** (move/fade/scale/rotate over time), **crop + 90° rotate + flips
  for video**, **audio** (mute/volume + music + master fade in/out), **poster/thumbnail picker**, and
  **export quality** (480p/720p/1080p, fps). Built on a rewritten canvas+MediaRecorder **timeline
  engine** (`lib/videoBake.ts` + shared `lib/videoTimeline.ts`); no ffmpeg. Bake failures now surface a
  clear error instead of silently dropping edits.
- ✅ **Auto object smart albums** (2026-07-07): one live smart album per detected object (Person, Car,
  Chair, Table…) in a new sidebar **Objects** section; Collections "Objects" cards open the album.
  Membership is resolved live; the album set refreshes on analysis completion.
- ✅ **Upload / analysis / persistence fixes** (2026-07-07): reliable file-picker ("Choose files"
  button); uploaded photos now get the **same AI analysis as captures** (newest-first + drain-loop, no
  starvation); versioning **increments correctly and survives reload** (load-path no longer strips
  `versions`/`comments`); **Save-as-Copy carries its own history**; imports/captures persist **durable**
  URLs (no dead `blob:` after reload); Supabase setup now **creates the public `media` bucket**.
- ✅ **Free deployment guide** — [`docs/DEPLOY.md`](./DEPLOY.md) (Vercel + Supabase free tier) +
  [`docs/DEPLOY-MANUAL.md`](./DEPLOY-MANUAL.md) (no-Git manual upload: Vercel CLI / self-host Node / static export).
- ✅ **Swappable AI backend (no paid Gemini)** — [`docs/AI-SETUP.md`](./AI-SETUP.md): analysis
  (objects/faces/OCR/embeddings) + Remove Background already run FREE in-browser (no key); generative
  edits (`/api/ai/edit`) now pick a backend via `AI_EDIT_PROVIDER` = **local** (own Stable Diffusion —
  free+private), **huggingface** (free token), or **gemini**, with an `auto` fallback.
- ✅ **Versioning + Audit Log** (photos **and** videos, 2026-07-02): every save appends a new version (v1 =
  original, **never overwritten**); each version carries a human-readable audit log of what changed. Info panel →
  **Version history** (per-version thumbnail preview, timestamp, expandable "What changed", **Restore**); sidebar
  **Versions & Audit** view browses all edited/commented items. Persisted inline on `MediaItem` → Supabase JSONB.
- ✅ **Comments** (photos **and** videos, 2026-07-02): threaded comments with author + timestamp, add/delete, shown
  in the Info panel; persisted with the item. Author remembered locally (`apg:comment-author`).
- ✅ Editor **straighten/tilt** slider + ✅ **interactive crop** (free + fixed-ratio: Square/4:3/3:4/16:9/9:16/Original;
  square stays square while dragging) — **bakes on Done** (canvas) and uploads the result to Supabase Storage
- ✅ Search dropdown defaults: **Recently Viewed / Recently Edited / Recently Added** (focus the search box)
- ✅ Import existing **IPTC/XMP keywords** + location on import (exifr iptc+xmp)
- ✅ **Local Remove Background** (`@imgly/background-removal`) — runs fully in-browser (WASM), **no key**; the
  editor's Remove BG uses it directly (Gemini not required). Other generative ops still use Gemini.
- ✅ Info mini-map click → opens full **Map centered** on the photo; ✅ **tag click → date-grouped images**
- ✅ Camera annotations now applied to the captured still (saved); ✅ Undo/Clear in camera + editor
- ✅ Geolocation tagged on capture (prefetched, permission-gated); ✅ device info in capture EXIF
- ✅ Auto **Camera** + **Screenshots** albums (created on first capture/import of that source)
- ✅ Recycle bin: 30-day retention enforced (purge on load); restore/permanent-delete sync to Supabase

## Suggested build order (remaining)
1. ✅ Map/Annotation/EXIF/Info/Semi-dark/theming + ✅ Custom camera + ✅ web-meaningful UI (done 2026-06-29)
2. ⬜ **Supabase adapter (Postgres + Storage)** ← next (needs creds; no localStorage reliance after)
3. ⬜ Editor straighten + ratio crop; search defaults; import tags; local remove-bg; map/tag nav
4. ⬜ Face clustering → People; OCR → Documents; semantic search (free, HF/transformers.js)
5. ⬜ Video editor/annotations; macOS-parity viewer/player polish; perf virtualization; CI
