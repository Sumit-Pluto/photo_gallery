FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY workers/detect/requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Bake in the trained construction-material model and point the worker at it.
COPY workers/detect/best.pt .
ENV YOLO_MODEL=/app/best.pt

COPY workers/detect/handler.py .

CMD ["python3", "-u", "handler.py"]
