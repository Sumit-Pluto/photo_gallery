"""
RunPod Serverless worker: FLUX.2 [klein] 4B instruction image editing (img2img).

Replaces the old Instruct-Pix2Pix worker. FLUX.2-klein is Apache-2.0 (no HF token),
runs on a 24 GB card (RTX 3090), and is distilled → ~6 steps, fast. It needs a
recent torch, which also carries kernels for the newest (Blackwell) GPUs — so it
runs on whatever card RunPod assigns.

Matches the app's img2img contract (no app-code change needed):
  {"input": {
     "image": "<base64>",   # required (raw base64 or data: URI)
     "prompt": "<edit instruction>",  # required
     "strength": 0.6,       # optional — the editor's "Edit strength" slider (mapped to guidance)
     "seed": 123            # optional
  }}
Returns: {"image": "<base64 PNG>"}  (or {"error": "..."}).

Tuning (env): FLUX2_MODEL (default black-forest-labs/FLUX.2-klein-4B),
FLUX2_STEPS (default 6), FLUX2_MAX_SIZE (default 1024).
"""

import base64
import io
import os

_V = "/runpod-volume"
if os.path.isdir(_V):
    os.environ.setdefault("HF_HOME", os.path.join(_V, "huggingface"))

import torch  # noqa: E402
import runpod  # noqa: E402
from PIL import Image  # noqa: E402
from diffusers import Flux2KleinPipeline  # noqa: E402

MODEL = os.environ.get("FLUX2_MODEL", "black-forest-labs/FLUX.2-klein-4B")
STEPS = int(os.environ.get("FLUX2_STEPS", "6"))
MAX_SIZE = int(os.environ.get("FLUX2_MAX_SIZE", "1024"))

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
_pipe = None


def _get_pipe():
    global _pipe
    if _pipe is None:
        pipe = Flux2KleinPipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16)
        total_gb = torch.cuda.get_device_properties(0).total_memory / 1e9 if DEVICE == "cuda" else 0
        if total_gb >= 20:
            pipe = pipe.to("cuda")
        else:
            pipe.enable_model_cpu_offload()
        pipe.set_progress_bar_config(disable=True)
        _pipe = pipe
    return _pipe


def _b64_to_image(data):
    if "," in data:
        data = data.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")


def _image_to_b64(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _fit(img):
    w, h = img.size
    scale = min(1.0, MAX_SIZE / max(w, h))
    nw = max(16, (int(w * scale) // 16) * 16)
    nh = max(16, (int(h * scale) // 16) * 16)
    return img.resize((nw, nh), Image.LANCZOS)


def handler(event):
    inp = (event or {}).get("input") or {}
    image_b64 = inp.get("image")
    prompt = (inp.get("prompt") or "").strip()
    if not image_b64:
        return {"error": "Missing 'image' (base64)."}
    if not prompt:
        return {"error": "Missing 'prompt' (edit instruction)."}

    try:
        image = _fit(_b64_to_image(image_b64))
        # The editor's "Edit strength" slider (0..1) maps to guidance — FLUX.2 klein
        # likes low guidance (~1); stronger = higher.
        guidance = 1.0
        strength = inp.get("strength")
        if strength is not None:
            s = max(0.0, min(1.0, float(strength)))
            guidance = round(1.0 + s * 3.0, 2)
        seed = inp.get("seed")
        generator = torch.Generator(device="cpu").manual_seed(int(seed)) if seed is not None else None

        result = _get_pipe()(
            prompt=prompt,
            image=image,
            height=image.height,
            width=image.width,
            guidance_scale=guidance,
            num_inference_steps=STEPS,
            generator=generator,
        ).images[0]

        return {"image": _image_to_b64(result)}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
