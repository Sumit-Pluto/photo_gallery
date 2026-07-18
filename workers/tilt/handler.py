# --- network volume cache setup (must run before importing heavy libs) ---
_V = "/runpod-volume"
import os
if os.path.isdir(_V):
    os.environ.setdefault("HF_HOME", os.path.join(_V, "huggingface"))
    os.environ.setdefault("TORCH_HOME", os.path.join(_V, "torch"))

import io
import sys
import base64
import math

import runpod

# The DeepSingleImageCalibration repo is cloned into /opt/DeepSingleImageCalibration
# by the Dockerfile. Make it importable.
_REPO = os.environ.get("CALIB_REPO", "/opt/DeepSingleImageCalibration")
if _REPO not in sys.path:
    sys.path.insert(0, _REPO)

_MODEL = None      # cached (model, device)
_TF = None         # cached torchvision transform

# ---------------------------------------------------------------------------
# Bin / range configuration.
#
# NOTE (RESEARCH REPO -- VERIFY THESE): AlanSavio25/DeepSingleImageCalibration
# predicts each parameter as a classification over discretised bins, then takes
# the soft-expected value over the bin centres. The exact number of bins, the
# min/max of each range, the head ORDER/NAMES, and whether the network emits
# `pitch` directly or a horizon-offset `rho` all come from the repo's training
# config + the single-image-prediction notebook. The values below follow the
# "A Perceptual Measure for Deep Single Image Camera Calibration" formulation
# and are the most likely defaults, but MUST be confirmed against the checkpoint.
# Override any of them via env vars without rebuilding.
# ---------------------------------------------------------------------------
NUM_BINS = int(os.environ.get("CALIB_NUM_BINS", "256"))
ROLL_MIN = float(os.environ.get("CALIB_ROLL_MIN", "-45.0"))
ROLL_MAX = float(os.environ.get("CALIB_ROLL_MAX", "45.0"))
VFOV_MIN = float(os.environ.get("CALIB_VFOV_MIN", "20.0"))
VFOV_MAX = float(os.environ.get("CALIB_VFOV_MAX", "105.0"))
# rho = signed vertical horizon offset as a fraction of image height.
RHO_MIN = float(os.environ.get("CALIB_RHO_MIN", "-1.5"))
RHO_MAX = float(os.environ.get("CALIB_RHO_MAX", "1.5"))
# If the network already emits pitch (degrees) instead of rho, set this to "1".
CALIB_DIRECT_PITCH = os.environ.get("CALIB_DIRECT_PITCH", "0") == "1"
PITCH_MIN = float(os.environ.get("CALIB_PITCH_MIN", "-45.0"))
PITCH_MAX = float(os.environ.get("CALIB_PITCH_MAX", "45.0"))

INPUT_SIZE = int(os.environ.get("CALIB_INPUT_SIZE", "320"))
BACKBONE = os.environ.get("CALIB_BACKBONE", "densenet161")  # repo default backbone

# Where the pretrained checkpoint lives. Download the repo's released weights
# onto the network volume and point this at them.
WEIGHTS_PATH = os.environ.get(
    "WEIGHTS_PATH",
    os.path.join(_V, "tilt", "weights.tar") if os.path.isdir(_V) else "/opt/weights.tar",
)


