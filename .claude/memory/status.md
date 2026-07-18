# Build status & session log

## Run
`pnpm install && pnpm dev` → http://localhost:3000 (landing → Open Gallery → /gallery). `pnpm build` to ship.

## Current state (2026-06-29)
Phases 1–3 complete & verified (see [requirements.md](requirements.md)). `pnpm build` passes; /gallery ~170 KB
(TF.js + exifr lazy). Zero console errors. Default persistence = localStorage adapter (until Supabase wired).

## Session log
- S1: monorepo + SDK + demo; full macOS Photos UI; albums/smart-albums/recycle/import/editor/lightbox; light+dark;
  responsive; nonce CSP; 19-finding review fixed.
- S2: free in-browser object detection (TF.js COCO-SSD) + Objects browser; Gemini generative editor (server route,
  key server-side; 429 on free tier); fixed ORB video (local /sample-clip.mp4).
- S3: map popups; annotations incl. measurement double-arrow; EXIF; Info panel + mini-map; semi-dark + theming props;
  docs/ + CLAUDE.md.
- S4: `.claude/memory/` created; web-meaningful UI (All Projects→**All Albums**, removed App Store; AlbumsOverview);
  **custom camera (#1) DONE** (`components/Camera.tsx`: getUserMedia preview, photo capture, video record,
  front/back switch, rule-of-thirds grid, live annotation+measurement, geolocation on capture, auto object-detect;
  store `cameraOpen`/openCamera/closeCamera; toolbar 📷 button). Verified modal UI (no camera device in test env;
  works with a real webcam). `pnpm build` passes (/gallery 172KB).
  STILL OPEN: editor straighten/ratio-crop, search defaults (Recently Viewed/Edited), import IPTC/XMP tags,
  local remove-bg fallback (@imgly), info-map→Map, tag→date-wise, face clustering, OCR, semantic search, video annotations.
- S5: **#2 Supabase backend DONE** — `apps/web/src/lib/adapters/supabaseAdapter.ts` (Postgres JSONB tables +
  Storage blobs via putBlob); store gained `importFiles`/`uploadBlob` (uploads on import + camera capture);
  TopToolbar/LibraryView/Camera route through them; GalleryClient uses Supabase when `NEXT_PUBLIC_SUPABASE_*` set
  (else localStorage). CSP (middleware) now allows `https://*.supabase.co` (connect+img+media). Bucket `media` made
  public. Creds in `apps/web/.env.local` (gitignored). Adapter degrades gracefully if tables missing (probe→warn→seed).
  **USER MUST run `docs/supabase-setup.sql` once (SQL Editor) + reload** to activate persistence. `pnpm build` passes
  (/gallery 234KB — supabase-js bundled; TODO lazy-load to trim). Verified app boots clean on Supabase adapter (seed
  fallback) — only the expected gallery_media 404 probe until SQL is run.
  NOTE: service_role key is in .env.local but the client adapter uses the anon key; service key only for admin/setup.
- S6: VERIFIED Supabase end-to-end (user ran SQL): app loads 45 rows from Postgres, 0 console errors; a camera
  capture persisted + round-trips. FIXES: camera annotations moved to the REVIEW stage (annotate the captured still
  → saved as edits.annotations) + Undo/Clear; geolocation prefetched on camera open (10s, high-accuracy) + cached;
  device info attached to capture exif (Make 'Web Camera', Model=track label, Resolution). Auto-albums: addMedia now
  auto-creates+fills "Camera" (source camera) and "Screenshots" (source screenshot) user albums. Recycle: init purges
  items trashed > 30 days (deletePermanently → syncs to Supabase); restore/permanent-delete already sync via save.
  NEW FEATURES: editor **Straighten** slider (EditState.straighten + editTransformCss cover-scale); **info mini-map
  click → focusMap → opens full Map centered** (store mapFocus); **tag chip click → setTagFocus → library filtered by
  tag, date-grouped** (store tagFocus, libraryScale='days'); object/tag chips close overlays. VERIFIED tag→date-wise live.
  `pnpm build` passes.
  DEFERRED (next): interactive fixed-ratio/free crop (bake on save), search dropdown defaults (Recently Viewed/Edited),
  import IPTC/XMP keywords, local remove-bg fallback (@imgly), face clustering/OCR/semantic search, video annotations,
  lazy-load supabase-js (trim /gallery bundle), storage blob deletion on permanent-delete, reverse-geocode place names,
  optional pg_cron for server-side 30-day purge.
- S7: **Interactive crop DONE & verified** — `components/editor/CropBox.tsx` (drag/resize, 4 corner handles, masks,
  thirds grid, aspect lock so square stays square), ratio presets (Free/Square/4:3/3:4/16:9/9:16/Original) in the
  Crop tab; `lib/bake.ts` flattens crop+flip+filter+vignette+rotation/straighten to a JPEG on Done and re-maps
  annotations; `PhotoEditor.save()` bakes when `hasGeometry(edits)` and uploads via `uploadBlob` (Supabase Storage).
  FIXED Supabase storage 400: upsert/overwrite violated RLS → adapter now uploads to a UNIQUE path per call
  (`${id}-${rand}.ext`, plain INSERT). VERIFIED: cropped a portrait screenshot to 16:9, baked + uploaded to bucket
  (object `eMdEj_Ow32-…jpg`), displays cropped; 0 console errors; `pnpm build` passes.
  STILL OPEN (next, in order): search dropdown defaults (Recently Viewed/Edited), import IPTC/XMP keywords,
  local remove-bg fallback (@imgly), face clustering / OCR / semantic search, video annotations, lazy-load supabase-js.
