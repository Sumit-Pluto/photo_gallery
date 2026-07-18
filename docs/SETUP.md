# Developer setup & run guide

## Prerequisites
- **Node ≥ 20** and **pnpm** (`corepack enable` ships pnpm with Node).
- Git Bash / PowerShell on Windows both work; macOS/Linux fine.

## Install & run
```bash
pnpm install          # installs all workspaces
pnpm dev              # Next.js demo on http://localhost:3000
#   /          → landing page (has the "Open Gallery" button)
#   /gallery   → the full gallery (40+ seeded photos/videos)
```

## Build & verify
```bash
pnpm build:sdk        # build the publishable SDK → packages/photo-sdk/dist (ESM, CJS, .d.ts, styles.css)
pnpm build            # SDK + Next production build
pnpm start            # serve the production build
pnpm typecheck        # type-check every package
pnpm format           # prettier
```

## Environment / secrets
Copy `.env.example` → `apps/web/.env.local` (gitignored — never commit). Keys are **server-side only**.

```bash
# Generative AI editor (optional). Requires a Gemini key with IMAGE-GENERATION quota (billing enabled);
# a free-tier key authenticates but returns HTTP 429 for image output.
GEMINI_API_KEY=your-key
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image

# Supabase backend (optional, planned adapter):
# NEXT_PUBLIC_SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY=...      # server-side only
```

## Using the SDK in your app
```tsx
'use client';
import { PhotoGallery } from '@photo-gallery/sdk';
import '@photo-gallery/sdk/styles.css';

<PhotoGallery
  photos={myPhotos}
  theme="system"                 // 'light' | 'dark' | 'semi-dark' | 'system'
  accentColor="#0a84ff"
  borderRadius={10}
  features={{ editor: true, camera: true, ai: true, map: true, import: true, export: true }}
  adapter={myStorageAdapter}     // optional; default = localStorage
  ai={myAIProvider}              // optional; object detection / generative edit / faces / OCR / search
/>
```
Mount in a **Client Component** (uses browser APIs). Import `leaflet/dist/leaflet.css` once if using the Map.

## Feature flags
Everything is optional. Pass `features={{ … : false }}` to hide a capability. See
[`ROADMAP.md`](ROADMAP.md) for the full list and [`ARCHITECTURE.md`](ARCHITECTURE.md) for adapters/providers.

## Project memory (important)
This repo carries its own AI/developer memory in the root — **`CLAUDE.md`** + this `docs/` folder — *not*
in any individual machine's `~/.claude`. So if another developer (or a different Claude/AI account) opens
this package, the full context, decisions and roadmap are available. Keep `docs/ROADMAP.md` updated as you
work; treat it as the authoritative status.

## Testing
Playwright (via MCP) is used for e2e checks (navigate, screenshot, console). A scripted CI suite is planned.

## Troubleshooting
- **pnpm build-scripts blocked** (esbuild/sharp/core-js): they're allow-listed in `pnpm-workspace.yaml`
  (`allowBuilds`); run `pnpm rebuild esbuild sharp` if needed.
- **Map tiles/photos blank**: check the CSP `connect-src`/`img-src` in `apps/web/src/middleware.ts`.
- **AI edit returns 429**: Gemini image generation needs billing — see Environment above.
