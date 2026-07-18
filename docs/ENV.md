# Environment variables — customizing the gallery

The demo (`apps/web`) reads `NEXT_PUBLIC_APG_*` variables at build time and passes them
to `<PhotoGallery>`. **Everything is optional** — anything you don't set falls back to the
SDK's built-in defaults (the macOS‑style light / dark / semi‑dark themes).

Put these in `apps/web/.env.local` (gitignored) and restart `pnpm dev`.

> Because Next.js only inlines `NEXT_PUBLIC_*` variables that are referenced statically, the
> demo reads each one explicitly in [`apps/web/src/lib/galleryConfig.ts`](../apps/web/src/lib/galleryConfig.ts).
> If you add a new token, add it there too.

---

## Feature flags — show/hide any capability

Each accepts `true` / `false` (or `1` / `0`). Unset = enabled (SDK default).

| Variable | Controls |
| --- | --- |
| `NEXT_PUBLIC_APG_EDITOR` | Photo + video editor |
| `NEXT_PUBLIC_APG_CAMERA` | Custom camera (capture / record) |
| `NEXT_PUBLIC_APG_AI` | In-browser AI (objects / faces / OCR / semantic) |
| `NEXT_PUBLIC_APG_MAP` | Map view |
| `NEXT_PUBLIC_APG_IMPORT` | Upload / import |
| `NEXT_PUBLIC_APG_EXPORT` | Download / export |
| `NEXT_PUBLIC_APG_SHARING` | Share links + Shared Albums + Activity |

```bash
# e.g. ship a viewer-only gallery (no editing, no camera, no uploads)
NEXT_PUBLIC_APG_EDITOR=false
NEXT_PUBLIC_APG_CAMERA=false
NEXT_PUBLIC_APG_IMPORT=false
```

## Theme & appearance

| Variable | Type | Maps to |
| --- | --- | --- |
| `NEXT_PUBLIC_APG_THEME` | `system` \| `light` \| `dark` \| `semi-dark` | Initial theme |
| `NEXT_PUBLIC_APG_ACCENT` | color | Accent (buttons, highlights, focus) |
| `NEXT_PUBLIC_APG_RADIUS` | px number | Base corner radius for all rounded UI |
| `NEXT_PUBLIC_APG_SIDEBAR_RADIUS` | px number | Sidebar panel corner radius |
| `NEXT_PUBLIC_APG_BG_LIGHT` / `_DARK` | color **or gradient** | App / content background |
| `NEXT_PUBLIC_APG_ELEVATED_LIGHT` / `_DARK` | color | Cards / raised surfaces |
| `NEXT_PUBLIC_APG_SIDEBAR_BG_LIGHT` / `_DARK` | color (rgba for opacity) | Sidebar glass backdrop |
| `NEXT_PUBLIC_APG_TEXT_LIGHT` / `_DARK` | color | Primary text |

- **Gradients**: any `_BG_*` value may be a full CSS gradient, e.g.
  `linear-gradient(160deg,#1a1a2e,#16213e)`.
- **Opacity**: use `rgba(...)` (or `#rrggbbaa`) for translucency, e.g. a more/less see-through
  sidebar: `NEXT_PUBLIC_APG_SIDEBAR_BG_DARK=rgba(20,20,22,0.55)`.
- Light values apply in **light** + **semi‑dark** (content); dark values apply in **dark** mode
  and to the **semi‑dark sidebar**.

### Example — branded dark gallery with a gradient background

```bash
NEXT_PUBLIC_APG_THEME=dark
NEXT_PUBLIC_APG_ACCENT=#ff375f
NEXT_PUBLIC_APG_RADIUS=14
NEXT_PUBLIC_APG_SIDEBAR_RADIUS=18
NEXT_PUBLIC_APG_BG_DARK=linear-gradient(165deg,#141018,#241426)
NEXT_PUBLIC_APG_SIDEBAR_BG_DARK=rgba(30,20,38,0.6)
NEXT_PUBLIC_APG_ELEVATED_DARK=#2a2030
```

## Using the tokens directly (without env)

If you embed the SDK yourself, pass the same values as props — no env needed:

```tsx
<PhotoGallery
  theme="dark"
  accentColor="#ff375f"
  themeTokens={{
    bgDark: 'linear-gradient(165deg,#141018,#241426)',
    sidebarBgDark: 'rgba(30,20,38,0.6)',
    sidebarRadius: 18,
  }}
  features={{ camera: false }}
/>
```
