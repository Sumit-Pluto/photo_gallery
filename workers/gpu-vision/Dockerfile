# Combined GPU worker: YOLO detect + Real-ESRGAN upscale + Whisper transcribe.
# CUDA 12.1 + torch cu121 (runs on RTX 3090/4090 driver-550 hosts). Build ctx = repo root.
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip libgl1 libglib2.0-0 && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --upgrade pip && \
    pip install torch==2.1.2 torchvision==0.16.2 --index-url https://download.pytorch.org/whl/cu121
COPY workers/gpu-vision/requirements.txt .
RUN pip install -r requirements.txt

# Fix basicsr's removed torchvision import (the #1 Real-ESRGAN crash) — rewrite it.
RUN F=$(python3 -c "import basicsr, os; print(os.path.join(os.path.dirname(basicsr.__file__), 'data', 'degradations.py'))") && \
    sed -i 's/from torchvision.transforms.functional_tensor import rgb_to_grayscale/from torchvision.transforms.functional import rgb_to_grayscale/' "$F"

# YOLO construction model + handler.
COPY workers/gpu-vision/best.pt .
ENV YOLO_MODEL=/app/best.pt
COPY workers/gpu-vision/handler.py .

CMD ["python3", "-u", "handler.py"]
