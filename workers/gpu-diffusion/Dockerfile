# Combined GPU diffusion worker: FLUX.2 img2img + SDXL inpaint.
# CUDA 12.4 + torch cu124 (runs on RTX 3090/4090 driver-550 hosts). Build ctx = repo root.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip git && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --upgrade pip && \
    pip install torch --index-url https://download.pytorch.org/whl/cu124
COPY workers/gpu-diffusion/requirements.txt .
RUN pip install -r requirements.txt

COPY workers/gpu-diffusion/handler.py .

CMD ["python3", "-u", "handler.py"]