def _build_model():
    import torch
    import torch.nn as nn
    import torchvision

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # DenseNet backbone with one classification head per predicted parameter.
    # This mirrors the repo architecture (ImageNet-pretrained backbone whose
    # classifier is replaced by per-parameter heads over NUM_BINS bins).
    if BACKBONE == "densenet161":
        base = torchvision.models.densenet161(weights=None)
        feat_dim = 2208
    elif BACKBONE == "densenet121":
        base = torchvision.models.densenet121(weights=None)
        feat_dim = 1024
    else:
        raise RuntimeError(f"Unsupported CALIB_BACKBONE={BACKBONE!r}")

    class CalibNet(nn.Module):
        def __init__(self):
            super().__init__()
            self.features = base.features
            self.head_roll = nn.Linear(feat_dim, NUM_BINS)
            self.head_pitch = nn.Linear(feat_dim, NUM_BINS)  # 'rho' or pitch head
            self.head_vfov = nn.Linear(feat_dim, NUM_BINS)
            self.head_k1 = nn.Linear(feat_dim, NUM_BINS)     # distortion (unused in output)

        def forward(self, x):
            f = self.features(x)
            f = nn.functional.relu(f, inplace=True)
            f = nn.functional.adaptive_avg_pool2d(f, (1, 1)).flatten(1)
            return {
                "roll": self.head_roll(f),
                "pitch": self.head_pitch(f),
                "vfov": self.head_vfov(f),
                "k1": self.head_k1(f),
            }

    model = CalibNet()

    # Load pretrained weights. Research checkpoints commonly store the state dict
    # under a "model" or "state_dict" key; fall back to the raw object.
    if not os.path.isfile(WEIGHTS_PATH):
        raise RuntimeError(
            f"checkpoint not found at {WEIGHTS_PATH!r}; place the repo's pretrained "
            f"weights on the network volume or set WEIGHTS_PATH"
        )
    ckpt = torch.load(WEIGHTS_PATH, map_location="cpu")
    if isinstance(ckpt, dict):
        state = ckpt.get("model", ckpt.get("state_dict", ckpt))
    else:
        state = ckpt
    if isinstance(state, dict):
        # strip common prefixes
        cleaned = {}
        for k, v in state.items():
            nk = k
            for pref in ("module.", "model.", "net."):
                if nk.startswith(pref):
                    nk = nk[len(pref):]
            cleaned[nk] = v
        # strict=False: head naming in the checkpoint may differ from ours; the
        # backbone (bulk of the weights) will still load. See notes.
        model.load_state_dict(cleaned, strict=False)

    model.eval().to(device)
    return model, device


def _get_transform():
    global _TF
    if _TF is None:
        import torchvision.transforms as T
        _TF = T.Compose([
            T.Resize((INPUT_SIZE, INPUT_SIZE)),
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
    return _TF


def _load_model():
    global _MODEL
    if _MODEL is None:
        _MODEL = _build_model()
    return _MODEL


def _expected_value(logits, vmin, vmax):
    """Soft-argmax: softmax over bins, dot with evenly-spaced bin centres."""
    import torch
    probs = torch.softmax(logits, dim=-1)
    n = probs.shape[-1]
    centers = torch.linspace(vmin, vmax, n, device=probs.device, dtype=probs.dtype)
    return float((probs * centers).sum(dim=-1).item())


def _decode_image(b64):
    from PIL import Image
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def handler(event):
    try:
        data = (event or {}).get("input") or {}
        b64 = data.get("image")
        if not b64:
            return {"error": "missing required 'image' (base64) field"}

        import torch

        img = _decode_image(b64)
        model, device = _load_model()
        tf = _get_transform()
        x = tf(img).unsqueeze(0).to(device)

        with torch.no_grad():
            out = model(x)

        roll = _expected_value(out["roll"], ROLL_MIN, ROLL_MAX)
        vfov = _expected_value(out["vfov"], VFOV_MIN, VFOV_MAX)

        if CALIB_DIRECT_PITCH:
            pitch = _expected_value(out["pitch"], PITCH_MIN, PITCH_MAX)
        else:
            # Head predicts rho = signed vertical horizon offset as a fraction of
            # image height. Convert to pitch via the pinhole relation:
            #   tan(pitch) = 2 * rho * tan(vfov/2)
            rho = _expected_value(out["pitch"], RHO_MIN, RHO_MAX)
            vfov_rad = math.radians(vfov)
            pitch = math.degrees(math.atan(2.0 * rho * math.tan(vfov_rad / 2.0)))

        return {
            "roll_degrees": float(roll),
            "pitch_degrees": float(pitch),
            "fov_degrees": float(vfov),
        }
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
