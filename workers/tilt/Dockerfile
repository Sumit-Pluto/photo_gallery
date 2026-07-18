FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip git ca-certificates \
        libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/* && \
    ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Clone the research repo (inference code + configs). Pinning is recommended:
# replace HEAD with a specific commit once verified.
RUN git clone --depth 1 https://github.com/AlanSavio25/DeepSingleImageCalibration.git \
        /opt/DeepSingleImageCalibration

# Install the CUDA 12.1 torch stack + repo deps.
COPY workers/tilt/requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cu121 \
        torch==2.1.2 torchvision==0.16.2 && \
    pip install -r requirements.txt

# Best-effort install of the repo's own requirements if present (non-fatal).
RUN if [ -f /opt/DeepSingleImageCalibration/requirements.txt ]; then \
        pip install -r /opt/DeepSingleImageCalibration/requirements.txt || true ; \
    fi

COPY workers/tilt/handler.py .

CMD ["python3", "-u", "handler.py"]
