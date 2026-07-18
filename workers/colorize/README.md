# DDColor Colorization Worker (#8)

RunPod Serverless worker that colorizes black-and-white images using the
ModelScope DDColor pipeline (`damo/cv_ddcolor_image-colorization`).

## Contract

Input:
```json
{ "image": "<base64 (optionally data:...;base64, prefixed)>", "input_size": 512 }
```

Output:
```json
{ "image": "<base64 PNG, same dimensions as input>" }
```

On error: `{ "error": "..." }`.

## Deploy

- Dockerfile path: `/workers/colorize/Dockerfile`
- Build context: repo root (`docker build -f workers/colorize/Dockerfile .`)
- GPU: medium (RTX 3080 / 3090, ~10-12 GB VRAM)
- App env var to set: `RUNPOD_COLORIZE_URL` (point your app at this endpoint)

## Notes

- Model weights are cached to the network volume via `MODELSCOPE_CACHE`
  (`/runpod-volume/modelscope`) when `/runpod-volume` is mounted, so the first
  request downloads and subsequent cold starts reuse the cached weights.
- `input_size` controls the DDColor internal working resolution (default 512).
  The output is always resized back to the exact input dimensions.
