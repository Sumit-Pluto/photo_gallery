"""
RunPod Serverless worker: Speech-to-Text (Whisper via faster-whisper).

Chosen over Parakeet/NeMo because it has NO heavy dependencies (no NeMo, no
torch — just ctranslate2), so it builds cleanly, AND it's multilingual (99
languages incl. Hindi/regional + English) — a better fit for a mixed crew.

Lets a worker speak instead of typing annotation text (image + video editors).

Matches the app's transcribe contract:
  {"input": {
     "audio": "<base64 audio>",   # required (wav/mp3/m4a; any sample rate — resampled internally)
     "language": "en",            # optional (e.g. "hi", "en"); omit = auto-detect
     "timestamps": false          # optional — return per-segment start/end
  }}
Returns: {"transcript": "...", "language": "en", "segments"?: [{text,start_sec,end_sec}]}
         (or {"error": "..."}).

Tuning (env): WHISPER_MODEL (default large-v3; "medium"/"small" are faster),
WHISPER_COMPUTE (default float16; "int8_float16" for less VRAM).
"""

import base64
import os
import tempfile

_VOLUME = "/runpod-volume"
if os.path.isdir(_VOLUME):
    os.environ.setdefault("HF_HOME", os.path.join(_VOLUME, "huggingface"))

import runpod  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "large-v3")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE = os.environ.get("WHISPER_COMPUTE", "float16")

_model = None


def _get_model():
    global _model
    if _model is None:
        _model = WhisperModel(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE,
            download_root=os.environ.get("HF_HOME"),
        )
    return _model


def handler(event):
    inp = (event or {}).get("input") or {}
    audio_b64 = inp.get("audio")
    if not audio_b64:
        return {"error": "Missing 'audio' (base64)."}

    language = inp.get("language") or None
    want_ts = bool(inp.get("timestamps", False))

    path = None
    try:
        data = audio_b64.split(",", 1)[1] if "," in audio_b64 else audio_b64
        with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as f:
            f.write(base64.b64decode(data))
            path = f.name

        segments, info = _get_model().transcribe(path, language=language, vad_filter=True)

        parts = []
        segs = []
        for s in segments:
            parts.append(s.text)
            if want_ts:
                segs.append(
                    {"text": s.text.strip(), "start_sec": round(s.start, 2), "end_sec": round(s.end, 2)}
                )

        out = {"transcript": "".join(parts).strip(), "language": info.language}
        if want_ts:
            out["segments"] = segs
        return out
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}
    finally:
        if path and os.path.exists(path):
            os.unlink(path)


runpod.serverless.start({"handler": handler})