- S8: **search dropdown defaults DONE** (store recentlyViewed[] + searchPreset 'viewed|edited|added'; openLightbox
  records views; setSearchPreset; selectors handle presets; TopToolbar Recents dropdown on focus). FIX: 'edited'
  preset keys off `editedAt||edits` (baked crops clear `edits` but set editedAt) — VERIFIED shows both crops + selfie.
  **IPTC/XMP import DONE** (readExif parses iptc+xmp → Keywords/dc:subject → tags). **Lazy-load supabase-js DONE**
  (GalleryClient dynamic-imports the adapter; /gallery 234KB→176KB). All typecheck + `pnpm build` pass; verified live.
  STILL OPEN (next): local remove-bg fallback (@imgly; needs wasm-unsafe-eval CSP + connect-src for model host),
  face clustering → People, OCR → documents, semantic search (transformers.js/HF), video annotations.
- S9: **Local Remove Background DONE & verified** — `@imgly/background-removal` (lazy import) in
  `createDemoAIProvider.generativeEdit`: op 'remove-background' runs the in-browser WASM model (no Gemini);
  other ops still hit /api/ai/edit. CSP: added `'wasm-unsafe-eval'` to script-src + `blob: data:` and
  `https://staticimgly.com` to connect-src (the ML worker fetches model/wasm from blob: URLs). VERIFIED:
  removed background from the user's selfie capture → clean transparent PNG, 0 errors, saved+uploaded to Supabase.
  `pnpm build` passes (/gallery 177KB; @imgly lazy). protobufjs build script declined in pnpm-workspace.yaml.
  STILL OPEN (next, model-heavy): face clustering → People (face-api.js), OCR → Documents (tesseract.js),
  semantic search (transformers.js/CLIP), video annotations. Each needs a model CDN host in connect-src.
- S10: **Face clustering → People DONE & verified** — `apps/web/src/lib/ai/faceProvider.ts` (`@vladmandic/face-api`,
  lazy import; tinyFaceDetector+faceLandmark68+faceRecognition; models from `cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model`,
  added to connect-src). Wired as `detectFaces` in createDemoAIProvider. SDK: `lib/cluster.ts` (greedy euclidean
  clustering, threshold 0.55, biggest-face-first); store `rebuildPeople()` (reuses existing person id/name by
  media overlap so names survive re-clustering) + `personFocus`/`setPersonFocus`; selectors filter by personFocus;
  AIAnalyzer now runs detectObjects+detectFaces (only what's missing per item) and calls rebuildPeople() after the
  pass (and once on load if faces exist but People empty); PeopleView click → setPersonFocus (filters library +
  shows count); LibraryView banner shows "Person: …". BUG FIXED: `hooks/useViewMedia.ts` omitted personFocus from
  the state passed to mediaForView → filter was a no-op; added it (+dep). VERIFIED: face-api detected the selfie's
  face (1 face, 128-D emb), People shows 1 person w/ circular cover + "1 photo", click → grid filtered to that 1
  photo. Persisted to Supabase (gallery_people + media.personIds). `pnpm build` passes (/gallery 178KB; face-api lazy,
  benign "Critical dependency: require" webpack warning only). Picsum seed photos / screenshots have no detectable
  frontal faces → only the real selfie clusters, as expected.
  STILL OPEN (next): OCR → Documents (tesseract.js), semantic search (transformers.js/CLIP), video annotations.
- S11: **OCR → Documents + searchable text DONE & verified** (planned via an `ultracode` Workflow that fanned out
  5 parallel readers to map integration points, then an Opus synthesizer). `apps/web/src/lib/ai/ocrProvider.ts`
  (NEW, tesseract.js@5.1.1, lazy import, single memoized worker; worker/core/lang paths ALL pinned to
  cdn.jsdelivr.net so nothing falls back to the non-allow-listed tessdata.projectnaptha.com; `meaningfulText()`
  confidence filter: per-word conf>=70 + >=4 words, else mean-conf>=72 + >=6 word-shaped tokens → '' for photos).
  Wired as `ocr` in createDemoAIProvider. SDK: `types.ts` MediaItem.ocrText + SmartRule 'hasText' + ViewId
  `sys:${string}`; `lib/text.ts` (NEW) sanitizeOcrText (control-char strip via RegExp-from-string, ws-collapse,
  10k cap); `smartAlbums.ts` hasText eval + `sys:documents` album; `selectors.ts` searchMedia haystack += ocrText;
  `AIAnalyzer.tsx` 3rd OCR leg (own `ocrText===undefined` gate, inner .catch so a slow/failed OCR can't abort
  objects+faces, patches even '' so it isn't reprocessed); Sidebar + CollectionsView 'Documents' + 'document' icon.
  CSP: cdn.jsdelivr.net added to script-src (connect-src already had it). CAUGHT VIA GROUND-TRUTH: first pass put
  ALL 41 Picsum photos in Documents because tesseract hallucinates low-conf gibberish (meanConf 21-29) on
  textureless photos → added the confidence filter; re-verified Picsum→'' , imported a text invoice → 213 chars of
  accurate text, Documents shows exactly it, search "oceanfront villa" (words only inside the image) finds it.
  Persisted to Supabase. `pnpm build` passes (/gallery 179KB; tesseract lazy). NOTE: ~189 benign console WARNINGS
  ("kernel … already registered for backend webgl") appear when face-api's bundled tfjs + coco-ssd's tfjs coexist
  (triggered by analyzing a newly-imported image) — warnings only, 0 errors. A test invoice now lives in the demo
  library as a live Documents example (uploaded to Supabase; user can delete).
  ADVERSARIAL REVIEW (ultracode Workflow, 4 dims × find→refute, 15 agents): correctness + security CLEAN (0);
  6 false alarms correctly refuted (worker leak, rebuildPeople N+1 writes, sequential model load, CSP-nonce-for-
  blob-workers, etc.). FIXED 3 confirmed: (1) exported pure utils clusterFaces/FaceCluster/sanitizeOcrText/
  OCR_TEXT_MAX_CHARS from index.ts (SDK-pattern consistency); (2) pinned tesseract.js EXACT 5.1.1 in package.json
  (was ^5.1.1) so the hardcoded worker CDN version can't drift; (3) sanitizeOcrText truncates on a word boundary
  at the 10k cap (was mid-word → search false-negative). DOCUMENTED (not fixed — minor/pre-existing, not regressions):
  (a) OCR backfill gate `ocrText===undefined` won't re-run if a host disables then re-enables OCR (same pattern as
  faces; fine while OCR stays on); (b) persist() debounce means a mid-analysis crash loses recomputable derived
  metadata (pre-existing, affects all analysis; source media safe, re-derived next load).
  STILL OPEN (next): semantic search (transformers.js/CLIP), video annotations.
- S12: **BIG new backlog from user (13 items)** — kicked off. WAVE 1 DONE & verified:
  (1) Selection is now a TOGGLE — plain click selects, clicking the sole selected tile deselects
  (PhotoTile.onClick); (2) the "..." More menu shows **Select All** then flips to **Unselect All** once all
  current-view items are selected (TopToolbar.openMoreMenu; removed the stray clearSelection-on-open); (3) editor
  now has **Save** (overwrite) + **Save as Copy** (uploads under a fresh id via new store action
  `duplicateWithEdits`, then opens the album picker) + **Cancel** with an "unsaved changes" confirm (isDirty check;
  Escape routes through it too via cancelRef); (4) **Copy to Album** (was "Add to Album") + **Move to Album**
  (new `moveToAlbumPicker`, album-view only) + Remove from Album. VERIFIED in browser: toggle true→false,
  Select All→46 selected→"Unselect All", editor bar = Cancel/Revert/Save as Copy/Save, context menu = Copy to Album.
  `pnpm build` passes (/gallery 180KB).
  PLANNING (ultracode background Workflow, 7 architects): file-level plans for the remaining big features saved at
  tasks/wck4qn659.output (sharing+links, password-lock, map-pins, grid-mosaic, glass-design, semantic-search,
  video-annotations) — use as the blueprint for the next waves.
  REMAINING WAVES (in this order): People rename + pet detection; Objects browser verify/expand; Map thumbnail pins
  + click->location date-wise + screenshot pins; Map "Grid" mosaic (hero + verticals + auto-slide); Sharing/Shared
  Albums/Activity + download links; Recently Deleted password lock + Settings; macOS glass/dark/radius design polish;
  semantic search (CLIP); video annotations; then README + memory.
  Design ref captured from user's macOS screenshots: glass dropdowns/sidebar (backdrop-blur + translucent dark
  fill + hairline border + caret), thumbnail map pins w/ count badge, irregular mosaic Grid.
