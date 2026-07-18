# RunPod Serverless worker for SD image editing (img2img + inpaint).
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip git && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Torch first (CUDA 12.1 build), then the rest.
RUN pip3 install --no-cache-dir torch==2.4.0 --index-url https://download.pytorch.org/whl/cu121
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY handler.py .

CMD ["python3", "-u", "handler.py"]
