# Real-ESRGAN Upscale Worker (#7)

RunPod Serverless worker for Real-ESRGAN image super-resolution with optional GFPGAN face enhancement.

- **Dockerfile path:** `/workers/upscale/Dockerfile`
- **Build context:** repository ROOT (COPY paths are prefixed with `workers/upscale/`).
- **GPU:** medium (RTX 3090 / RTX 4090, ~24 GB VRAM).
- **App env var to set:** `RUNPOD_UPSCALE_URL` (point your app at this endpoint's RunPod URL).

## Contract

Input:
```json
{"image": "<base64 PNG/JPEG, optional data: prefix>", "scale": 2 or 4 (default 4), "face_enhance": false}
```
Output (success):
```json
{"image": "<base64 PNG>"}
```
Output (error):
```json
{"error": "SomeError: message"}
```

## Model weights

Downloaded on first request and cached to the network volume when mounted:
- `RealESRGAN_x4plus.pth` (RRDBNet x4) -> `/runpod-volume/weights/`
- `GFPGANv1.4.pth` (only when `face_enhance=true`) -> `/runpod-volume/weights/`

Attach a network volume mounted at `/runpod-volume` so weights (and `HF_HOME`) persist between cold starts. Without a volume, weights download to `/app/weights` per container.

## Notes

The base model is x4; `scale=2` is produced via RealESRGANer's `outscale` parameter. For `face_enhance`, GFPGAN upscales at its fixed factor and the result is resized to the requested scale.
