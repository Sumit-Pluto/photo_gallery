"""
RunPod Serverless worker: Stable Diffusion image EDITING (img2img + inpaint).

Matches the photo-gallery app's RunPod contract exactly, so no app-code change
is needed — the app already sends this input shape and reads `output.image` back:

  {"input": {
     "image": "<base64>",          # required (raw base64 or data: URI)
     "prompt": "<text>",           # required
     "mask": "<base64>",           # optional -> switches to INPAINT (#9); white = regenerate
     "strength": 0.6,              # optional (0..1)
     "guidance_scale": 7.0,        # optional
     "num_inference_steps": 30,    # optional
     "negative_prompt": "...",     # optional
     "seed": 123                   # optional
  }}

Returns: {"image": "<base64 PNG>"}  (or {"error": "..."} on failure)

Without a mask -> img2img ("Apply Prompt" #10, and "Replace Sky" #9 no-mask fallback).
With a mask    -> inpaint  ("Replace Sky"/"Magic Eraser"/"Generative Fill" #9).
"""

import base64
import io
import os

# Cache model weights on the attached RunPod network volume (mounts at
# /runpod-volume) so they download only once. Falls back to the default cache
# if no volume is attached.
_VOLUME = "/runpod-volume"
if os.path.isdir(_VOLUME):
    os.environ.setdefault("HF_HOME", os.path.join(_VOLUME, "huggingface"))

import torch  # noqa: E402
import runpod  # noqa: E402
from PIL import Image  # noqa: E402
from diffusers import AutoPipelineForImage2Image, AutoPipelineForInpainting  # noqa: E402

# Swap these via endpoint env vars to change quality/size (e.g. SD 1.5 for a
# lighter/faster start, or an SD 3.5 pipeline later).
IMG2IMG_MODEL = os.environ.get("SD_IMG2IMG_MODEL", "stabilityai/stable-diffusion-xl-base-1.0")
INPAINT_MODEL = os.environ.get("SD_INPAINT_MODEL", "diffusers/stable-diffusion-xl-1.0-inpainting-0.1")
MAX_SIZE = int(os.environ.get("SD_MAX_SIZE", "1024"))

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32

_img2img = None
_inpaint = None


def _load(pipe_cls, model_id):
    kwargs = {"torch_dtype": DTYPE, "use_safetensors": True}
    try:
        pipe = pipe_cls.from_pretrained(model_id, variant="fp16", **kwargs)
    except Exception:
        # Not every repo ships an fp16 variant — fall back to the default weights.
        pipe = pipe_cls.from_pretrained(model_id, **kwargs)
    pipe = pipe.to(DEVICE)
    for tweak in ("enable_attention_slicing", "enable_vae_tiling"):
        try:
            getattr(pipe, tweak)()
        except Exception:
            pass
    pipe.set_progress_bar_config(disable=True)
    return pipe


def _get_img2img():
    global _img2img
    if _img2img is None:
        _img2img = _load(AutoPipelineForImage2Image, IMG2IMG_MODEL)
    return _img2img


def _get_inpaint():
    global _inpaint
    if _inpaint is None:
        _inpaint = _load(AutoPipelineForInpainting, INPAINT_MODEL)
    return _inpaint


def _b64_to_image(data, mode="RGB"):
    if "," in data:  # strip a data: URI prefix if present
        data = data.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data))).convert(mode)


def _image_to_b64(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _fit(img):
    """Downscale to <= MAX_SIZE and snap to a multiple of 8 (SD requirement)."""
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
        return {"error": "Missing 'prompt'."}

    try:
        image = _fit(_b64_to_image(image_b64))
        strength = max(0.0, min(1.0, float(inp.get("strength", 0.6))))
        guidance = float(inp.get("guidance_scale", 7.0))
        steps = max(1, min(60, int(inp.get("num_inference_steps", 30))))
        negative = inp.get("negative_prompt") or None
        seed = inp.get("seed")
        generator = None
        if seed is not None:
            generator = torch.Generator(device=DEVICE).manual_seed(int(seed))

        mask_b64 = inp.get("mask")
        if mask_b64:
            mask = _b64_to_image(mask_b64, mode="L").resize(image.size)
            result = _get_inpaint()(
                prompt=prompt,
                image=image,
                mask_image=mask,
                strength=strength,
                guidance_scale=guidance,
                num_inference_steps=steps,
                negative_prompt=negative,
                generator=generator,
            ).images[0]
        else:
            result = _get_img2img()(
                prompt=prompt,
                image=image,
                strength=strength,
                guidance_scale=guidance,
                num_inference_steps=steps,
                negative_prompt=negative,
                generator=generator,
            ).images[0]

        return {"image": _image_to_b64(result)}
    except Exception as exc:  # surface a clean error to the app instead of a 500
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
