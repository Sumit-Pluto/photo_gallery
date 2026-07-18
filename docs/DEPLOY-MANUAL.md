# Manual deployment (no Git) — the whole project (SDK + demo)

Use this when you want to deploy **without pushing to GitHub** — uploading the project straight from
your machine. The monorepo ships the SDK (`packages/photo-sdk`) as TypeScript **source** that the demo
compiles at build time (via Next's `transpilePackages`), so "the whole project" is just: build the
demo, which pulls in the SDK automatically. You do **not** publish the SDK to npm.

Three options, easiest first. **Option A (Vercel CLI) is recommended** — it's a genuine manual upload
(no Git), and it correctly runs this app's server features (per-request nonce CSP, dynamic rendering,
the `/api/ai/edit` route).

---

## Prerequisites (all options)

```bash
pnpm install          # once, at the repo root — links the SDK workspace
pnpm build            # sanity check: SDK (tsup) + Next production build both succeed
```

Set up Supabase first (tables + the public `media` bucket) — see [`docs/DEPLOY.md`](./DEPLOY.md) §1.
Have your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` ready.

---

## Option A — Vercel CLI (manual upload, no Git) ✅ recommended

Uploads your local files directly to Vercel. No repository required.

```bash
# 1. Install the CLI and sign in
npm i -g vercel
vercel login

# 2. From the REPO ROOT (so the SDK workspace + lockfile are included):
cd d:/advance-photo-gallery-web-sdk
vercel link            # create/link a project (first time only)
```

When `vercel link` / the first `vercel` run prompts:
- **Set up and deploy?** → Yes
- **Which scope?** → your account
- **Link to existing project?** → No → give it a name
- **In which directory is your code located?** → `./`
- It detects Next.js. If it asks for **Root Directory**, set **`apps/web`**.
  (Or set it later: Vercel dashboard → Project → Settings → **Root Directory = `apps/web`**.)

```bash
# 3. Add environment variables (or paste them in the dashboard → Settings → Env Vars)
vercel env add NEXT_PUBLIC_SUPABASE_URL          # paste your Project URL,  choose Production+Preview
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY     # paste your anon key
# optional: NEXT_PUBLIC_SUPABASE_BUCKET (default "media"), and any AI keys (see docs/AI-SETUP.md)

# 4. Deploy to production
vercel --prod
```

Vercel prints a live URL. Re-run `vercel --prod` anytime to redeploy the current local code — still no
Git involved. Uploads honor `.gitignore`/`.vercelignore`, so `node_modules`, `.next`, `.env.local`
are not uploaded (Vercel installs + builds on its side).

> Netlify equivalent: `npm i -g netlify-cli`, `netlify deploy --build --prod` with the
> `@netlify/plugin-nextjs` runtime and Base directory `apps/web`.

---

## Option B — Self-host on a Node server (manual upload / any Node host)

For a VPS, Render, Railway, Fly.io, or your own box. This runs `next start` (a Node server), which
fully supports the SSR + CSP middleware.

```bash
# On your machine:
pnpm install
pnpm build                      # builds the SDK + apps/web/.next
```

Then run the demo as a Node process on the host:

```bash
# The app must run from apps/web with production env vars set:
cd apps/web
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... pnpm start   # = next start -p 3000
```

**What to upload** to the host (if copying files manually rather than building on the host): the whole
repo, then run `pnpm install && pnpm build && pnpm --filter web start` there. The simplest reliable
recipe is "clone/copy the repo → `pnpm install` → `pnpm build` → `pnpm --filter web start`", because
`.next` and `node_modules` are environment-specific and shouldn't be copied between machines.

- **Render / Railway:** create a **Web Service**, Root = repo, Build = `pnpm install && pnpm build`,
  Start = `pnpm --filter web start`, add the env vars. (Both have a free tier; some CLIs also allow
  direct upload without Git.)
- **Port:** hosts set `$PORT`; use `next start -p $PORT` if required.

---

## Option C — Static export to ANY static host (drag-and-drop) ⚠️ trade-off

If you want to drop a plain folder onto cheap static hosting (Netlify Drop, GitHub Pages, cPanel,
S3…), the app must be exported as static HTML. **This app can't be exported as-is** because it uses a
**per-request nonce Content-Security-Policy** (middleware + dynamic rendering), which requires a
server. To static-export you must **disable that nonce CSP** — a real security downgrade. Only do this
for a throwaway/offline demo, and prefer Option A/B for anything real.

If you accept the trade-off:

1. `apps/web/next.config.mjs` → add `output: 'export'` and `images: { unoptimized: true }`.
2. Remove the dynamic-nonce coupling: delete/neutralize `apps/web/src/middleware.ts` and remove the
   `headers()`/nonce usage in `apps/web/src/app/layout.tsx` (static export can't read per-request
   headers). Optionally add a **static** CSP via `<meta http-equiv="Content-Security-Policy">` instead
   — weaker than the nonce CSP.
3. The Gemini/AI **API route won't exist** in a static export (`/api/ai/edit` is a server route). The
   free **in-browser** AI (object detection, faces, OCR, background-removal) still works; hosted
   generative edits do not. See [`docs/AI-SETUP.md`](./AI-SETUP.md) for a fully client-side/local AI
   setup that needs no server route.
4. Build the static site:
   ```bash
   pnpm build
   # output: apps/web/out  ← upload THIS folder to any static host / drag-drop
   ```
5. Upload `apps/web/out/` to your host.

> Because Supabase is reached directly from the browser (anon key + RLS), persistence still works from
> a static host — you only lose the server-side AI route and the strict nonce CSP.

---

## Which should I use?

| Need | Use |
|---|---|
| Fastest real deploy, no Git, keeps security + AI route | **A — Vercel CLI** |
| Your own server / full control | **B — Self-host Node** |
| Must drag a folder to cheap static hosting | **C — Static export** (weaker CSP, no server AI) |

For all options, everything the app stores (photos, videos, tags, versions, comments, albums, edited
copies) persists to **your** Supabase project — see [`docs/DEPLOY.md`](./DEPLOY.md) for the data model
and the required SQL.
