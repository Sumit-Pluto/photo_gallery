# RunPod Serverless worker: Speech-to-Text (faster-whisper).
# Lightweight — no torch/NeMo; ctranslate2 uses the CUDA + cuDNN in the base image.
# Paths are relative to the REPO ROOT (RunPod's build context).
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip ffmpeg && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY workers/voice-to-text/requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
COPY workers/voice-to-text/handler.py .

CMD ["python3", "-u", "handler.py"]
