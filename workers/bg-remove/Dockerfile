# RunPod Serverless worker: background removal (rembg / U²-Net), CPU-only.
# Slim Python base — NO CUDA — so it never hits the driver/kernel issues the GPU
# models did. rembg pulls opencv (needs libgl1/libglib). Build context = repo root.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --upgrade pip
COPY workers/bg-remove/requirements.txt .
RUN pip install -r requirements.txt

COPY workers/bg-remove/handler.py .

CMD ["python3", "-u", "handler.py"]
