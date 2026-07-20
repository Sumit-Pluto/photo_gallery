# Combined CPU RunPod worker: background removal (rembg) + audio denoise (ffmpeg).
# Slim base, NO CUDA. Build context = repo root.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg libgl1 libglib2.0-0 curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# RNNoise model for ffmpeg's arnndn (falls back to afftdn if the download fails).
RUN mkdir -p /app/models && \
    (curl -fsSL -o /app/models/rnnoise.rnnn \
      https://raw.githubusercontent.com/GregorR/rnnoise-models/master/beguiling-drafts-2018-08-30/bd.rnnn || \
     echo "rnnoise model download skipped; afftdn fallback will be used")

RUN pip install --upgrade pip
COPY workers/cpu-tasks/requirements.txt .
RUN pip install -r requirements.txt

COPY workers/cpu-tasks/handler.py .

CMD ["python3", "-u", "handler.py"]
