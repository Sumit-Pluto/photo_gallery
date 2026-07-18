FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_NO_CACHE_DIR=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-dev \
        libgl1 libglib2.0-0 wget ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Newer CUDA-12.1 torch so the compiled kernels cover current GPUs (fixes
# "no kernel image is available for execution on the device"). The basicsr
# functional_tensor import (removed in torchvision>=0.16) is handled by the
# sed-patch below instead of pinning an old torchvision.
RUN pip install --upgrade pip && \
    pip install torch==2.1.2 torchvision==0.16.2 \
        --index-url https://download.pytorch.org/whl/cu121

COPY workers/upscale/requirements.txt .
RUN pip install -r requirements.txt

# Robustly fix basicsr's removed torchvision import (the #1 Real-ESRGAN crash).
# Works whether or not the torch/torchvision pin held — rewrites the bad import.
RUN F=$(python3 -c 'import basicsr,os;print(os.path.join(os.path.dirname(basicsr.__file__),"data","degradations.py"))') && \
    sed -i 's/from torchvision.transforms.functional_tensor import rgb_to_grayscale/from torchvision.transforms.functional import rgb_to_grayscale/' "$F" && \
    echo "patched basicsr degradations.py"

COPY workers/upscale/handler.py .

CMD ["python3","-u","handler.py"]
