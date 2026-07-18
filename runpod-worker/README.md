# SD image-editing worker (RunPod Serverless)

A Stable Diffusion **img2img + inpaint** worker that powers the gallery editor's
**Apply Prompt** (#10) and **Replace Sky** (#9) buttons. Its input/output already
matches the app's RunPod client, so **no app code changes are needed** — you just
deploy this and set two env vars in Vercel.

## Contract

Request → `POST /runsync` with:
```json
{ "input": {
    "image": "<base64>",            // required
    "prompt": "<text>",             // required
    "mask": "<base64>",             // optional → inpaint (white = regenerate)
    "strength": 0.6,                // optional 0..1
    "guidance_scale": 7.0,          // optional
    "num_inference_steps": 30,      // optional
    "negative_prompt": "...",       // optional
    "seed": 123                     // optional
} }
```
Response → `{ "output": { "image": "<base64 PNG>" } }` (or `{ "output": { "error": "..." } }`).

## Deploy (RunPod)

1. Put these 4 files (`handler.py`, `requirements.txt`, `Dockerfile`, this README) at
   the **root of a new GitHub repo**, e.g. `crm-sd-worker`, and push.
2. RunPod → **Serverless → New Endpoint → Deploy from a GitHub repository** →
   connect GitHub → pick the repo. RunPod finds the `Dockerfile` and builds it (~5–10 min).
3. Configure:
   - **GPU:** 24 GB (RTX 4090) recommended for SDXL. (16 GB can work with the
     memory-saving options already enabled, but 24 GB is safer.)
   - **Region:** the **same** data center as your `models` network volume (US-NC-1).
   - **Network Volume:** attach `models` (weights cache to `/runpod-volume` → fast
     future cold starts).
   - **Workers:** Max = 1, Active/Min = 0, **FlashBoot = ON**.
   - **Idle timeout:** ~10s (raise it to keep the worker warm longer).
   - **Execution timeout:** raise to ~600s so the FIRST request (model download) can finish.

## First run = one-time model download

The **first** request downloads SDXL (~7 GB) to the volume, so it can take a few
minutes. Do this **once from RunPod's own console** (the endpoint's "Requests" tab →
paste a payload → Run) so it warms up without hitting the app's 55s timeout. After
that, requests are fast and you can wire the app.

## Wire into the app (Vercel)

In your Vercel project → Settings → Environment Variables (do **not** use `NEXT_PUBLIC_`):
```
AI_EDIT_PROVIDER      = runpod
RUNPOD_API_KEY        = <your RunPod API key>
RUNPOD_SD_IMG2IMG_URL = https://api.runpod.ai/v2/<ENDPOINT_ID>/runsync
RUNPOD_SD_INPAINT_URL = https://api.runpod.ai/v2/<ENDPOINT_ID>/runsync   # same endpoint — it does both
```
Redeploy → open a photo → Edit → AI tab → **Apply Prompt** (type e.g. "make it golden hour").

## Tuning (optional endpoint env vars)

| Var | Default | Purpose |
|---|---|---|
| `SD_IMG2IMG_MODEL` | `stabilityai/stable-diffusion-xl-base-1.0` | img2img model |
| `SD_INPAINT_MODEL` | `diffusers/stable-diffusion-xl-1.0-inpainting-0.1` | inpaint model |
| `SD_MAX_SIZE` | `1024` | max long-edge px (lower = faster/cheaper) |

For a **lighter/faster** first run, set both models to an SD 1.5 pair (runs on ~8 GB).