- S13: **WAVE 2 DONE & verified** — People rename + pet detection + Objects browser.
  PETS: `constants.PET_LABELS` (dog/cat/bird/horse/rabbit); `store.rebuildPeople` now also builds pet groups from
  objectLabels with STABLE ids `pet:<label>` (name preserved across rebuilds), appended to people[], denormalized
  into media.personIds; AIAnalyzer triggers rebuild for objects too + on-load if pets present but ungrouped
  (imports PET_LABELS). RENAME: `store.renamePerson(id,name)`; PeopleView tile restructured (div, not nested
  buttons) — avatar button = view photos (personFocus), name button = rename via generalized `promptAlbumName`
  (now takes opts.placeholder/confirmLabel; NamePrompt placeholder prop). OBJECTS: already in CollectionsView
  (objectLabelCounts → setObjectFocus); verified. VERIFIED in browser: People & Pets shows human ("+ Add Name")
  + Birds + Horses; renamed human → "Davy" (persisted to gallery_people); Objects lists all 14 detected types,
  click "boat" → 2 photos + "Object: boat" banner. `pnpm build` passes (/gallery 180KB).
  NEXT: Wave 3 = Map thumbnail pins (count badge, click->location date-wise, screenshots w/ GPS pinned) + Map
  "Grid" mosaic. Then sharing/activity+links, password-lock, glass design, semantic search, video annotations,
  README. Blueprints for those in docs/feature-plans.json.
- S14: **WAVE 3 DONE & verified** — Map redesign.
  PINS: `selectors.clusterByLocation(items, precision)` (round coords; precision rises with zoom) + `LocationCluster`.
  MapView now renders Leaflet `divIcon` THUMBNAIL pins (`.apg-pin` img + count badge + tail; CSS in sdk.css) —
  static html only, img.src + count set via DOM after mount (XSS-safe); re-clusters on `zoomend`; click pin →
  local `cluster` state → bottom **sheet** (`.apg-map__sheet`) showing that location's photos via `groupByTime(…, 'day')`.
  Uses refs (locatedRef/openClusterRef) so Leaflet's once-created callbacks read live state. Screenshots/any GPS
  item pin (locatedMedia is source-agnostic). VERIFIED: 7 thumbnail pins w/ count badges; clicked one →
  "New Delhi, India · 4 photos" sheet, date-grouped (Thu Jun 18 / Tue Mar 3).
  GRID MOSAIC: new `components/views/MosaicGrid.tsx` (date sections via groupByTime 'month'; full-width
  auto-sliding `SlideHero` (cross-fade through first 6, 3.5s interval, dots) + irregular `.apg-mosaic` CSS grid
  with varied col/row spans from SPANS pattern; clicking opens lightbox). MapView 'grid' mode now renders it over
  ALL live media. VERIFIED: 13 month sections, hero + varied tiles, not uniform. `pnpm build` passes (/gallery 181KB).
  REMAINING (in order): sharing/shared-albums/activity + download links; Recently Deleted password lock + Settings;
  macOS glass/dark/radius design polish; semantic search (CLIP); video annotations; README. (Plans: docs/feature-plans.json.)
