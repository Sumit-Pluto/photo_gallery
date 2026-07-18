# Deploying for free (Vercel + Supabase free tier)

This app runs 100% on free tiers: **Vercel Hobby** (Next.js hosting) + **Supabase Free**
(Postgres for metadata + Storage for the media files). No paid services are required.
The in-browser AI (object detection, faces, OCR) runs on the user's device for free; only the
optional Gemini generative edit needs a key (and can be left off).

> TL;DR — run the SQL once, push to GitHub, import into Vercel with **Root Directory = `apps/web`**,
> set the two `NEXT_PUBLIC_SUPABASE_*` env vars, deploy. Everything (photos, videos, tags, versions,
> comments, albums, edited copies) then persists to your Supabase project.

---

## 1. Supabase (database + file storage)

1. Create a project at <https://supabase.com> (free tier).
2. Open **SQL Editor → New query**, paste all of [`docs/supabase-setup.sql`](./supabase-setup.sql),
   and **Run**. This creates the metadata tables, the demo RLS policies, **and the public `media`
   storage bucket** (the bucket is what makes uploaded/edited/captured files survive a reload —
   without it the app silently falls back to non-durable URLs).
3. Confirm **Storage** now lists a bucket named `media` marked **Public**.
4. **Project Settings → API** → copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Never use the `service_role` key in the client — it stays server-side only, if used at all.)

> Free-tier note: a Supabase project **pauses after ~7 days idle**. Open the dashboard to unpause
> before a demo. Storage free tier is 1 GB, Postgres 500 MB — plenty for a demo library.

## 2. Push the repo to GitHub

Commit everything **including `pnpm-lock.yaml`** at the repo root (Vercel uses it to detect pnpm and
install the whole workspace). Do not commit `.env.local` (it's gitignored).

## 3. Vercel

1. <https://vercel.com> → **Add New → Project** → import your GitHub repo.
2. **Configure the project:**
   | Setting | Value |
   |---|---|
   | **Root Directory** | `apps/web` |
   | **Framework Preset** | Next.js (auto-detected) |
   | **Install Command** | `pnpm install` (default) |
   | **Build Command** | `next build` (default) |
   | **Output** | `.next` (default) |
   | **Node.js Version** | 20.x |

   > No separate SDK build step is needed: `@photo-gallery/sdk` is consumed from TypeScript source
   > via Next's `transpilePackages`, so `pnpm install` (which links the workspace) is enough.

3. **Environment Variables** (Project → Settings → Environment Variables), for Production + Preview:

   **Client (safe to expose — required for persistence):**
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key |
   | `NEXT_PUBLIC_SUPABASE_BUCKET` | `media` *(optional; default is `media`)* |

   **Server-only (optional — do NOT prefix with `NEXT_PUBLIC`):**
   | Name | Value |
   |---|---|
   | `AI_EDIT_PROVIDER` | `runpod` *(or `local` / `huggingface` / `gemini` / `auto`)* |
   | `RUNPOD_API_KEY` | your RunPod API key *(shared by every RunPod endpoint)* |
   | `RUNPOD_SD_IMG2IMG_URL` | #10 prompt endpoint URL *(…/runsync)* |
   | `RUNPOD_SD_INPAINT_URL` | #9 masked sky/eraser/fill endpoint URL |
   | `RUNPOD_UPSCALE_URL` | #7 restore/upscale endpoint URL |
   | `RUNPOD_COLORIZE_URL` | #8 colorize endpoint URL |
   | `RUNPOD_YOLO_URL` | #1 detection endpoint URL *(+ `NEXT_PUBLIC_APG_RUNPOD_DETECT=true`)* |
   | `GEMINI_API_KEY` | a Gemini key *(alternative generative-edit backend)* |
   | `GEMINI_IMAGE_MODEL` | `gemini-2.5-flash-image` *(optional)* |

   The RunPod URLs and `RUNPOD_API_KEY` are read **only** in the `/api/ai/*` route handlers (server
   side) — never send them to the browser (no `NEXT_PUBLIC_` prefix). Full endpoint map + the op →
   endpoint table is in [`docs/AI-SETUP.md`](./AI-SETUP.md). Without the Supabase vars the app still
   runs on browser-local storage; without any AI-edit provider the generative-edit route returns 503
   while all the free in-browser AI (detection, faces, OCR, background removal) keeps working.

   Optional theming/feature flags (`NEXT_PUBLIC_APG_*`) are documented in [`docs/ENV.md`](./ENV.md).

4. **Deploy.**

## 4. Verify after the first deploy

- Response headers include a per-request `content-security-policy` with a `nonce-…` (confirms the
  nonce CSP middleware works on Vercel — expected; the app renders dynamically, not as a static export).
- Import a photo → its `src` becomes a `https://<project>.supabase.co/...` URL → **hard-reload**: it
  still shows. Same for a camera capture and an edited copy.
- Edit a photo twice → the Info panel shows **Version 3**; reload → history + comments persist.
- The **Objects** sidebar section fills in as on-device detection tags photos.

## What persists to the database

Everything is stored as JSONB per item (`gallery_media.data`) + binaries in Storage, so a reload
restores it all: **tags, detected objects/labels, faces, versions[] (full edit history + audit log),
comments[], albums, favorites, edits, and Save-as-Copy items** (each copy is a new row with its own
2-entry history). System/smart albums (incl. the auto **object albums**) are regenerated on load, so
they're intentionally not stored.

## Gotchas / limits (free tier)

- **AI edit + Vercel body limit:** Vercel Hobby caps request bodies at ~4.5 MB. The AI-edit route is
  capped accordingly and large images are downscaled client-side first (≤1280 px). For masked SD 3.5
  ops the **image + mask share one body**, so they're budgeted together; a mask PNG is mostly flat
  black/white and compresses small, so this holds. Very large images may still be rejected. Prefer
  RunPod `/runsync` endpoints so a job returns within the 60 s function limit. The free in-browser AI
  is unaffected.
- **Single-user demo:** the Supabase adapter does a full-state sync (no auth). For multi-user, add
  Supabase Auth and scope rows per user before going to production (the RLS policies are open for the
  demo — tighten them with `auth.uid()`).
- **In-browser video export** (trim/overlays/watermark/etc.) requires the source video to be readable
  for canvas capture. Same-origin (Supabase Storage with CORS, which is on by default) works; a
  cross-origin host without CORS headers can't be exported in-browser (the editor now surfaces a clear
  error instead of failing silently).
- **Heavy AI libs** (TensorFlow.js / face-api / tesseract / transformers / imgly) are dynamically
  imported on the client only — they don't bloat the server bundle, but first analysis downloads model
  weights (cached afterwards).
