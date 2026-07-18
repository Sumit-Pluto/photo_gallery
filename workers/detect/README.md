# Construction-Material Detection Worker (YOLOv8)

RunPod Serverless worker running Ultralytics YOLOv8 object detection for a
custom-trained construction-material classifier.

## Build & Deploy
- Dockerfile path: `/workers/detect/Dockerfile`
- Build context: repo ROOT (the COPY paths are prefixed with `workers/detect/`).
- GPU: light/medium — NVIDIA T4 or A4000 is plenty.

## Model
The trained construction-material model (`best.pt`, 43 MB) is **baked into the
image** (`COPY workers/detect/best.pt` → `ENV YOLO_MODEL=/app/best.pt`), so the
worker detects your materials out of the box — no volume upload needed.

- `YOLO_MODEL` — override only if you want to swap models (default `/app/best.pt`).
  To update the model later, replace `workers/detect/best.pt` and push (RunPod rebuilds).

## App-side env var
Point your application at the deployed endpoint with:
- `RUNPOD_YOLO_URL` = your RunPod serverless endpoint URL.

## Contract
Input:
```json
{ "input": { "image": "<base64>" } }
```
The base64 may include a `data:image/...;base64,` prefix; it is stripped.

Output (pixel coordinates):
```json
{ "detections": [
  { "name": "brick", "confidence": 0.94,
    "box": { "x1": 10.0, "y1": 20.0, "x2": 110.0, "y2": 220.0 } }
] }
```
On error: `{ "error": "<Type>: <message>" }`
