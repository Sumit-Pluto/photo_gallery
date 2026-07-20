"""
Combined CPU RunPod worker (no GPU, no torch). Routes on input.task:
  "remove-bg" -> rembg (U^2-Net) background removal  -> {"image": <png b64>}
  "denoise"   -> ffmpeg RNNoise/afftdn audio denoise -> {"audio": <wav b64>}
One request runs exactly one model (isolated). If `task` is absent it's inferred
from the payload (audio -> denoise, image -> remove-bg) for backward-compat.
"""

import base64
import io
import os
import subprocess
import tempfile

import runpod

RNNN_MODEL = "/app/models/rnnoise.rnnn"
_sessions = {}


def _decode_b64(s):
    if isinstance(s, str) and "," in s:
        s = s.split(",", 1)[1]
    return base64.b64decode(s)


def _remove_bg(inp):
    from PIL import Image
    from rembg import new_session, remove

    image_b64 = inp.get("image")
    if not image_b64:
        return {"error": "Missing 'image' (base64)."}
    name = (inp.get("model_name") or os.environ.get("BG_REMOVE_MODEL", "u2net")).strip() or "u2net"
    if name not in _sessions:
        _sessions[name] = new_session(name)
    img = Image.open(io.BytesIO(_decode_b64(image_b64))).convert("RGBA")
    out = remove(img, session=_sessions[name])
    if out.mode != "RGBA":
        out = out.convert("RGBA")
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return {"image": base64.b64encode(buf.getvalue()).decode("utf-8")}


def _denoise(inp):
    audio_b64 = inp.get("audio")
    if not audio_b64:
        return {"error": "Missing 'audio' (base64)."}
    raw = _decode_b64(audio_b64)
    af = ("arnndn=m=" + RNNN_MODEL) if os.path.isfile(RNNN_MODEL) else "afftdn=nf=-25"
    with tempfile.TemporaryDirectory() as td:
        in_path = os.path.join(td, "in")
        out_path = os.path.join(td, "out.wav")
        with open(in_path, "wb") as f:
            f.write(raw)
        cmd = ["ffmpeg", "-y", "-hide_banner", "-nostdin", "-i", in_path,
               "-af", af, "-ar", "48000", "-ac", "1", "-f", "wav", out_path]
        proc = subprocess.run(cmd, capture_output=True)
        if proc.returncode != 0:
            raise RuntimeError("ffmpeg failed: " + proc.stderr.decode("utf-8", "replace")[-600:])
        with open(out_path, "rb") as f:
            out_bytes = f.read()
    return {"audio": base64.b64encode(out_bytes).decode("ascii")}


def handler(event):
    inp = (event or {}).get("input") or {}
    task = (inp.get("task") or "").strip().lower()
    if not task:
        task = "denoise" if inp.get("audio") else "remove-bg"
    try:
        if task == "remove-bg":
            return _remove_bg(inp)
        if task == "denoise":
            return _denoise(inp)
        return {"error": f"Unknown task '{task}' for cpu endpoint."}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
