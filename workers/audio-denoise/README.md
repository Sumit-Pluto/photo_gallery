# Audio Denoise Worker (RNNoise / arnndn)

RunPod Serverless CPU worker that removes background noise from audio using
ffmpeg's RNNoise filter (`arnndn`), with a built-in FFT denoiser (`afftdn`)
as an automatic fallback.

## Contract
- Input: `{"audio": "<base64>"}` — any format/sample rate. A `data:...;base64,`
  prefix is stripped automatically.
- Output: `{"audio": "<base64 WAV>"}` — denoised, 48 kHz mono WAV.
- Error: `{"error": "<message>"}`.

## Pipeline
decode base64 -> temp input file -> `ffmpeg -i in -af arnndn=m=/app/models/rnnoise.rnnn -ar 48000 -ac 1 out.wav` -> read -> base64.

## Deploy
- Dockerfile path: `/workers/audio-denoise/Dockerfile`
- Build context: repo root (`docker build -f workers/audio-denoise/Dockerfile .`)
- GPU: none (CPU-only worker)
- App env var to set: `RUNPOD_AUDIO_DENOISE_URL` (your deployed endpoint URL)

## Model
The Dockerfile downloads the `beguiling-drafts` RNNoise model from
`GregorR/rnnoise-models` to `/app/models/rnnoise.rnnn`. If that download
fails at build time, the handler transparently falls back to ffmpeg's
built-in `afftdn` FFT denoiser (no model file needed).
