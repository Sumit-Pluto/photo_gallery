# Deploy everything FREE — step by step (fresh DB + storage + Vercel free domain)

Follow top to bottom. ~15 minutes. All free. No Git required.

**Two things to know first:**
- A **local Stable Diffusion model CANNOT run on Vercel** (no GPU on the free tier). On Vercel, your
  free AI is: object detection / faces / OCR / **Remove Background** (all run in the visitor's browser,
  no key) + optionally **Hugging Face** (free token) for generative edits. See Step 6.
- Vercel has no "drag a folder from File Explorer" upload for this app (it's a server app). The
  no-Git way to upload your local files is the **Vercel CLI** (Step 4). It's 4 commands.

---

## Step 1 — Create a FRESH Supabase project (database + storage)

1. Go to <https://supabase.com> → **Start your project** → sign in (GitHub or email).
2. **New project**: pick a name (e.g. `photo-gallery`), a **region near you**, set a **database
   password** (save it somewhere), plan = **Free**. Click **Create**. Wait ~2 minutes.

## Step 2 — Create the tables + storage bucket (one SQL paste)

1. In the project, left sidebar → **SQL Editor** → **New query**.
2. Open the file `docs/supabase-setup.sql` from this project, **copy ALL of it**, paste into the query
   box, and click **Run**. You should see "Success."
   - This creates the metadata tables, the demo access policies, **and the public `media` storage
     bucket** (the bucket is what makes uploaded/edited/captured files survive a reload).
3. Verify: left sidebar → **Storage** → you should see a bucket named **`media`** marked **Public**.

## Step 3 — Copy your Supabase keys

Left sidebar → **Project Settings** (gear) → **API**. Copy these two (keep the tab open):

- **Project URL** → e.g. `https://abcd1234.supabase.co`
- **Project API keys → `anon` `public`** → a long string

(Never use the `service_role` key in the app — only the `anon` key belongs in the browser.)

## Step 4 — Deploy to Vercel with the CLI (uploads your local files, no Git)

Open a terminal (PowerShell) **in the project folder** `d:\advance-photo-gallery-web-sdk`.

```powershell
# 4a. Sanity build (optional but recommended)
pnpm install
pnpm build

# 4b. Install the Vercel CLI and log in (free account)
npm i -g vercel        # if this errors on permissions, use:  npx vercel   (in place of "vercel" below)
vercel login           # opens the browser to sign in

# 4c. Deploy — run this from the REPO ROOT (d:\advance-photo-gallery-web-sdk)
vercel
```

Answer the `vercel` prompts:
| Prompt | Answer |
|---|---|
| Set up and deploy "…"? | **Y** |
| Which scope? | your account |
| Link to existing project? | **N** |
| What's your project's name? | e.g. `photo-gallery` |
| In which directory is your code located? | **`apps/web`**  ← important |
| Auto-detected settings (Next.js) — override? | **N** |

It builds and gives you a **Preview URL**. (Monorepo note: pointing the directory at `apps/web` makes
Vercel auto-install the whole pnpm workspace, including the SDK — nothing extra to do.)

## Step 5 — Add your keys, then deploy to production

1. Go to <https://vercel.com> → your project → **Settings → Environment Variables**. Add (for
   **Production** and **Preview**):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL from Step 3 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key from Step 3 |
   | `NEXT_PUBLIC_SUPABASE_BUCKET` | `media` |

2. Back in the terminal, deploy to production:
   ```powershell
   vercel --prod
   ```
3. Vercel prints your **free domain**: `https://<your-project>.vercel.app`. That's your live site.
   (Rename it under **Settings → Domains** if you like — still free.)

> To redeploy later after changing code: just run `vercel --prod` again. No Git, ever.

## Step 6 — (Optional) Free generative-edit AI on Vercel

Analysis + Remove Background already work with **no key**. For the generative edits (Restore /
Colorize / Replace-Sky / Prompt) on Vercel, add a **free Hugging Face** token:

1. <https://huggingface.co/settings/tokens> → **New token** (read scope) → copy it.
2. Vercel → Settings → Environment Variables, add:
   | Name | Value |
   |---|---|
   | `AI_EDIT_PROVIDER` | `huggingface` |
   | `HF_API_TOKEN` | `hf_...` (your token) |
3. `vercel --prod` again.

(First use may say "model loading — try again in ~20s"; that's the free tier warming up.)
**Prefer your own local Stable Diffusion?** It can't live on Vercel — run it on your PC and expose it
with a tunnel (`cloudflared`/`ngrok`), then set `LOCAL_SD_URL` to the tunnel URL. Full details:
[`docs/AI-SETUP.md`](./AI-SETUP.md). If you add nothing, generative edits just show a "not configured"
note and everything else works.

## Step 7 — Verify

Open your `*.vercel.app` URL and check:
- The gallery loads (0 errors).
- Import a photo (Add photos → Choose files) → **hard-reload** → it's still there (it saved to
  Supabase). Storage → the `media` bucket now has files; Table editor → `gallery_media` has rows.
- Edit a photo twice → Info panel shows **Version 3**; comments + versions survive reload.

---

## If a deploy fails

- **"Cannot find module @photo-gallery/sdk"** → the Root Directory wasn't set to `apps/web`. Fix:
  Vercel → Settings → **Build & Deployment → Root Directory = `apps/web`** (and ensure "Include files
  outside the root directory" is on — Vercel usually auto-enables it for pnpm workspaces). Redeploy.
- **Build can't find pnpm** → Vercel → Settings → General → set install to `pnpm install` (it detects
  `pnpm-lock.yaml` automatically if present at the repo root — make sure that file exists).
- **Images vanish after reload** → the Supabase env vars aren't set (Step 5), or Step 2's SQL wasn't
  run so the `media` bucket is missing.
- **Gemini image edit fails** → the free Gemini tier is text-only; switch to `AI_EDIT_PROVIDER=huggingface`
  (Step 6) or run local SD.

---

## Want a literal drag-and-drop (File Explorer) upload instead?

That only works for a **static** build, which needs code changes (disabling the per-request security
CSP) and loses the server AI route — see **Option C** in [`docs/DEPLOY-MANUAL.md`](./DEPLOY-MANUAL.md).
The Vercel CLI above is strongly recommended instead: it uploads your files without Git and keeps the
app fully working (persistence, security, AI route).
