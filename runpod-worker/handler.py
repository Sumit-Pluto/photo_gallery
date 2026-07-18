"""
RunPod Serverless worker: Instruct-Pix2Pix instruction-based image editing.

Trained specifically on "instruction -> edited photo" examples, so it applies
edits like "make it golden hour" / "add snow" while keeping the rest of the
photo — unlike plain SD img2img, which just re-draws toward a caption.

Small (~2 GB fp16), runs on a modest GPU (your existing 24 GB card is plenty),
no gated license, no HF token.

Matches the app's RunPod contract (no app-code change needed):
  {"input": {
     "image": "<base64>",          # required (raw base64 or data: URI)
     "prompt": "<instruction>",    # required — plain-English edit instruction
     "guidance_scale": 7.5,        # optional — how strongly to follow the instruction
     "num_inference_steps": 25,    # optional
     "negative_prompt": "...",     # optional
     "seed": 123                   # optional
  }}
Returns: {"image": "<base64 PNG>"}  (or {"error": "..."}).

`strength` and `mask` from the app are ignored (this model conditions on the
image via image_guidance_scale, not img2img noise or masks).

Tuning (env vars):
  IP2P_MODEL            (default timbrooks/instruct-pix2pix)
  IP2P_IMAGE_GUIDANCE   (default 1.5 — higher keeps more of the original;
                         LOWER it toward ~1.2 if edits feel too weak)
  IP2P_MAX_SIZE         (default 768 — SD1.5 works best <= 768)
"""

import base64
import io
import os

_VOLUME = "/runpod-volume"
if os.path.isdir(_VOLUME):
    os.environ.setdefault("HF_HOME", os.path.join(_VOLUME, "huggingface"))

import torch  # noqa: E402
import runpod  # noqa: E402
from PIL import Image  # noqa: E402
from diffusers import (  # noqa: E402
    StableDiffusionInstructPix2PixPipeline,
    EulerAncestralDiscreteScheduler,
)

MODEL = os.environ.get("IP2P_MODEL", "timbrooks/instruct-pix2pix")
IMAGE_GUIDANCE = float(os.environ.get("IP2P_IMAGE_GUIDANCE", "1.5"))
MAX_SIZE = int(os.environ.get("IP2P_MAX_SIZE", "768"))

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32

_pipe = None


def _get_pipe():
    global _pipe
    if _pipe is None:
        common = {"torch_dtype": DTYPE, "safety_checker": None, "requires_safety_checker": False}
        try:
            pipe = StableDiffusionInstructPix2PixPipeline.from_pretrained(MODEL, variant="fp16", **common)
        except Exception:
            pipe = StableDiffusionInstructPix2PixPipeline.from_pretrained(MODEL, **common)
        pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
        pipe = pipe.to(DEVICE)
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
    nw = max(8, (int(w * scale) // 8) * 8)
    nh = max(8, (int(h * scale) // 8) * 8)
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
        steps = max(1, min(50, int(inp.get("num_inference_steps", 25))))
        guidance = float(inp.get("guidance_scale", 7.5))
        negative = inp.get("negative_prompt") or None
        seed = inp.get("seed")
        generator = None
        if seed is not None:
            generator = torch.Generator(device=DEVICE).manual_seed(int(seed))

        # The app's "Edit strength" slider arrives as `strength` (0..1). Map it to
        # image_guidance_scale, which is INVERTED (higher = keep more of the
        # original = weaker edit): strength 0 -> 1.8 (subtle), 1 -> 1.1 (strong).
        # An explicit image_guidance_scale, if sent, always wins.
        img_guidance = IMAGE_GUIDANCE
        if inp.get("image_guidance_scale") is not None:
            img_guidance = float(inp["image_guidance_scale"])
        elif inp.get("strength") is not None:
            s = max(0.0, min(1.0, float(inp["strength"])))
            img_guidance = round(1.8 - s * 0.7, 3)

        result = _get_pipe()(
            prompt=prompt,
            image=image,
            num_inference_steps=steps,
            guidance_scale=guidance,
            image_guidance_scale=img_guidance,
            negative_prompt=negative,
            generator=generator,
        ).images[0]

        return {"image": _image_to_b64(result)}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
