_V = "/runpod-volume"
import os
if os.path.isdir(_V):
    os.environ.setdefault("HF_HOME", os.path.join(_V, "huggingface"))

import io
import base64
import traceback
import urllib.request

import numpy as np
from PIL import Image

_WEIGHTS_DIR = os.path.join(_V, "weights") if os.path.isdir(_V) else "/app/weights"
os.makedirs(_WEIGHTS_DIR, exist_ok=True)

_RRDB_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
_GFPGAN_URL = "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth"

_UPSAMPLER = None
_FACE_ENHANCER = None


def _download(url, dst):
    if not os.path.isfile(dst):
        tmp = dst + ".tmp"
        urllib.request.urlretrieve(url, tmp)
        os.replace(tmp, dst)
    return dst


def _get_upsampler():
    global _UPSAMPLER
    if _UPSAMPLER is None:
        import torch
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer

        model_path = _download(_RRDB_URL, os.path.join(_WEIGHTS_DIR, "RealESRGAN_x4plus.pth"))
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        _UPSAMPLER = RealESRGANer(
            scale=4,
            model_path=model_path,
            model=model,
            tile=0,
            tile_pad=10,
            pre_pad=0,
            half=torch.cuda.is_available(),
            gpu_id=None,
        )
    return _UPSAMPLER


def _get_face_enhancer():
    global _FACE_ENHANCER
    if _FACE_ENHANCER is None:
        from gfpgan import GFPGANer

        gfpgan_path = _download(_GFPGAN_URL, os.path.join(_WEIGHTS_DIR, "GFPGANv1.4.pth"))
        _FACE_ENHANCER = GFPGANer(
            model_path=gfpgan_path,
            upscale=4,
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=_get_upsampler(),
        )
    return _FACE_ENHANCER


def handler(event):
    try:
        data = (event or {}).get("input") or {}
        b64 = data.get("image")
        if not b64:
            return {"error": "ValueError: 'image' is required"}
        if "," in b64:
            b64 = b64.split(",", 1)[1]

        scale = int(data.get("scale", 4))
        if scale not in (2, 4):
            scale = 4
        face_enhance = bool(data.get("face_enhance", False))

        raw = base64.b64decode(b64)
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
        rgb = np.array(pil)
        bgr = rgb[:, :, ::-1].copy()  # RealESRGANer expects BGR (cv2 convention)

        if face_enhance:
            enhancer = _get_face_enhancer()
            _, _, out_bgr = enhancer.enhance(
                bgr, has_aligned=False, only_center_face=False, paste_back=True
            )
            # GFPGANer upscales by its fixed factor; resize to the requested scale.
            target = (rgb.shape[1] * scale, rgb.shape[0] * scale)
            out_rgb = out_bgr[:, :, ::-1]
            out_pil = Image.fromarray(out_rgb).resize(target, Image.LANCZOS)
        else:
            upsampler = _get_upsampler()
            out_bgr, _ = upsampler.enhance(bgr, outscale=scale)
            out_rgb = out_bgr[:, :, ::-1]
            out_pil = Image.fromarray(out_rgb)

        buf = io.BytesIO()
        out_pil.save(buf, format="PNG")
        return {"image": base64.b64encode(buf.getvalue()).decode("utf-8")}
    except Exception as exc:
        traceback.print_exc()
        return {"error": f"{type(exc).__name__}: {exc}"}


import runpod
runpod.serverless.start({"handler": handler})
