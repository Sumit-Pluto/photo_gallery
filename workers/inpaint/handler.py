"""
RunPod Serverless worker: SDXL inpainting.

Powers the app's Magic Eraser, Generative Fill AND Outpaint — all three go
through this one endpoint (RUNPOD_SD_INPAINT_URL). No app change needed; this
matches the exact contract the app already sends (rpInpaint):

  {"input": {
     "image": "<base64>",          # required (raw base64 or data: URI)
     "mask":  "<base64>",          # required — WHITE = regenerate, BLACK = keep
     "prompt": "<text>",           # optional ("" = Magic Eraser: clean fill)
     "strength": 0.8,              # optional
     "guidance_scale": 7,          # optional
     "num_inference_steps": 35,    # optional
     "negative_prompt": "...",     # optional
     "seed": 123                   # optional
  }}
Returns: {"image": "<base64 PNG>"}  (or {"error": "..."}).

CUDA 12.1 base + torch cu121 (same as the detect/upscale workers) so it runs on
RunPod's RTX 3090/4090 (driver 550) hosts.
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
from diffusers import AutoPipelineForInpainting  # noqa: E402

MODEL = os.environ.get("SD_INPAINT_MODEL", "diffusers/stable-diffusion-xl-1.0-inpainting-0.1")
MAX_SIZE = int(os.environ.get("SD_INPAINT_MAX_SIZE", "1024"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
_pipe = None


def _get_pipe():
    global _pipe
    if _pipe is None:
        try:
            pipe = AutoPipelineForInpainting.from_pretrained(
                MODEL, torch_dtype=torch.float16, variant="fp16"
            )
        except Exception:
            # Repo may not ship an fp16 variant — fall back to default weights.
            pipe = AutoPipelineForInpainting.from_pretrained(MODEL, torch_dtype=torch.float16)
        total_gb = torch.cuda.get_device_properties(0).total_memory / 1e9 if DEVICE == "cuda" else 0
        if total_gb >= 20:
            pipe = pipe.to("cuda")
        else:
            pipe.enable_model_cpu_offload()
        pipe.set_progress_bar_config(disable=True)
        _pipe = pipe
    return _pipe


def _b64_to_image(data, mode="RGB"):
    if "," in data:
        data = data.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data))).convert(mode)


def _image_to_b64(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _fit(img):
    # SDXL wants multiples of 8; cap the long side at MAX_SIZE.
    w, h = img.size
    scale = min(1.0, MAX_SIZE / max(w, h))
    nw = max(8, (int(w * scale) // 8) * 8)
    nh = max(8, (int(h * scale) // 8) * 8)
    return img.resize((nw, nh), Image.LANCZOS)


def handler(event):
    inp = (event or {}).get("input") or {}
    image_b64 = inp.get("image")
    mask_b64 = inp.get("mask")
    if not image_b64:
        return {"error": "Missing 'image' (base64)."}
    if not mask_b64:
        return {"error": "Missing 'mask' (base64)."}

    prompt = (inp.get("prompt") or "").strip()
    negative = (inp.get("negative_prompt") or "").strip() or None

    try:
        image = _fit(_b64_to_image(image_b64, "RGB"))
        mask = _b64_to_image(mask_b64, "L").resize(image.size, Image.NEAREST)

        steps = int(inp.get("num_inference_steps") or 35)
        guidance = float(inp.get("guidance_scale") or 7.0)

        # Strength: empty prompt = Magic Eraser -> fully replace (1.0). With a
        # prompt (Generative Fill / Outpaint) respect the caller but keep a floor
        # so the masked region actually changes.
        raw = inp.get("strength")
        if not prompt:
            strength = 1.0
        else:
            strength = max(0.7, min(1.0, float(raw))) if raw is not None else 0.9

        seed = inp.get("seed")
        generator = (
            torch.Generator(device=DEVICE).manual_seed(int(seed)) if seed is not None else None
        )

        eff_prompt = prompt or "clean, seamless, photorealistic background, natural continuation"

        result = _get_pipe()(
            prompt=eff_prompt,
            negative_prompt=negative,
            image=image,
            mask_image=mask,
            height=image.height,
            width=image.width,
            num_inference_steps=steps,
            guidance_scale=guidance,
            strength=strength,
            generator=generator,
        ).images[0]

        return {"image": _image_to_b64(result)}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
