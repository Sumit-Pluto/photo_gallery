# Instruct-Pix2Pix image-editing worker (RunPod Serverless)

Instruction-based image editing that powers the gallery editor's **Apply Prompt**
button. Instruct-Pix2Pix is *trained to follow edit instructions* ("make it
golden hour", "add snow", "turn the sky orange") and applies them while keeping
the rest of the photo — unlike plain SD img2img.

Small (~2 GB), runs on your existing 24 GB endpoint, **no gated license, no HF
token, no volume resize**. Input/output matches the app, so no app-code change.

## Contract

Request → `POST /runsync`:
```json
{ "input": { "image": "<base64>", "prompt": "<edit instruction>",
             "guidance_scale": 7.5, "num_inference_steps": 25, "seed": 123 } }
```
Response → `{ "output": { "image": "<base64 PNG>" } }` (or `{ "output": { "error": "..." } }`).

`strength` / `mask` from the app are ignored (this model conditions on the image
via `image_guidance_scale`, not img2img noise or masks).

## Deploy (reuse your existing endpoint)

No RunPod settings to change — just push, and RunPod auto-rebuilds:
```bash
cd "advance-photo-gallery-web-sdk - Copy"
git add runpod-worker
git commit -m "Switch worker to Instruct-Pix2Pix"
git push
```
Then **warm up once** (downloads ~2 GB — quick):
```bash
curl -X POST https://api.runpod.ai/v2/<ENDPOINT_ID>/runsync \
  -H "Content-Type: application/json" -H "Authorization: Bearer <API_KEY>" \
  -d @runpod-worker/warmup.json
```
Test **Apply Prompt** in the app — no Vercel change (same URL).

## Tuning (optional endpoint env vars)

| Var | Default | Purpose |
|---|---|---|
| `IP2P_MODEL` | `timbrooks/instruct-pix2pix` | the model |
| `IP2P_IMAGE_GUIDANCE` | `1.5` | higher keeps more of the original; **lower toward ~1.2 if edits feel too weak** |
| `IP2P_MAX_SIZE` | `768` | max long-edge px (SD1.5 works best ≤ 768) |

**Prompts work best as imperatives:** "make it a golden-hour sunset", "add snow",
"turn it into winter" — not descriptions.
