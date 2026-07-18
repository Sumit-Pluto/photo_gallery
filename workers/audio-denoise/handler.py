_V = "/runpod-volume"
import os
if os.path.isdir(_V):
    os.environ.setdefault("HF_HOME", os.path.join(_V, "huggingface"))

import base64
import subprocess
import tempfile

import runpod

# Path where the Dockerfile places the RNNoise model file.
RNNN_MODEL = "/app/models/rnnoise.rnnn"


def _decode_b64(s):
    if isinstance(s, str) and "," in s and s.strip().lower().startswith("data:"):
        s = s.split(",", 1)[1]
    return base64.b64decode(s)


def _denoise(in_path, out_path):
    """Run ffmpeg. Prefer RNNoise (arnndn) when a model file is present,
    otherwise fall back to the built-in FFT denoiser (afftdn)."""
    if os.path.isfile(RNNN_MODEL):
        af = "arnndn=m=" + RNNN_MODEL
    else:
        af = "afftdn=nf=-25"

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-nostdin",
        "-i", in_path,
        "-af", af,
        "-ar", "48000", "-ac", "1",
        "-f", "wav",
        out_path,
    ]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "ffmpeg failed: " + proc.stderr.decode("utf-8", "replace")[-800:]
        )


def handler(event):
    try:
        inp = (event or {}).get("input") or {}
        audio_b64 = inp.get("audio")
        if not audio_b64:
            return {"error": "Missing 'audio' in input"}

        raw = _decode_b64(audio_b64)

        with tempfile.TemporaryDirectory() as td:
            in_path = os.path.join(td, "in")
            out_path = os.path.join(td, "out.wav")
            with open(in_path, "wb") as f:
                f.write(raw)

            _denoise(in_path, out_path)

            with open(out_path, "rb") as f:
                out_bytes = f.read()

        return {"audio": base64.b64encode(out_bytes).decode("ascii")}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
