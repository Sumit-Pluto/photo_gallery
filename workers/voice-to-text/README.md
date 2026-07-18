# Speech-to-Text worker — Whisper (RunPod Serverless)

Multilingual voice-to-text via **faster-whisper** — lets a worker **speak**
instead of typing annotation text, in both the image and video editors. 99
languages incl. Hindi/regional + English. Chosen over Parakeet/NeMo because it
has no heavy dependencies (no NeMo, no torch), so it builds cleanly.

## Contract

Request → `POST /runsync`:
```json
{ "input": { "audio": "<base64 audio>", "language": "en", "timestamps": false } }
```
- `audio`: base64 wav/mp3/m4a (any sample rate — resampled internally)
- `language`: optional (e.g. `"hi"`, `"en"`); omit to auto-detect
- `timestamps`: optional — per-segment start/end

Response → `{ "output": { "transcript": "...", "language": "en" } }`
(with `segments: [{text, start_sec, end_sec}]` if `timestamps: true`), or `{ "output": { "error": "..." } }`.

## Deploy (new endpoint — one per model)

1. **RunPod → Serverless → New Endpoint → Deploy from a GitHub repository** → `Sumit-Pluto/photo_gallery`.
2. **Dockerfile path:** `/workers/voice-to-text/Dockerfile`
3. Config:
   - **GPU:** light — **16 GB (T4 / A4000)** is plenty (`large-v3` ≈ 5 GB VRAM).
   - **Network volume:** attach your weights volume (caches the model).
   - **Workers:** Max 1, Active 0, FlashBoot on. **Execution timeout** ~300s (first-run download).
4. **Warm up once** (downloads the model, ~1.5 GB):
   ```bash
   curl -X POST https://api.runpod.ai/v2/<NEW_ID>/runsync \
     -H "Content-Type: application/json" -H "Authorization: Bearer <API_KEY>" \
     -d '{"input":{"audio":"<base64-wav>","language":"en"}}'
   ```
5. In **Vercel**, set `RUNPOD_STT_URL` = `https://api.runpod.ai/v2/<NEW_ID>/runsync` (server-only).

## Tuning (env vars)

| Var | Default | Purpose |
|---|---|---|
| `WHISPER_MODEL` | `large-v3` | accuracy vs speed — `medium` / `small` are faster/lighter |
| `WHISPER_COMPUTE` | `float16` | `int8_float16` uses less VRAM |

## App integration (next step, not yet built)

Mic-record button in the editor's text/annotation tool → `/api/ai/transcribe`
(proxies here) → inserts the transcript. Client `rpTranscribe()` already exists in
`apps/web/src/lib/runpod/endpoints.ts`.
