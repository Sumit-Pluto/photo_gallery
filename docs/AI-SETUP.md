# AI setup — free & local (no paid Gemini required)

The gallery's AI splits into two groups. **Group 1 already runs for free, on-device, with no API key.**
Only **Group 2** (generative pixel editing) ever needed Gemini — and that backend is now swappable to
a free or fully-local model.

---

## Group 1 — Analysis & background removal — FREE, LOCAL, no key ✅

These run entirely in the user's browser (models download once, then cached). Nothing is sent to any
server; no key or config is required. This is the bulk of "AI" in the app:

| Capability | Runs on | Library |
|---|---|---|
| Object detection → tags, Objects browser, auto object albums | in-browser (WebGL/WASM) | TensorFlow.js COCO-SSD |
| Face detection + recognition → People clustering | in-browser | face-api.js |
| OCR (text in images) → search + Documents album | in-browser | tesseract.js |
| Semantic search / captions embeddings | in-browser | transformers.js (CLIP) |
| **Remove Background** (editor) | in-browser (WASM) | @imgly/background-removal |

So imported photos get the **same analysis as captured ones**, and Remove Background works, **without
Gemini or any key**. If you deploy with no AI keys at all, everything here still works.

---

## Group 2 — Generative pixel editing — pick a free or local backend

These edits *generate new pixels* from a prompt: **Restore, Colorize, Replace Sky, and free-form
Prompt**. Pick a backend with the `AI_EDIT_PROVIDER` env var (default `auto`). The server route
(`/api/ai/edit`) proxies to it so no key ever reaches the browser.

`auto` chooses the first configured of: **runpod → local → huggingface → gemini**.

### Option 0 — RunPod serverless GPU endpoints (each model is its own endpoint) 🚀

This is the production backend for the models in `model-api-spec.docx`. Each model runs as a
separate RunPod endpoint; the app proxies to them **server-side** (`/api/ai/edit`,
`/api/ai/classify`) so `RUNPOD_API_KEY` and the URLs are **never** exposed to the browser.

```env
AI_EDIT_PROVIDER=runpod
RUNPOD_API_KEY=rpa_xxxxxxxx
RUNPOD_SD_IMG2IMG_URL=https://api.runpod.ai/v2/<id>/runsync   # #10
RUNPOD_SD_INPAINT_URL=https://api.runpod.ai/v2/<id>/runsync   # #9
RUNPOD_UPSCALE_URL=https://api.runpod.ai/v2/<id>/runsync      # #7
RUNPOD_COLORIZE_URL=https://api.runpod.ai/v2/<id>/runsync     # #8
RUNPOD_BG_REMOVE_URL=https://api.runpod.ai/v2/<id>/runsync    # #6 (optional; default is in-browser @imgly)
RUNPOD_YOLO_URL=https://api.runpod.ai/v2/<id>/runsync         # #1 (also set NEXT_PUBLIC_APG_RUNPOD_DETECT=true)
```

**Which editor action hits which endpoint** (the app maps them for you):

| Editor action | `op.type` | RunPod endpoint | Notes |
|---|---|---|---|
| Restore & Enhance | `restore` | #7 Real-ESRGAN (`RUNPOD_UPSCALE_URL`) | ×4 + face-enhance |
| Upscale | `upscale` | #7 Real-ESRGAN | ×2 / ×4 (`op.factor`) |
| Colorize | `colorize` | #8 DDColor (`RUNPOD_COLORIZE_URL`) | |
| Apply Prompt | `prompt` | #10 SD 3.5 img2img (`RUNPOD_SD_IMG2IMG_URL`) | whole-image, no mask |
| Replace Sky | `replace-sky` | #9 SD 3.5 inpaint **if a mask is sent**, else #10 img2img (low strength) | see masking below |
| Magic Eraser | `magic-eraser` | #9 SD 3.5 inpaint (`RUNPOD_SD_INPAINT_URL`) | **mask required** |
| Generative Fill | `generative-fill` | #9 SD 3.5 inpaint | **mask + prompt required** |

**Endpoint I/O contract:** the app POSTs `{ input: { image, mask?, prompt?, strength?, guidance_scale?,
num_inference_steps?, seed?, … } }` and reads the image back from `output` (any of `image`,
`image_png`, `images[0]`). Deploy your handlers to accept that `input` shape (or adjust
`apps/web/src/lib/runpod/endpoints.ts`). `/runsync` is preferred; `/run` + `/status/{id}` polling is
supported as a fallback but must finish inside Vercel's 60 s function limit.

