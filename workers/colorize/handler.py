_V = "/runpod-volume"
import os
if os.path.isdir(_V):
    os.environ.setdefault("HF_HOME", os.path.join(_V, "huggingface"))
    os.environ.setdefault("MODELSCOPE_CACHE", os.path.join(_V, "modelscope"))

import base64
import runpod

_pipeline = None


def _get_pipeline():
    global _pipeline
    if _pipeline is None:
        from modelscope.pipelines import pipeline
        from modelscope.utils.constant import Tasks
        _pipeline = pipeline(
            Tasks.image_colorization,
            model="damo/cv_ddcolor_image-colorization",
        )
    return _pipeline


def _decode_image(b64):
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    return base64.b64decode(b64)


def handler(event):
    try:
        import numpy as np
        import cv2

        inp = (event or {}).get("input") or {}
        img_b64 = inp.get("image")
        if not img_b64:
            return {"error": "ValueError: missing 'image' in input"}

        try:
            input_size = int(inp.get("input_size", 512))
        except (TypeError, ValueError):
            input_size = 512

        raw = _decode_image(img_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        # Decode to BGR (modelscope DDColor expects BGR numpy array).
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            return {"error": "ValueError: could not decode input image"}

        orig_h, orig_w = bgr.shape[:2]

        pipe = _get_pipeline()

        from modelscope.outputs import OutputKeys
        result = pipe(bgr, input_size=input_size)
        out_bgr = result[OutputKeys.OUTPUT_IMG]
        out_bgr = np.asarray(out_bgr)

        # Ensure output matches the input dimensions exactly.
        if out_bgr.shape[0] != orig_h or out_bgr.shape[1] != orig_w:
            out_bgr = cv2.resize(
                out_bgr, (orig_w, orig_h), interpolation=cv2.INTER_LANCZOS4
            )

        # BGR -> RGB, then encode PNG. cv2.imencode expects BGR, so re-convert.
        out_rgb = cv2.cvtColor(out_bgr, cv2.COLOR_BGR2RGB)
        ok, buf = cv2.imencode(".png", cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR))
        if not ok:
            return {"error": "RuntimeError: PNG encoding failed"}

        out_b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
        return {"image": out_b64}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
