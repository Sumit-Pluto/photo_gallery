# Combined GPU diffusion worker: FLUX.2 img2img + SDXL inpaint.
# Slim Python base + torch cu124 (torch bundles its own CUDA runtime/cuDNN, so we
# skip the heavy nvidia/cuda base — that halves the image so it fits the worker's
# container disk). The host NVIDIA driver is mounted by RunPod; torch supplies the
# rest. No CUDA-version label = runs on any recent driver. Build ctx = repo root.
FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        git libgomp1 libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --upgrade pip && \
    pip install torch --index-url https://download.pytorch.org/whl/cu124
COPY workers/gpu-diffusion/requirements.txt .
RUN pip install -r requirements.txt

COPY workers/gpu-diffusion/handler.py .

CMD ["python3", "-u", "handler.py"]
