# RunPod Serverless worker: SDXL inpainting (Magic Eraser / Generative Fill / Outpaint).
# CUDA 12.1 base + torch cu121 — the same base the detect/upscale workers use, which
# runs on RunPod's RTX 3090/4090 (driver 550) hosts (12.1 <= 12.4, backward-compatible).
# Build context = repo root, so COPY paths are workers/inpaint/*.
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip git && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# torch (CUDA 12.1 build) FIRST — carries sm_86 (3090) + sm_89 (4090) kernels.
RUN pip install --upgrade pip && \
    pip install torch --index-url https://download.pytorch.org/whl/cu121
COPY workers/inpaint/requirements.txt .
RUN pip install -r requirements.txt

COPY workers/inpaint/handler.py .

CMD ["python3", "-u", "handler.py"]
