"""
Combined GPU worker: YOLO detect + Real-ESRGAN upscale + Whisper transcribe.
Routes on input.task:
  "detect"     -> YOLO (best.pt construction model)   -> {"detections": [...]}
  "upscale"    -> Real-ESRGAN (+ optional GFPGAN face) -> {"image": b64}
  "transcribe" -> Whisper (faster-whisper)             -> {"transcript": ..., ...}
One request runs exactly one model (isolated). torch cu121 + ultralytics +
realesrgan + faster-whisper. Each model loads lazily and is cached.
"""

import base64
import io
import os
import tempfile
import traceback
import urllib.request

_V = "/runpod-volume"
if os.path.isdir(_V):
    os.environ.setdefault("HF_HOME", os.path.join(_V, "huggingface"))

import runpod  # noqa: E402
from PIL import Image  # noqa: E402

_WEIGHTS_DIR = os.path.join(_V, "weights") if os.path.isdir(_V) else "/app/weights"
os.makedirs(_WEIGHTS_DIR, exist_ok=True)

_yolo = None
_ups = None
_face = None
_whisper = None

_RRDB = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
_GFP = "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth"


# ---------- YOLO ----------
def _yolo_model():
    global _yolo
    if _yolo is None:
        from ultralytics import YOLO

        _yolo = YOLO(os.environ.get("YOLO_MODEL", "/app/best.pt"))
    return _yolo


def _detect(inp):
    b64 = inp.get("image")
    if not b64:
        return {"error": "Missing 'image'."}
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    conf = float(inp.get("conf") or os.environ.get("YOLO_CONF", "0.15"))
    res = _yolo_model().predict(img, conf=conf, verbose=False)
    dets = []
    for r in res:
        names = r.names
        for b in (r.boxes or []):
            cls = int(b.cls[0])
            x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
            dets.append({
                "name": str(names[cls]),
                "confidence": float(b.conf[0]),
                "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            })
    return {"detections": dets}


# ---------- Real-ESRGAN upscale ----------
def _dl(url, dst):
    if not os.path.isfile(dst):
        tmp = dst + ".tmp"
        urllib.request.urlretrieve(url, tmp)
        os.replace(tmp, dst)
    return dst


def _upsampler():
    global _ups
    if _ups is None:
        import torch
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer

        mp = _dl(_RRDB, os.path.join(_WEIGHTS_DIR, "RealESRGAN_x4plus.pth"))
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        _ups = RealESRGANer(
            scale=4, model_path=mp, model=model, tile=0, tile_pad=10, pre_pad=0,
            half=torch.cuda.is_available(), gpu_id=None,
        )
    return _ups


def _face_enh():
    global _face
    if _face is None:
        from gfpgan import GFPGANer

        gp = _dl(_GFP, os.path.join(_WEIGHTS_DIR, "GFPGANv1.4.pth"))
        _face = GFPGANer(model_path=gp, upscale=4, arch="clean", channel_multiplier=2, bg_upsampler=_upsampler())
    return _face


def _upscale(inp):
    import numpy as np

    b64 = inp.get("image")
    if not b64:
        return {"error": "Missing 'image'."}
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    scale = int(inp.get("scale", 4))
    if scale not in (2, 4):
        scale = 4
    face = bool(inp.get("face_enhance", False))
    pil = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    rgb = np.array(pil)
    bgr = rgb[:, :, ::-1].copy()
    if face:
        _, _, ob = _face_enh().enhance(bgr, has_aligned=False, only_center_face=False, paste_back=True)
        out = Image.fromarray(ob[:, :, ::-1]).resize((rgb.shape[1] * scale, rgb.shape[0] * scale), Image.LANCZOS)
    else:
        ob, _ = _upsampler().enhance(bgr, outscale=scale)
        out = Image.fromarray(ob[:, :, ::-1])
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return {"image": base64.b64encode(buf.getvalue()).decode("utf-8")}


# ---------- Whisper transcribe ----------
def _whisper_model():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel

        _whisper = WhisperModel(
            os.environ.get("WHISPER_MODEL", "medium"),
            device=os.environ.get("WHISPER_DEVICE", "cuda"),
            compute_type=os.environ.get("WHISPER_COMPUTE", "float16"),
            download_root=os.environ.get("HF_HOME"),
        )
    return _whisper


def _transcribe(inp):
    b64 = inp.get("audio")
    if not b64:
        return {"error": "Missing 'audio'."}
    lang = inp.get("language") or None
    want_ts = bool(inp.get("timestamps", False))
    data = b64.split(",", 1)[1] if "," in b64 else b64
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as f:
            f.write(base64.b64decode(data))
            path = f.name
        segs, info = _whisper_model().transcribe(path, language=lang, vad_filter=True)
        parts, out_segs = [], []
        for s in segs:
            parts.append(s.text)
            if want_ts:
                out_segs.append({"text": s.text.strip(), "start_sec": round(s.start, 2), "end_sec": round(s.end, 2)})
        out = {"transcript": "".join(parts).strip(), "language": info.language}
        if want_ts:
            out["segments"] = out_segs
        return out
    finally:
        if path and os.path.exists(path):
            os.unlink(path)


def handler(event):
    inp = (event or {}).get("input") or {}
    task = (inp.get("task") or "").strip().lower()
    if not task:
        task = "transcribe" if inp.get("audio") else ("upscale" if inp.get("scale") else "detect")
    try:
        if task == "detect":
            return _detect(inp)
        if task == "upscale":
            return _upscale(inp)
        if task == "transcribe":
            return _transcribe(inp)
        return {"error": f"Unknown task '{task}' for vision endpoint."}
    except Exception as exc:
        traceback.print_exc()
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
