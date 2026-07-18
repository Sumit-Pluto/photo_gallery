# Requirements backlog (complete)

Status: ✅ done · 🚧 in progress · ⬜ planned · 🔑 needs key/creds. Cross-ref `/docs/ROADMAP.md`.

## Done (Phases 1–3)
- ✅ macOS-Photos UI: sidebar, toolbar, Library (Years/Months/All), Collections, Map (map/satellite/grid),
  People, Recently Deleted (locked), lightbox, light/dark/**semi-dark**, responsive to 280px, a11y, nonce CSP.
- ✅ Albums (CRUD/nested/smart), source auto-classify, recycle bin, duplicates, multi-select, import (file+drag),
  export, **EXIF** (GPS/date/camera) on import.
- ✅ Object detection (TF.js, free) → tags/search/find-similar/**Objects browser**/object focus.
- ✅ Annotations (rect/oval/line/arrow/**double-arrow measurement**/text/freehand + colors) in editor + lightbox.
- ✅ Info panel (full metadata + **mini-map**). Themes menu + `accentColor`/`borderRadius` props.
- ✅ Gemini generative editor (Remove BG/Restore/Colorize/Replace Sky/prompt) — 🔑 needs billed key (free=429).

## Now / next (in user's priority order)
1. 🚧 **Custom camera** (#1): getUserMedia preview; capture photo; record video; switch front/back; grid;
   **live annotation + measurement**; geolocation on capture (permission); auto object-detect after capture.
2. ⬜ **Supabase backend + storage** (#last, 🔑): Postgres data + Supabase Storage. **No localStorage reliance** —
   backend is the source of truth. Ask user for creds (URL, anon key, service-role key, bucket) with steps.
3. ⬜ Face clustering → People; OCR (tesseract.js) → document search; semantic "show me beach photos"
   (transformers.js / Hugging Face CLIP) — all free, in-browser.
4. ⬜ Video editor + annotations; macOS-parity player polish.

## New requests (this session — must add)
- ⬜ **Editor: straighten / tilt** (angle slider) — rotate by arbitrary degrees.
- ⬜ **Crop: free-form AND fixed-ratio** — when a ratio (e.g. 1:1 square) is selected, dragging/stretching the
  crop box keeps that aspect ratio; also free crop.
- ⬜ **Import sync of existing metadata**: if an imported/mobile image already has tags (IPTC/XMP keywords) +
  location + details, read and apply them (exifr supports XMP/IPTC). Keep object detection + object albums.
- 🚧 **Web-meaningful UI** (deep pass): "All Projects" → **"All Albums"** (this is a web gallery, not iOS);
  remove "Open App Store" (meaningless on web); review sidebar tabs, **corner radius**, touch-ups so everything
  is meaningful for a web gallery and matches macOS more closely.
- ⬜ **Search dropdown defaults**: show quick filters **Recently Viewed**, **Recently Edited** (+ Recently Shared)
  when the search field is focused.
- ⬜ **Info → map click opens full Map** centered on that photo's location.
- ⬜ **Map parity w/ macOS**: locations + images + tags; latest image shown for a tag; **click a tag → open
  that tag's images grouped by date** (date-wise). Tag = album-like view, date-grouped.
- ⬜ **Local-model fallback**: if Gemini key missing/invalid, use a local model. Concretely wire
  `@imgly/background-removal` (free, in-browser) for Remove Background so it always works without a key.
- ⬜ **Everything free**; build our own if no free option.
- ✅ **Memory in project `.claude/` folder** (this folder) — done.
- ⬜ More **advanced features** (open-ended; user will add more later).

## Notes
- getUserMedia needs HTTPS or localhost (dev OK). Permissions-Policy already allows camera/mic/geolocation=self.
- When Supabase is wired, switch the demo adapter from localStorage → Supabase and drop localStorage reliance.
