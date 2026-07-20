"""
Combined GPU diffusion RunPod worker. Routes on input.task:
  "img2img" -> FLUX.2 [klein] (prompt / colorize / sky)        -> {"image": b64}
  "inpaint" -> SDXL inpainting (inpaint/outpaint/eraser/fill)   -> {"image": b64}
One request runs exactly one model (isolated). Needs a 24 GB GPU. torch cu124 +
diffusers. Both pipelines load lazily and are cached.
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

FLUX_MODEL = os.environ.get("FLUX2_MODEL", "black-forest-labs/FLUX.2-klein-4B")
FLUX_STEPS = int(os.environ.get("FLUX2_STEPS", "6"))
INPAINT_MODEL = os.environ.get("SD_INPAINT_MODEL", "diffusers/stable-diffusion-xl-1.0-inpainting-0.1")
MAX_SIZE = int(os.environ.get("MAX_SIZE", "1024"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
_HAS24 = DEVICE == "cuda" and torch.cuda.get_device_properties(0).total_memory / 1e9 >= 20
_flux = None
_inpaint = None


def _place(p):
    if _HAS24:
        return p.to("cuda")
    p.enable_model_cpu_offload()
    return p


def _flux_pipe():
    global _flux
    if _flux is None:
        from diffusers import Flux2KleinPipeline

        p = Flux2KleinPipeline.from_pretrained(FLUX_MODEL, torch_dtype=torch.bfloat16)
        p.set_progress_bar_config(disable=True)
        _flux = _place(p)
    return _flux


def _inpaint_pipe():
    global _inpaint
    if _inpaint is None:
        from diffusers import AutoPipelineForInpainting

        try:
            p = AutoPipelineForInpainting.from_pretrained(
                INPAINT_MODEL, torch_dtype=torch.float16, variant="fp16"
            )
        except Exception:
            p = AutoPipelineForInpainting.from_pretrained(INPAINT_MODEL, torch_dtype=torch.float16)
        p.set_progress_bar_config(disable=True)
        _inpaint = _place(p)
    return _inpaint


def _b64_img(data, mode="RGB"):
    if "," in data:
        data = data.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data))).convert(mode)


def _to_b64(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _fit(img, mult=16):
    w, h = img.size
    s = min(1.0, MAX_SIZE / max(w, h))
    nw = max(mult, (int(w * s) // mult) * mult)
    nh = max(mult, (int(h * s) // mult) * mult)
    return img.resize((nw, nh), Image.LANCZOS)


def _run_flux(inp):
    image_b64 = inp.get("image")
    prompt = (inp.get("prompt") or "").strip()
    if not image_b64:
        return {"error": "Missing 'image'."}
    if not prompt:
        return {"error": "Missing 'prompt'."}
    image = _fit(_b64_img(image_b64), 16)
    guidance = 1.0
    st = inp.get("strength")
    if st is not None:
        s = max(0.0, min(1.0, float(st)))
        guidance = round(1.0 + s * 3.0, 2)
    seed = inp.get("seed")
    gen = torch.Generator(device="cpu").manual_seed(int(seed)) if seed is not None else None
    res = _flux_pipe()(
        prompt=prompt, image=image, height=image.height, width=image.width,
        guidance_scale=guidance, num_inference_steps=FLUX_STEPS, generator=gen,
    ).images[0]
    return {"image": _to_b64(res)}


def _run_inpaint(inp):
    image_b64 = inp.get("image")
    mask_b64 = inp.get("mask")
    if not image_b64:
        return {"error": "Missing 'image'."}
    if not mask_b64:
        return {"error": "Missing 'mask'."}
    prompt = (inp.get("prompt") or "").strip()
    negative = (inp.get("negative_prompt") or "").strip() or None
    image = _fit(_b64_img(image_b64), 8)
    mask = _b64_img(mask_b64, "L").resize(image.size, Image.NEAREST)
    steps = int(inp.get("num_inference_steps") or 35)
    guidance = float(inp.get("guidance_scale") or 7.0)
    raw = inp.get("strength")
    strength = 1.0 if not prompt else (max(0.7, min(1.0, float(raw))) if raw is not None else 0.9)
    seed = inp.get("seed")
    gen = torch.Generator(device=DEVICE).manual_seed(int(seed)) if seed is not None else None
    eff = prompt or "clean, seamless, photorealistic background, natural continuation"
    res = _inpaint_pipe()(
        prompt=eff, negative_prompt=negative, image=image, mask_image=mask,
        height=image.height, width=image.width, num_inference_steps=steps,
        guidance_scale=guidance, strength=strength, generator=gen,
    ).images[0]
    return {"image": _to_b64(res)}


def handler(event):
    inp = (event or {}).get("input") or {}
    task = (inp.get("task") or "").strip().lower()
    if not task:
        task = "inpaint" if inp.get("mask") else "img2img"
    try:
        if task == "img2img":
            return _run_flux(inp)
        if task == "inpaint":
            return _run_inpaint(inp)
        return {"error": f"Unknown task '{task}' for diffusion endpoint."}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
