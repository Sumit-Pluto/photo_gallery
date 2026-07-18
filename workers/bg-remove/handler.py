"""
RunPod Serverless worker: background removal (U²-Net via rembg).

Replaces the flaky in-browser @imgly remover. Runs rembg on CPU (U²-Net is tiny,
~1-3s) so it needs NO CUDA — it can't hit the driver/kernel problems the GPU
models had, and it's very reliable.

Contract (matches the app's rpRemoveBackground — no app change needed):
  {"input": {
     "image": "<base64>",        # required (raw base64 or data: URI)
     "model_name": "u2net"       # optional: u2net | u2netp | u2net_human_seg | isnet-general-use
  }}
Returns: {"image": "<base64 PNG, RGBA with the background transparent>"}.
"""

import base64
import io
import os

_V = "/runpod-volume"
if os.path.isdir(_V):
    os.environ.setdefault("U2NET_HOME", os.path.join(_V, "u2net"))

import runpod  # noqa: E402
from PIL import Image  # noqa: E402
from rembg import new_session, remove  # noqa: E402

DEFAULT_MODEL = os.environ.get("BG_REMOVE_MODEL", "u2net")
_sessions = {}


def _get_session(name):
    if name not in _sessions:
        _sessions[name] = new_session(name)
    return _sessions[name]


def _b64_to_image(data):
    if "," in data:
        data = data.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGBA")


def _image_to_b64(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def handler(event):
    inp = (event or {}).get("input") or {}
    image_b64 = inp.get("image")
    if not image_b64:
        return {"error": "Missing 'image' (base64)."}
    name = (inp.get("model_name") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    try:
        img = _b64_to_image(image_b64)
        out = remove(img, session=_get_session(name))  # RGBA, background alpha=0
        if out.mode != "RGBA":
            out = out.convert("RGBA")
        return {"image": _image_to_b64(out)}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
