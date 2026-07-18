# Architecture

## Monorepo
```
packages/photo-sdk/   # the product (React + TS, self-contained CSS, no ML deps)
  src/
    components/       # PhotoGallery, AppShell, Sidebar, TopToolbar, views/, editor/, Lightbox,
                      # MediaGrid, PhotoTile, ContextMenu, Modal, SelectionBar, AIAnalyzer, AnnotationLayer
    store/            # Zustand store (createGalleryStore) + selectors + React context
    adapters/         # StorageAdapter interface + localStorage default (Supabase planned)
    ai/               # AIProvider interface (detect/faces/ocr/caption/embed/generativeEdit) + helpers
    lib/              # classify, smartAlbums, grouping, edits, media (import/EXIF), format, download
    icons/            # original SF-style SVG set
    styles/sdk.css    # design tokens (light/dark/semi-dark) + components, prefixed .apg-
apps/web/             # Next.js demo
  src/app/            # landing, /gallery, /api/ai/edit (Gemini proxy), layout, middleware (nonce CSP)
  src/lib/ai/         # tensorflowProvider (coco-ssd), createDemoAIProvider (+ Gemini generativeEdit)
  src/lib/seed.ts     # demo dataset (Picsum images + local video + synthetic metadata)
```

## Data flow
`<PhotoGallery>` → creates a per-instance Zustand store → `GalleryProvider` (context) → `AppShell` →
Sidebar + Toolbar + `ViewRouter`. The store holds media/albums/people/selection/view/theme/AI status.
A pluggable `StorageAdapter` loads/saves state (debounced). Inputs are normalized + sanitized through
`normalizeMediaItem` (URL-scheme allow-list, string coercion) on both the `photos` prop and adapter load.

## Adapters (storage) — all optional
`StorageAdapter = { name, load(), save(state), putBlob?(id, blob), clear?() }`.
- Default: `createLocalStorageAdapter()` (metadata in localStorage, blobs in IndexedDB).
- Planned: Supabase (Postgres + Storage), S3/R2/GCS/Azure/MinIO, REST/GraphQL. Swap via the `adapter` prop.

## AI providers — all optional, free unless noted
`AIProvider` methods (each optional): `detectObjects`, `detectFaces`, `caption`, `ocr`, `embedImage`,
`embedText`, `generativeEdit`. The SDK ships **no ML deps**; providers are injected by the host:
- `tensorflowProvider` (COCO-SSD) — free, in-browser object detection.
- `createDemoAIProvider` — combines detection + Gemini `generativeEdit` (proxied through `/api/ai/edit`).
- Planned: face-api.js (faces), tesseract.js (OCR), transformers.js / Hugging Face (semantic search, captions).
`AIAnalyzer` (headless) runs detection across the library and writes `objects`/`objectLabels` back.

## Theming
CSS variables on `.apg[data-theme]`. Themes: `light`, `dark`, `semi-dark` (glass sidebar + light content).
Customizable via props → CSS vars: `--apg-accent`, `--apg-radius*`. All feature toggles via `features`.

## Security
Per-request **nonce CSP** in `apps/web/src/middleware.ts` (`script-src 'self' 'nonce-…' 'strict-dynamic'`,
no `unsafe-inline`), plus X-Frame-Options/nosniff/Referrer/Permissions-Policy. API keys are server-side
only (read in route handlers; never `NEXT_PUBLIC_`). Imports are type/scheme validated.

See [`ROADMAP.md`](ROADMAP.md) for status of every capability.
