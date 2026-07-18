# Photo Gallery Web SDK

A **reusable, macOS Photos‑style photo gallery** for React / Next.js — packaged as an
installable SDK (`@photo-gallery/sdk`). Think of it as the *shadcn of photo galleries*: drop in
one component and get a near‑pixel recreation of the macOS Photos app, in light **and** dark mode,
fully responsive from ultrawide desktops down to a Galaxy Fold.

> Original implementation. Not affiliated with, or endorsed by, Apple. All icons and assets are
> drawn from scratch.

```tsx
import { PhotoGallery } from '@photo-gallery/sdk';
import '@photo-gallery/sdk/styles.css';

export default function App() {
  return <PhotoGallery photos={myPhotos} theme="system" features={{ editor: true, map: true }} />;
}
```

---

## ✨ What's implemented

Every capability below is **optional via `features={{…}}` flags**, so a consuming app enables only
what it needs. The full, living checklist is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

### UI, library & albums
| Area | Details |
| --- | --- |
| **Faithful macOS UI** | Sidebar, Library (Years / Months / All), Collections, Map, People & Pets, Documents, Recently Deleted (locked), Shared Albums, Activity — **light / dark / semi‑dark**, with **macOS "glass" vibrancy** (backdrop‑blur menus + sidebar) |
| **Library** | Adaptive responsive grid, zoom, lazy loading, day/month/year grouping; **click toggles select**, **Select All ↔ Unselect All** |
| **Albums** | Create · rename · duplicate · delete · nested folders · covers · **Copy to / Move to Album** |
| **Smart albums** | Screenshots / Videos / Favourites / Recently Saved / RAW / Live / Panoramas / **Documents** (OCR), recomputed live |
| **Map** | Free OSM / Esri tiles (no key). **macOS thumbnail pins** with count badges + clustering; tap a pin → that location's photos date‑grouped. **Grid** tab = Memories‑style mosaic (auto‑sliding hero + irregular tiles) |
| **Import / capture** | Drag‑and‑drop & file‑picker (validated types); **custom camera** (photo/video, front/back, grid, live annotation + measurement, geolocation, auto object‑detect) |
| **Sharing** | Share a photo / selection / one‑or‑more albums → copyable link + download; **Shared Albums** + **Activity** feed |
| **Recycle bin** | 30‑day trash; **password lock** (Web Crypto, device‑local) with lock/unlock states + Settings |

### AI — all **free & in‑browser** (no API key), lazy‑loaded, pluggable
| Capability | Engine |
| --- | --- |
| **Object detection** → tags, search, Objects browser | TensorFlow.js COCO‑SSD |
| **Face clustering** → People (rename); **pet detection** → Pets | face‑api.js (128‑D descriptors) |
| **OCR** → searchable text + Documents album | tesseract.js (confidence‑filtered) |
| **Semantic search** — "show me snowy mountains" | CLIP via transformers.js |
| **Remove Background** | @imgly (in‑browser WASM) |
| **Generative edits** (restore / colorize / sky / prompt) 🔑 | Gemini (server‑proxied; needs a key) |

### Editors
| Area | Details |
| --- | --- |
| **Photo editor** | Adjust (13 sliders), 10 filters, **crop** (free + fixed‑ratio) & straighten, **markup** (rect/oval/line/arrow/double‑arrow measurement/text/freehand), AI tab — **Save** or **Save as Copy**, Cancel‑confirm |
| **Video editor** | Adjust · Filters · **Trim** · **Markup** · **Overlay** (composite an image) · **Audio** (mute + add music) — exports a new clip in‑browser (canvas + MediaRecorder + WebAudio, no ffmpeg); **Save / Save as Copy** |

### Platform
| Area | Details |
| --- | --- |
| **Backend** | Pluggable `StorageAdapter` — zero‑config localStorage/IndexedDB default, or **Supabase** (Postgres + Storage) adapter included |
| **Search** | Name / place / tag / object / **OCR text** / **semantic** — blended and relevance‑ranked |
| **Theming** | `accentColor` + `borderRadius` props; Light / Dark / Semi‑Dark / System |
| **A11y / responsive** | Keyboard nav, focus traps, reduced‑motion, ARIA; works down to ~280 px |
| **Security** | Per‑request **nonce CSP**, security headers, filename sanitisation, URL‑scheme allow‑list, server‑only API keys |

