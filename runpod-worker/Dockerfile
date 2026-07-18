# RunPod Serverless worker: FLUX.2 [klein] image editing.
# CUDA 12.4 base + torch cu124: RunPod's RTX 3090/4090 hosts run driver 550
# (CUDA 12.4). A 12.8 base demands driver >= 12.8 and the container REFUSES to
# start on a 550 host ("nvidia-container-cli: unsatisfied condition: cuda>=12.8").
# 12.4 runs on driver 550+ and carries sm_86 (3090) + sm_89 (4090) kernels.
# NOTE: this does NOT carry Blackwell (sm_120) kernels — keep this endpoint's GPU
# pool to 3090/4090 (24 GB Ada/Ampere), not the PRO 6000 Blackwell cards.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip git && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# torch (CUDA 12.4 build) FIRST — matches the 12.4 base + driver 550 hosts.
RUN pip install --upgrade pip && \
    pip install torch --index-url https://download.pytorch.org/whl/cu124
COPY runpod-worker/requirements.txt .
RUN pip install -r requirements.txt

COPY runpod-worker/handler.py .

CMD ["python3", "-u", "handler.py"]
