FROM python:3.11-slim

WORKDIR /app

# ffmpeg (with arnndn/afftdn filters) + curl for model download
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Download a standard RNNoise model for ffmpeg's arnndn filter.
# Source: GregorR/rnnoise-models (beguiling-drafts, a widely used general model).
# Non-fatal: if the download fails, handler.py falls back to afftdn.
RUN mkdir -p /app/models && \
    ( curl -fsSL -o /app/models/rnnoise.rnnn \
        https://raw.githubusercontent.com/GregorR/rnnoise-models/master/beguiling-drafts-2018-08-30/bd.rnnn \
      || echo "WARNING: RNNoise model download failed; will fall back to afftdn" )

COPY workers/audio-denoise/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY workers/audio-denoise/handler.py .

CMD ["python3", "-u", "handler.py"]