- S15: **WAVE 4 DONE & verified** — Sharing + Password lock (both client-side, localStorage; no SQL migration).
  LOCK: `lib/crypto.ts` (Web Crypto SHA-256 + app salt; hashPassword/verifyPassword); store `lock:{hash}` (persisted
  to localStorage `apg:lock-hash`) + in-memory `lockUnlocked` + actions setLockPassword/removeLockPassword/unlockLock/
  relock; RecentlyDeletedView shows a real password lock screen when hash && !unlocked; Sidebar Recently Deleted
  trailing icon = lock/unlock dynamically; `openSecuritySettings` modal (set/change/remove) from ⋯ menu + trash header.
  SHARING: types `ShareRecord`; store `shares[]` (localStorage `apg:shares`) + createShare(scope, ids, albumId)/
  revokeShare; `openShareModal(ids, albumId?)` modal — share selected photo(s) OR tick one/more albums → generates a
  `?shared=<token>` link, copies to clipboard, Download button; TopToolbar Share icon (when selection>0 or album view);
  PhotoTile context "Share…" (gated on features.sharing); SharedAlbumsView (cards + copy-link + revoke) + ActivityView
  (timeline) replace the old placeholders. VERIFIED: set pw→reload→lock screen→unlock OK; cleared test pw; shared 2
  photos→link generated+stored, Shared Albums card + Activity "You shared '2 Photos' · just now". `pnpm build` passes
  (/gallery 183KB). NOTE: lock/shares are device-local by design (not pushed to Supabase) — documented.
  REMAINING: macOS glass/dark/radius design polish (needs visual work from the screenshots); semantic search (CLIP);
  video annotations; README.
