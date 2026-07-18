# Inpaint worker — SDXL (`diffusers/stable-diffusion-xl-1.0-inpainting-0.1`)

One RunPod serverless endpoint that powers **Magic Eraser**, **Generative Fill**,
and **Outpaint** in the photo editor. Set its `/runsync` URL as the Vercel env var
**`RUNPOD_SD_INPAINT_URL`**.

## Contract
Request `{"input": {...}}` — matches the app's `rpInpaint`:

| field | required | meaning |
|---|---|---|
| `image` | yes | base64 image (raw or `data:` URI) |
| `mask` | yes | base64 mask — **white = regenerate, black = keep** |
| `prompt` | no | `""` = Magic Eraser (clean fill); text = Generative Fill / Outpaint |
| `strength` | no | 0..1 (empty prompt forces 1.0 to fully erase) |
| `guidance_scale` | no | default 7 |
| `num_inference_steps` | no | default 35 |
| `negative_prompt` | no | — |
| `seed` | no | — |

Response: `{"image": "<base64 PNG>"}` or `{"error": "..."}`.

## RunPod setup
1. New Serverless endpoint → connect this GitHub repo → **Dockerfile path** `workers/inpaint/Dockerfile` (build context = repo root).
2. GPU: **24 GB** (RTX 4090 / 3090). Max workers ≥ 1; optionally a network volume to cache the ~7 GB model so cold starts don't re-download.
3. Copy the endpoint's `…/runsync` URL → Vercel `RUNPOD_SD_INPAINT_URL`, then redeploy the web app.

## Env knobs
- `SD_INPAINT_MODEL` (default `diffusers/stable-diffusion-xl-1.0-inpainting-0.1`)
- `SD_INPAINT_MAX_SIZE` (default `1024`)