---

## 🗂 Monorepo layout

```
advance-photo-gallery-web-sdk/
├── packages/
│   └── photo-sdk/          # @photo-gallery/sdk — the reusable product
│       ├── src/
│       │   ├── components/ # PhotoGallery, Sidebar, views, editor, lightbox …
│       │   ├── store/      # Zustand store + selectors + React context
│       │   ├── adapters/   # StorageAdapter interface + localStorage default
│       │   ├── ai/         # AIProvider interface (pluggable)
│       │   ├── lib/        # classify, smart albums, grouping, edits, media, format
│       │   ├── icons/      # original SF‑style SVG icon set
│       │   └── styles/     # sdk.css (self‑contained, no Tailwind needed)
│       └── dist/           # built ESM + CJS + d.ts + styles.css (after `build:sdk`)
└── apps/
    └── web/                # Next.js demo: landing page + /gallery
```

---

## 🚀 Run it locally

**Prerequisites:** Node ≥ 20 and [pnpm](https://pnpm.io) (`corepack enable` ships it with Node).

```bash
# 1. install
pnpm install

# 2. start the demo (Next.js)
pnpm dev

# 3. open
#    http://localhost:3000          → landing page
#    http://localhost:3000/gallery  → the full gallery (40+ sample photos)
```

The demo runs with **no backend and no API keys** — sample photos come from the free Picsum
service and the map uses free OpenStreetMap/Esri tiles.

### Other scripts

```bash
pnpm build:sdk     # build the publishable SDK (dist/: ESM, CJS, types, styles.css)
pnpm build         # build SDK + production Next.js demo
pnpm start         # serve the production demo
pnpm typecheck     # type-check every package
pnpm format        # prettier
```

---

## 📦 Using the SDK in your own app

```bash
pnpm add @photo-gallery/sdk   # (after publishing, or via workspace link)
```

```tsx
'use client';
import { PhotoGallery, type MediaItem } from '@photo-gallery/sdk';
import '@photo-gallery/sdk/styles.css';

const photos = [
  { src: '/img/beach.jpg', name: 'Beach.jpg', takenAt: Date.now(), tags: ['beach'] },
];

export default function Gallery() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <PhotoGallery photos={photos} theme="system" />
    </div>
  );
}
```

> **Next.js note:** mount the gallery in a Client Component (it uses browser APIs). The demo gates
> it behind a mount check in [`apps/web/src/components/GalleryClient.tsx`](apps/web/src/components/GalleryClient.tsx).
> Import `leaflet/dist/leaflet.css` once (e.g. in your root layout) if you use the Map view.

### Key props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `photos` | `MediaItem[] \| { src, … }[]` | `[]` | Initial library; loose inputs are normalised + auto‑classified |
| `albums` | `Album[]` | `[]` | Initial user albums |
| `adapter` | `StorageAdapter` | localStorage | Persistence backend (swap for S3/DB/REST) |
| `ai` | `AIProvider \| boolean` | `false` | Object/face/caption/search/generative provider |
| `theme` | `'system' \| 'light' \| 'dark'` | `'system'` | Appearance |
| `accentColor` | `string` | `#0a84ff` | Accent colour |
| `borderRadius` | `number` | `10` | Base corner radius (px) for all rounded UI |
| `themeTokens` | `ThemeTokens` | – | Per‑theme background / gradient / opacity / sidebar colour + radius overrides |
| `features` | `Partial<GalleryFeatures>` | all on | Toggle editor / camera / ai / map / import / export / sharing |
| `showWindowChrome` | `boolean` | `false` | Render the macOS traffic‑light title bar |

### 🎨 Customization (props **or** env)

Every colour, gradient, opacity, sidebar radius, and feature flag is configurable. Pass
`themeTokens` / `features` as props, or — in the demo — set `NEXT_PUBLIC_APG_*` env vars and the
gallery reconfigures with **no code changes**. Unset values fall back to the built‑in
light / dark / semi‑dark themes. **Full list + examples: [`docs/ENV.md`](docs/ENV.md).**

```tsx
<PhotoGallery
  theme="dark"
  accentColor="#ff375f"
  themeTokens={{ bgDark: 'linear-gradient(165deg,#141018,#241426)', sidebarBgDark: 'rgba(30,20,38,0.6)', sidebarRadius: 18 }}
  features={{ camera: false, sharing: false }}
/>
```

### Custom storage backend

```ts
import type { StorageAdapter } from '@photo-gallery/sdk';

const myApiAdapter: StorageAdapter = {
  name: 'rest',
  async load() { return (await fetch('/api/library')).json(); },
  async save(state) { await fetch('/api/library', { method: 'PUT', body: JSON.stringify(state) }); },
};

<PhotoGallery adapter={myApiAdapter} />;
```

### Custom AI provider

Every method is optional and the UI degrades gracefully. Implement object detection client‑side
(TensorFlow.js), or proxy to a cloud model:

```ts
import type { AIProvider } from '@photo-gallery/sdk';

const provider: AIProvider = {
  name: 'coco-ssd',
  async detectObjects(item, image) { /* return DetectedObject[] */ return []; },
};

<PhotoGallery ai={provider} />;
```

---

## 🔒 Security

- **Strict Content‑Security‑Policy** + `X‑Frame‑Options: DENY`, `nosniff`, `Referrer‑Policy`,
  `Permissions‑Policy` (see [`apps/web/next.config.mjs`](apps/web/next.config.mjs)).
- **No `eval`, no `dangerouslySetInnerHTML`** anywhere in the SDK.
- **Import allow‑list** — only image/video MIME types and extensions are accepted.
- **Filename sanitisation** on export (path‑traversal guard).
- **Defensive persistence** — persisted state is shape‑validated before use.

---

## 🛣 Roadmap (Phase 2+)

**Live now** (all free & in‑browser unless marked 🔑):

- **Object detection** (TF.js COCO‑SSD) → tags, search, Objects browser.
- **Face clustering → People** (rename) + **pet detection → Pets** (face‑api.js).
- **OCR → searchable text + Documents album** (tesseract.js, confidence‑filtered).
- **Semantic search** — natural‑language "looks like" queries (CLIP via transformers.js).
- **Remove Background** (@imgly, in‑browser WASM).
- **Supabase backend** adapter (Postgres + Storage), alongside the zero‑config localStorage default.
- **Full video editor** (trim / filters / markup / image overlay / mute + music) exporting a new clip in‑browser.
- **Sharing** (links + Shared Albums + Activity), **password‑locked Recently Deleted**, **custom camera**.
- **Generative AI editor** 🔑 (Gemini) — the editor's **AI tab** (Restore, Colorize, Replace Sky, free‑form
  prompts). The key stays **server‑side only**: the browser calls the app's own
  [`/api/ai/edit`](apps/web/src/app/api/ai/edit/route.ts) route, which proxies to Gemini.

### Enabling the generative editor

1. Put your key in `apps/web/.env.local` (gitignored — never committed):
   ```
   GEMINI_API_KEY=your-key
   GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
   ```
2. Restart `pnpm dev`.

> **Note:** Gemini **image generation requires a billing‑enabled / paid plan**. A free‑tier key authenticates but
> returns HTTP 429 ("check your plan and billing") for image output. The editor handles this gracefully (shows the
> error, no crash); it produces images as soon as the key's project has image‑generation quota.

Still planned / not yet implemented:

- **Auth & multi‑user sharing** (real recipients, permissions). Sharing today creates device‑local links.
- **Captions** (transformers.js BLIP) and a first‑class Hugging Face Inference provider option.
- **Map** heatmaps / trips / reverse‑geocode place names; true grid **virtualization** for millions of items.
- **Server‑side** 30‑day purge (pg_cron), Storage blob deletion on permanent‑delete.
- Storybook + API docs, Docker/K8s, automated CI.

---

## 🧱 Tech

Next.js · React · TypeScript · Zustand · Framer Motion · Leaflet · TanStack Virtual · pnpm
workspaces · tsup. The SDK ships its **own self‑contained stylesheet** — Tailwind is not required by
consumers.
