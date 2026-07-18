# Background-removal worker — rembg / U²-Net (CPU)

Replaces the unreliable in-browser @imgly remover with a RunPod endpoint. Set its
`/runsync` URL as **`RUNPOD_BG_REMOVE_URL`**, and turn it on with
**`NEXT_PUBLIC_APG_RUNPOD_BG=true`** (without the flag the app keeps using the
in-browser fallback).

## Contract
`{"input": {"image": "<base64>", "model_name": "u2net"?}}` → `{"image": "<base64 PNG, transparent background>"}`.

Models: `u2net` (default, general), `u2netp` (lighter), `u2net_human_seg` (people), `isnet-general-use` (sharper edges).

## RunPod setup
1. New Serverless endpoint → connect this repo → **Dockerfile path** `workers/bg-remove/Dockerfile`.
2. Any GPU is fine (it runs on CPU) — pick the cheapest. Max workers ≥ 1.
3. Optional volume to cache the ~170 MB model (`U2NET_HOME` → `/runpod-volume/u2net`).
4. Copy the `…/runsync` URL → Vercel `RUNPOD_BG_REMOVE_URL`, add `NEXT_PUBLIC_APG_RUNPOD_BG=true`, redeploy.