**Masking (SD 3.5 #9):** masked ops send a `maskBase64` PNG **the same pixel size as the image**
(white = regenerate, black = keep). The client rasterizes the editor's `ImageData` mask to match the
downscaled image automatically (`apps/web/src/lib/ai/imageEncode.ts` → `maskToBase64`). **Magic
Eraser / Generative Fill therefore need a selection** — until a brush-mask UI is added to the editor
they return a clear "needs a mask/selection" error; **Replace Sky** works today by degrading to a
low-strength img2img (#10) when no mask is present (add sky-segmentation or a drawn mask to get true
masked #9).

**Detection (#1):** set `NEXT_PUBLIC_APG_RUNPOD_DETECT=true` to route object detection to the YOLO
construction-material classifier via `/api/ai/classify`; it falls back to in-browser COCO-SSD if the
endpoint is unreachable. Verify the box format in `endpoints.ts` (`normalizeBox`) against your model —
it assumes ultralytics `xyxy` pixel coordinates.

**Already local (no RunPod needed):** screenshot detection (#4), EXIF geolocation (#15), and the tag
rename lookup (#5) run in the app/browser — see `lib/classify.ts`, `lib/media.ts`. Background removal
(#6) also runs free in-browser by default.

**Not yet wired (typed client + env only):** camera tilt (#2), voice-to-text (#3), audio denoise
(#12), and video frame-rate/resolution (#13/#14) have `rp*` functions in `endpoints.ts` and env vars,
but **no route or UI** — they have no consuming feature yet. #13/#14 in particular need an out-of-band
pipeline (presigned upload → async job → webhook), because per-frame video can't fit Vercel's 4.5 MB
body / 60 s limits or the in-browser video export path. Add these when the corresponding feature is scheduled.

### Option 1 — Your own local Stable Diffusion (free + private, recommended) 🏆

Run Stable Diffusion locally with any of **AUTOMATIC1111 WebUI**, **Forge**, or **SD.Next** — they all
expose the same `img2img` HTTP API. Start it with the API enabled:

```bash
# AUTOMATIC1111 example
./webui.sh --api --listen        # serves http://127.0.0.1:7860
```

Then set on the app server:

```env
AI_EDIT_PROVIDER=local
LOCAL_SD_URL=http://127.0.0.1:7860
# optional tuning:
LOCAL_SD_DENOISE=0.55     # 0=keep original … 1=fully reimagine
LOCAL_SD_STEPS=25
LOCAL_SD_SAMPLER=Euler a
```

100% free, unlimited, private (nothing leaves your machine), and works for every generative op. Needs
a machine with a GPU (or a slow CPU). This is the best "own model, everything free" path.

> Deploying to Vercel? A serverless function can't reach your `localhost`. Either run the whole app on
> the same box as SD (Option B in [DEPLOY-MANUAL.md](./DEPLOY-MANUAL.md)), or expose your SD box over a
> tunnel (e.g. `cloudflared`, `ngrok`) and point `LOCAL_SD_URL` at the public URL.

### Option 2 — Hugging Face Inference API (free hosted, zero GPU) 

Free token, no GPU needed. Uses an instruction image-editing model.

1. Create a free token at <https://huggingface.co/settings/tokens> (read scope is fine).
2. Set:
   ```env
   AI_EDIT_PROVIDER=huggingface
   HF_API_TOKEN=hf_xxxxxxxx
   HF_IMAGE_MODEL=timbrooks/instruct-pix2pix   # optional; instruction-based image edit
   ```
Caveats of the free tier: the first call may return **503 "model loading"** (retry in ~20s), and
there are rate limits. Great for a demo; for heavy use prefer Option 1. If a model becomes gated, pick
another image-to-image model with `HF_IMAGE_MODEL`.

### Option 3 — Google Gemini (needs a *billed* key for images)

The **free** Gemini tier only returns text — image output (`gemini-2.5-flash-image` / "Nano Banana")
requires billing enabled, which is why it fails for you. If you enable billing:

```env
AI_EDIT_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image   # optional
```

### Option 4 — none

Leave all three unset (or `AI_EDIT_PROVIDER=none`). Generative edits show a friendly "not configured"
message; **all of Group 1 (analysis + Remove Background) still works**, plus every non-AI editor tool
(crop, rotate, filters, adjust, annotations, and the whole video editor).

---

## Bring your own provider (SDK-level)

The SDK takes a pluggable `AIProvider` (`ai` prop on `<PhotoGallery>`). Every method is optional:

```ts
interface AIProvider {
  detectObjects?(item, image): DetectedObject[] | Promise<…>;
  detectFaces?(item, image): DetectedFace[] | Promise<…>;
  ocr?(item, image): string | Promise<string>;
  embedImage?(item, image): number[] | Promise<number[]>;
  embedText?(text): number[] | Promise<number[]>;
  generativeEdit?(item, image, op): Blob | Promise<Blob>;   // return the edited image
}
```

The demo's provider (`apps/web/src/lib/ai/createDemoAIProvider.ts`) wires the in-browser models for
analysis and background-removal, and routes the other generative ops to `/api/ai/edit`. To use a
different service (local Ollama+vision, ComfyUI, Replicate, your own model server, etc.), implement
`generativeEdit` (and/or the analysis methods) and pass your provider — no changes elsewhere.

---

## Summary

| Task | Free? | How |
|---|---|---|
| Object/face/OCR/embedding analysis | ✅ always free | in-browser, no key |
| Remove Background | ✅ always free | in-browser (@imgly) |
| Filters / crop / rotate / adjust / annotate / **video editor** | ✅ always free | no model at all |
| Restore / Colorize / Replace-Sky / Prompt edit | ✅ free via **local SD** or **HF free token** | `AI_EDIT_PROVIDER` |