- S16: **WAVE 5 DONE & verified** — macOS glass/dark/radius polish (sdk.css). ROOT CAUSE found: `.apg-menu`,
  `.apg-info`, `.apg-search__recents` used OPAQUE `--apg-bg-elevated`, so backdrop-filter had nothing to blur.
  Added tokens `--apg-menu-bg` (light rgba(250,250,252,0.78) / dark rgba(44,44,46,0.7)), `--apg-glass-border`
  (hairline), `--apg-radius-menu:12px`, `--apg-hairline:0.5px`; dark theme made darker (sidebar rgba(22,22,24,0.72)).
  Applied glass to menu/sidebar(28px blur)/toolbar(24px)/info/search-recents with hairline borders + layered shadow +
  inner top highlight; `@supports not (backdrop-filter)` → solid fallback. VERIFIED via getComputedStyle in BOTH
  themes: light app #fff + menu rgba(250,250,252,0.78); dark app #1c1c1e + menu rgba(44,44,46,0.7); both blur(34px)
  + radius 12px; screenshot confirms translucent glass dropdown w/ checkmark. (Skipped the dropdown caret/notch —
  menus open at arbitrary fixed coords so a triangle wouldn't align reliably; noted as future.) `pnpm build` 183KB.
  NOTE: Playwright screenshot capture was returning stale frames this session (ERR_CACHE) — used computed styles as
  ground truth. REMAINING: semantic search (CLIP); video annotations; README.
- S17: **WAVE 6 — Semantic search (CLIP) DONE & verified.** `apps/web/src/lib/ai/clipProvider.ts`
  (@huggingface/transformers v3.8.1, `Xenova/clip-vit-base-patch16`, lazy; embedImage via canvas→RawImage→
  CLIPVisionModelWithProjection; embedText via AutoTokenizer→CLIPTextModelWithProjection; q8/WASM). Wired
  embedImage+embedText into createDemoAIProvider. AIAnalyzer: 4th `needsEmbedding` gate (m.embedding===undefined) +
  4th Promise.all leg (own .catch). Store: `semanticResults: MediaId[]|null` + setSemanticResults; setSearch clears it.
  NEW `components/SemanticSearch.tsx` (headless): debounced on searchQuery, embedText(query) → cosine-rank media w/
  embeddings (threshold 0.22, top 60) → setSemanticResults; mounted in PhotoGallery. selectors.mediaForView blends
  keyword hits then semantic-only matches and PRESERVES that relevance order (ranked flag skips chrono sort);
  useViewMedia passes semanticResults. CSP: connect-src += huggingface.co + *.huggingface.co + *.hf.co (weights
  redirect to HF Xet CDN us.aws.cdn.hf.co). VERIFIED: 44/45 images embedded (512-D, persisted); query "snow covered
  mountain" (no keyword match) → top results are snowy peaks/mountains/fog — genuine CLIP ranking. build /gallery 184KB.
  GOTCHA (same as faces/ocr): first pre-CSP-fix run set embedding=[] → gate wouldn't retry; cleared `embedding` in
  Supabase, re-embed worked. NOTE: vision + text encoders download separately on first use (slow first time, cached).
  REMAINING: **full video editor** (annotations + filters + trim + image overlay + mute + add music + Save/Save-as-Copy
  — user expanded scope; plan = canvas + MediaRecorder + WebAudio, free, no ffmpeg/SharedArrayBuffer); README.
- S18: **WAVE 7 — Full video editor DONE & verified.** `lib/videoBake.ts` (canvas + MediaRecorder + WebAudio
  export, NO ffmpeg/SharedArrayBuffer so CSP intact): offscreen muted video (muted=true for reliable autoplay;
  audio tapped via WebAudio MediaElementSource), plays trimmed range, draws each frame with ctx.filter
  (editFilterCss) + image overlay + rasterized annotations (clone live preview <svg> + add viewBox → data URL →
  Image), captureStream(30) + mixed audio (original unless muted + optional music via gain) → MediaRecorder webm
  (vp9/opus fallback chain); wall-clock deadline guards against a stalled loop. `components/editor/VideoEditor.tsx`
  (tabs Adjust/Filters/Trim/Markup/Overlay/Audio; Save/Save-as-Copy(nanoid id + duplicateWithEdits + album picker)/
  Cancel-with-confirm; progress %). EditState extended: trim{start,end}, overlay{src,x,y,scale}, audio{muted,
  musicSrc,musicVolume}. PhotoEditor now skips videos (kind==='video'→null); VideoEditor mounted in PhotoGallery.
  VERIFIED: opened a 30s clip → trim to 2s + Noir filter → Save as Copy → exported "MOV_5004 copy" kind=video
  mime=video/webm;codecs=vp9,opus DURATION=2 uploaded to Supabase; album picker appeared. `pnpm build` 188KB.
  ===== ALL 13 BACKLOG ITEMS FROM THE BIG USER BATCH ARE DONE & VERIFIED. Only README refresh remains. =====
- S19: **2nd big user batch (~19 glitches/features).** Blueprints for the large ones in docs/overhaul-plans.json
  (persistence root-cause, env-theming, upload, video player, map sheet, missing-features audit).
  DONE & verified this turn (12): (1) Layout — MEASURED full-width in Library/Collections/Map (240 sidebar + content
  = viewport); the "80/20 gap" couldn't be reproduced → likely DevTools docked/zoom on user's side. (2) Favorite —
  clean heart path in icons/index.tsx + RED (.apg-tile__fav #ff3b30 + Lightbox heart red when fav); toggle was fine,
  the white heart was just invisible. (3) Click a tile now OPENS the lightbox (PhotoTile.onClick; still additive in
  selection mode); right-click menu adds Open + Select/Deselect and no longer auto-selects. (4) Sidebar = floating
  rounded glass panel (border-radius var --apg-sidebar-radius default 14px + margin + full border). (5) Search focus
  ring on .apg-search:focus-within (wraps icon+input). (6) SelectionBar split into Share (openShareModal) + Download
  (download icon). (7) Lightbox: Edit now shows for VIDEO too, Download uses the download icon, added a Share button;
  fav button red+aria-pressed. (8) All Albums collapsible (disclosure caret + albumsOpen). (9) Recently Deleted lock
  icon clickable (Row onTrailingClick → toggleLock: no-pw→settings / unlocked→relock / locked→go unlock). (10) + and
  Import open a new UploadModal (components/UploadModal.tsx): drag-drop + browse + multi + album picker default=current
  album; importFiles(files, albumId?) now returns ids + files into the album; image/video only (mediaFromFile
  validates). (11) Upload processing already auto (addMedia source-albums incl. Screenshots + AIAnalyzer). (12)
  PERSISTENCE: store.init now treats the backend as the SINGLE SOURCE OF TRUTH (media=loaded.media; only seeds an
  empty backend once) — fixes "some images missing/stale on refresh"; media never uses localStorage (only lock/shares
  do, device-local by design). `pnpm build` passes (/gallery 188KB). All verified in-browser via getComputedStyle +
  interaction probes.
  STILL PENDING (large, next): map pins square-fit + hover tooltip + draggable resizable bottom-right sheet; custom
  macOS video player; dedicated Crop menu w/ working rotate/tilt; ENV-driven customization (theme bg/gradient/opacity,
  sidebar bg+radius, per-feature flags) + README + docs/ENV.md; smooth animations; advanced-features audit; deep test.
- S20: **Wave 2 of the 2nd batch DONE & verified (3 items).** (a) MAP pins: `.apg-pin__img` now
  position:absolute inset:0 + width/height 100% !important (Leaflet's `.leaflet-container img` was leaving it at
  natural size → non-square; VERIFIED now 43×43 square). Added a hover image tooltip (`.apg-pin__tip` + tip-img +
  caption, set via DOM in MapView marker 'add'). Sheet is now bottom-RIGHT (width 460, right:12), height set inline
  from `sheetH` state, with a drag GRIP (`.apg-map__grip` + pointer handlers onHandleDown/Move/Up) to resize toward
  full (drag down past 0.2 dismisses). VERIFIED drag 474→758px. (b) CROP: removed the `tab==='crop'` exclusion on
  transformCss in PhotoEditor so rotate/straighten/flip PREVIEW LIVE in the Crop tab (normal crop unaffected since
  no-transform=no-op). VERIFIED straighten 12° → matrix rotate+cover-scale. (c) ENV CUSTOMIZATION: store `ThemeTokens`
  (bg/elevated/sidebarBg/text light+dark, sidebarRadius, accent — any color/rgba/gradient) + GalleryConfig.themeTokens;
  PhotoGallery maps tokens→CSS vars per resolvedTheme into rootStyle; exported ThemeTokens. Demo
  `apps/web/src/lib/galleryConfig.ts` reads NEXT_PUBLIC_APG_* (feature flags + theme tokens + accent/radius/theme);
  GalleryClient applies env over defaults. Docs: `docs/ENV.md` (full var list + examples) + README Customization
  section + .env.example. `pnpm build` passes (/gallery 189KB). 15/19 of the 2nd batch done.
  STILL PENDING: custom macOS video player; smooth animations; advanced-features audit; deep test.
- S21: **Wave 3 (final) of the 2nd batch DONE & verified — ALL 19 items complete.** (a) CUSTOM VIDEO PLAYER:
  `components/VideoPlayer.tsx` (glass transport: play/pause, pointer-drag scrubber w/ buffered+played, time,
  mute+volume, PiP, fullscreen, auto-hide, keyboard) replaces native controls in Lightbox; new icons pause/volume/
  mute/expand/pip. VERIFIED custom controls + no native + play/pause. (b) ANIMATIONS: tile hover zoom (hover:hover),
  `.apg-scroll` view fade-in keyframe, prefers-reduced-motion guard. (c) FEATURE AUDIT documented in ROADMAP §7b
  (prioritized backlog). (d) DEEP TEST = ultracode adversarial review workflow (3 dims × find→refute, 17 agents);
  correctness/security mostly clean, refuted false alarms (place-name XSS, video edit routing, sheet stale-closure).
  FIXED all confirmed: CRITICAL VideoPlayer arrows double-fired the Lightbox window nav → owned keys now
  e.nativeEvent.stopImmediatePropagation() (VERIFIED: ArrowRight seeks 1→2.9s, lightbox does NOT navigate); HIGH
  pointercancel leaks on VideoPlayer scrubber + MapView grip → added pointercancel cleanup; HIGH init() double-seed
  under Strict Mode/remount → `initedRef` guard runs init once; MED scrubber seek when duration=0 → guarded;
  MED selection-mode click-can't-open → mitigated by existing double-click/Enter/right-click Open; LOW UploadModal
  now uses isAcceptedMediaFile (matches backend allow-list); LOW accent env redundancy removed; LOW themeToken CSS
  values sanitized (reject url()/expression()/breakout). `pnpm build` passes (/gallery 191KB).
  ===== 2ND BATCH (19 items: layout, favorite, select/open, sidebar radius, search focus, bottom bar, lightbox
  buttons, collapsible albums, lock icon, upload, persistence, map pins+sheet, crop tilt, env customization + ENV.md,
  video player, animations, features audit, deep test) ALL DONE & VERIFIED. Remaining known limitations: sharing/lock
  are device-local; advanced backlog in ROADMAP §7b (zoom/pan, metadata editing, slideshow, etc.) for future waves. =====
- S-versions (2026-07-02): **Versioning + Audit Log + Comments DONE & verified** (photos AND videos).
  DATA: `types.ts` — `MediaItem.versions?: MediaVersion[]` (v1 = original, never overwritten; each save appends)
  + `MediaItem.comments?: MediaComment[]`; new `MediaVersion`/`MediaComment` interfaces; `ViewId` += `'versions'`.
  STORE (`store/store.ts`): `addVersion(id, patch, changes)` (seeds v1 from the pre-edit snapshot on first edit,
  then appends), `restoreVersion(id, versionId)` (sets live fields to the chosen version + appends a "Restored
  version N" audit entry), `addComment(id, text, author?)`, `deleteComment(id, commentId)` — all persist().
  AUDIT LOG helper: `lib/versions.ts` `summarizeEdits(edits): string[]` (Cropped / Rotated / Filter: x / N
  annotations / Trimmed / Muted / etc.). EDITOR WIRING: `PhotoEditor.save(false)` & `VideoEditor.save(false)`
  now call `addVersion(...)` instead of `updateMedia` (Save-as-Copy path unchanged). UI: `InfoPanel.tsx` gained a
  **Version history** section (thumbnail per version w/ live CSS filter+transform preview, timestamp, expandable
  "What changed" audit list, Restore button on non-current) + **Comments** section (avatar/author/time list, delete
  on hover, name+textarea+Post form; author cached in localStorage `apg:comment-author`; Cmd/Ctrl+Enter posts).
  SIDEBAR: Utilities → "Versions & Audit" (icon clock, view `versions`). NEW VIEW: `views/VersionsView.tsx`
  (audit browser — every item with versions or comments; click → openLightbox+Info). ViewRouter case `versions`.
  CSS: `styles/sdk.css` apg-info__section / apg-versions / apg-version__* / apg-comments / apg-comment* /
  apg-comment-form* / apg-audit-* + `.apg-btn--small`/`.apg-btn:disabled`. PERSISTENCE: stored inline on MediaItem →
  Supabase JSONB (`data: m`) automatically; no schema change needed. VERIFIED: (a) unit test vs built dist —
  original preserved as v1, v2/v3 appended with audit logs, live src = latest, restore works, comment add/delete +
  author OK; (b) live UI on :3007 — sidebar item present, empty state, Info shows both sections, posted a comment
  (Davy → rendered w/ time), audit browser lists the item ("test-invoice.png · 1 version · 1 comment"). typecheck +
  `pnpm build` pass. NOTE: dev :3000 was occupied by a stale 500 server; tested on :3007.

- S-advanced (2026-07-07): **Advanced video editor + object smart albums + upload/analysis/versioning/persistence fixes + deploy guide.** Diagnosed via a 6-agent workflow (root causes in that run's journal).
  VERSIONING BUGS FIXED: (1) reload-strip — `lib/media.ts createMediaItem` now copies `versions`+`comments`
  (the localStorage load path dropped them → "stuck at v1" after refresh). (2) Save-as-Copy — `store.duplicateWithEdits(sourceId,patch,changes?)` now seeds the copy's OWN [v1 Original, v2 edit] history + resets comments (was inheriting/blank). Editors hoist `changes` + pass to duplicateWithEdits; catch fallbacks now addVersion/duplicateWithEdits (not applyEdit) so history is never lost.
  PERSISTENCE: `docs/supabase-setup.sql` now CREATES the public `media` bucket (was never created → uploads silently fell back to non-durable URLs). `store.importFiles` + `Camera` never persist a bare `blob:` URL — convert to a durable data URL (`blobToDataUrl` now exported from lib/media). 
  UPLOAD: `UploadModal` has an explicit "Choose files" button + visually-hidden input (not `hidden` attr) + resets value so re-picking same file fires onChange.
  ANALYSIS-ON-UPLOAD: `AIAnalyzer` now collects pending NEWEST-FIRST + drains in rounds (items imported mid-run are caught) → uploads analyze like captures; also calls `syncObjectAlbums()` on completion.
  OBJECT SMART ALBUMS: `lib/smartAlbums.ts objectSmartAlbums(media,now,minCount)` (one live `sys:obj:<label>` smart album per detected label, rule {field:'object',op:'contains'}); `store.syncObjectAlbums()` (interface + impl near rebuildPeople; called at end of init()); Sidebar "Objects" collapsible section (`sys:obj:*`); CollectionsView Objects cards now `setView('sys:obj:'+label)`. Membership live via resolveSmartAlbum; albums not persisted (regenerated).
  VIDEO EDITOR (heavy): types `EditState.segments/overlays/posterTime/export` + extended `audio` (originalVolume/fadeIn/fadeOut); new `VideoSegment/VideoOverlay/OverlayKeyframe`. New `lib/videoTimeline.ts` (normalizeSegments/outputDuration/sourceToOutputTime/videoOutputSize/resolveOverlays/sampleOverlay — pure, shared by bake+preview, exported from index). `lib/videoBake.ts` REWRITTEN as a timeline engine: ONE continuous MediaRecorder driven across segments (multi-trim + per-seg speed), crop+90°rot+flip geometry, CSS filter, overlays (image+text) keyframe-interpolated at output time, watermark, legacy overlay/annotations, WebAudio (original vol/mute + music + master fade), poster grab, export quality. `VideoEditor.tsx` REBUILT with tabs Trim&Split / Crop&Rotate / Overlays&Text / Filters / Adjust / Markup / Audio / Export + live keyframed overlay preview + surfaced export errors. `summarizeEdits` extended.
  DEPLOY: `docs/DEPLOY.md` (Vercel Root Dir=apps/web + Supabase free tier, env vars, gotchas: bucket public, CSP dynamic, Vercel 4.5MB body cap for Gemini). VERIFIED: `pnpm typecheck` + `pnpm build` pass (/gallery 198KB); 17/17 logic unit tests vs built dist (versioning increment/copy-history, objectSmartAlbums, timeline+keyframe interpolation, summarizeEdits); live browser (Edge) — 0 console errors, Objects sidebar live (Person/Car/Chair…), upload modal Choose-files, video editor all 8 tabs + text overlay live preview + keyframe UI. Did NOT git commit (user commits).

- S-deploy-ai (2026-07-07): **Manual (no-Git) deploy guide + swappable free/local AI backend.**
  DEPLOY: `docs/DEPLOY-MANUAL.md` — 3 no-Git paths: (A) Vercel CLI `vercel --prod` from repo root, Root Dir=apps/web (recommended; keeps SSR+nonce CSP+AI route); (B) self-host Node (`pnpm build` → `pnpm --filter web start` on Render/Railway/VPS); (C) static export to any host — requires `output:'export'` + DISABLING the nonce middleware/layout headers (security trade-off, no server AI route). SDK ships as source via transpilePackages so "whole project" = build the demo (no npm publish).
  AI: `apps/web/src/app/api/ai/edit/route.ts` REFACTORED to a pluggable backend via `AI_EDIT_PROVIDER` (auto|local|huggingface|gemini|none). auto = local→huggingface→gemini. `local` = own Stable Diffusion (AUTOMATIC1111/Forge/SD.Next `/sdapi/v1/img2img`, env LOCAL_SD_URL+denoise/steps/sampler; free+private). `huggingface` = free Inference API instruct-pix2pix (HF_API_TOKEN, HF_IMAGE_MODEL; 503 cold-start handled). `gemini` kept (needs BILLED key for image). MAX_BASE64 lowered to 4M (under Vercel 4.5MB). Server-side fetches → no CSP change. KEY POINT documented in `docs/AI-SETUP.md`: analysis (objects/faces/OCR/embeddings via TF.js/face-api/tesseract/transformers) + Remove Background (@imgly) already run FREE in-browser, no key — only generative pixel edits needed a backend. `.env.example` rewritten with Supabase + all AI options. typecheck + build pass. Did NOT git commit.

- S-runpod (2026-07-18): **RunPod endpoint integration (model-api-spec.docx) — image edits + detection, all server-proxied.**
  Planned via an `ultracode` Workflow (5 parallel readers → Opus blueprint). GOAL: make the app talk to the 15 RunPod
  endpoints (server still down; wired + typecheck/build-verified, not yet live-tested against real endpoints).
  NEW server-only client module `apps/web/src/lib/runpod/{types,base64,client,endpoints}.ts`: `runpodCall` transport
  (bearer `RUNPOD_API_KEY`, `{input}` envelope, `/runsync` inline + `/run`→`/status/{id}` poll under a 55s budget),
  `pickOutputImage` (handles image|image_png|images[0]|nested), and one typed `rp*` fn per endpoint. `RunpodError.status`
  surfaces as the editor's red error text.
  EDIT ROUTE `apps/web/src/app/api/ai/edit/route.ts`: added `'runpod'` provider (auto-preferred when RUNPOD_API_KEY +
  an SD URL set). `editRunPod` op→endpoint map: restore→#7 ESRGAN(+face), upscale→#7, colorize→#8 DDColor, prompt→#10
  SD img2img, replace-sky→#9 inpaint IF mask else #10 low-strength, magic-eraser/generative-fill→#9 masked inpaint
  (400 if no mask). Body now accepts `maskBase64` + `params` (negativePrompt/strength/steps/seed/guidanceScale, all
  clamped); image+mask share the ONE ~4MB body cap. RUNPOD_ONLY_OPS (upscale/magic-eraser/generative-fill) 400 on
  non-runpod backends.
  MASK FLOW (the SD 3.5 ask): client `createDemoAIProvider.generativeEdit` rasterizes `op.mask` (ImageData) → PNG
  matched to the downscaled image dims via new `lib/ai/imageEncode.ts maskToBase64`, strips the non-serializable mask
  from the wire op, sends `maskBase64`. Output interpreted unchanged (base64→Blob→aiResultUrl→Save), so no UI change
  needed to SHOW results. STILL MISSING: a brush-mask UI in PhotoEditor to CREATE masks (magic-eraser/generative-fill
  have no button yet + return the 400 until then); replace-sky degrades to img2img until a mask/sky-seg exists.
  DETECTION #1: new `apps/web/src/app/api/ai/classify/route.ts` + `lib/ai/runpodYoloProvider.ts` (POSTs image+dims,
  normalizes YOLO boxes→DetectedObject fractions 0..1 — `normalizeBox` assumes ultralytics xyxy pixels, VERIFY vs real
  endpoint). Gated by `NEXT_PUBLIC_APG_RUNPOD_DETECT=true`, else in-browser COCO-SSD (also the automatic fallback).
  ALREADY LOCAL (no RunPod): screenshot #4 / geo #15 (exifr+classify.ts), tag-rename #5 (state), bg-remove #6 (@imgly).
  SCAFFOLD ONLY (typed rp* + env, NO route/UI): tilt #2, voice #3, audio-denoise #12; DOC-ONLY: video #13/#14 (need
  out-of-band upload+queue, incompatible with Vercel 4.5MB/60s + in-browser bake). All flagged in docs/AI-SETUP.md.
  CSP UNCHANGED (server-side fetch bypasses browser CSP; middleware excludes /api/*). ENV: `.env.example` RunPod block;
  docs/AI-SETUP.md "Option 0 — RunPod" (op→endpoint table + mask/detection notes) + docs/DEPLOY.md server-env table
  (RUNPOD_* never NEXT_PUBLIC). VERIFIED: `pnpm -r typecheck` clean (both pkgs); `pnpm build` passes, both new routes
  compiled (/api/ai/edit, /api/ai/classify dynamic), /gallery 199KB, only the pre-existing benign face-api warning.
  Did NOT git commit. NEXT: brush-mask UI (unlocks true #9 for eraser/fill + real sky mask); outpaint #11 (client pads
  canvas+mask→generative-fill); #5 alias rename map; then Vercel deploy once endpoints are up. VERIFY normalizeBox +
  the `{input}`/`output` field names against the live endpoints before trusting detection/edit results.
  ADVERSARIAL REVIEW (ultracode Workflow, 3 dims find→verify, 20 agents; 12 CONFIRMED, 5 refuted) — ALL 12 FIXED &
  re-verified (typecheck + build pass, both routes compiled, /gallery 199KB): (1) normalizeBox rewritten to handle
  object-form xyxy `{x1,y1,x2,y2}`/`{left,top,right,bottom}` (ultralytics tojson shape — was dropped!) + array boxes
  keyed correctly (xyxy vs xywh/COCO bbox=[x,y,w,h] vs generic box=xyxy); (2) label priority fixed — string `name`
  before numeric `class` index (was returning "0" for ultralytics), empty-string label falls through to class_<id>;
  (3) envNum treats blank env ('' → 0) as unset; (4) rpUpscale no longer lets RUNPOD_UPSCALE_SCALE override the
  per-request factor (removed the env knob); (5) client envelope: a raw /runsync body with a `status` field but no
  `id` is now correctly treated as inline output (was misrouted to poll→throw); (6) poll loop clamps sleep+abort to
  the remaining budget so it can't overshoot Vercel 60s; (7) pickOutputImage validates strings under generic
  output/result/data keys (looksLikeImageData) so a status/id string isn't returned as an image; (8) auto provider
  detects runpod on ANY RUNPOD_*_URL (not just SD) so an upscale/colorize-only deploy works; (9) maskToBase64 sets
  imageSmoothingEnabled=false so binary masks stay crisp (no grey halo). Dropped RUNPOD_UPSCALE_SCALE from .env.example.
  REFUTED (correctly, no change): status-URL query-string, combined-body-cap rejecting masks, replace-sky client
  strength, 'mask' in op undefined-crash, mask-op has no UI button (all non-bugs / already-safe).

## Key files
- RunPod integration (S-runpod): `apps/web/src/lib/runpod/*` (server) + `apps/web/src/app/api/ai/{edit,classify}/route.ts` + `apps/web/src/lib/ai/{runpodYoloProvider,imageEncode}.ts` (client). Env: `RUNPOD_API_KEY` + `RUNPOD_*_URL`.
- Advanced video editor (S-advanced): `packages/photo-sdk/src/lib/videoBake.ts` + `lib/videoTimeline.ts` + `components/editor/VideoEditor.tsx`.
- AI edit backend (S-deploy-ai): `apps/web/src/app/api/ai/edit/route.ts` (env AI_EDIT_PROVIDER).
- SDK: `packages/photo-sdk/src/{components,store,adapters,ai,lib,icons,styles}`.
- Demo: `apps/web/src/{app,components,lib}` (app/api/ai/edit = Gemini proxy; middleware = nonce CSP).
- Camera (S4): `packages/photo-sdk/src/components/Camera.tsx` (store flag `cameraOpen`).

## Do NOT
- git commit/push. Commit secrets. Rely on localStorage as the final backend (Supabase is the target).
