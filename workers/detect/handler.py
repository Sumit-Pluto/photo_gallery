_V = "/runpod-volume"
import os
if os.path.isdir(_V):
    os.environ.setdefault("HF_HOME", os.path.join(_V, "huggingface"))

import io
import base64
import runpod
from PIL import Image

_model = None


def _load_model():
    global _model
    if _model is None:
        from ultralytics import YOLO
        weights = os.environ.get("YOLO_MODEL", "yolov8n.pt")
        _model = YOLO(weights)
    return _model


def handler(event):
    try:
        data = (event or {}).get("input") or {}
        image_b64 = data.get("image")
        if not image_b64:
            return {"error": "ValueError: missing 'image' in input"}

        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # Custom construction models are often less confident than COCO — use a low
        # detection floor (env YOLO_CONF, default 0.15) so real brick/pipe/steel hits
        # come through instead of being dropped by ultralytics' default 0.25.
        conf = float(data.get("conf") or os.environ.get("YOLO_CONF", "0.15"))
        model = _load_model()
        results = model.predict(image, conf=conf, verbose=False)

        detections = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            names = result.names if getattr(result, "names", None) else model.names
            for box in boxes:
                cls = int(box.cls[0])
                conf = float(box.conf[0])
                xyxy = box.xyxy[0].tolist()
                x1, y1, x2, y2 = [float(v) for v in xyxy]
                detections.append({
                    "name": str(names[cls]),
                    "confidence": conf,
                    "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                })

        return {"detections": detections}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
