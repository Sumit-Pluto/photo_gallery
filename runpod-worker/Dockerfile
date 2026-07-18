# RunPod Serverless worker: FLUX.2 [klein] image editing.
# CUDA 12.8 base + torch cu128 so the build carries kernels for ALL current GPUs
# (Ampere RTX 3090 … Blackwell RTX PRO 6000) — no more "no kernel image" roulette.
FROM nvidia/cuda:12.8.0-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip git && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# torch (CUDA 12.8 build) FIRST — carries Blackwell kernels.
RUN pip install --upgrade pip && \
    pip install torch --index-url https://download.pytorch.org/whl/cu128
COPY runpod-worker/requirements.txt .
RUN pip install -r requirements.txt

COPY runpod-worker/handler.py .

CMD ["python3", "-u", "handler.py"]
