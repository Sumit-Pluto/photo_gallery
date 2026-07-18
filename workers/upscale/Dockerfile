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

# FIX for the basicsr functional_tensor bug: install a torch/torchvision pair that
# still ships torchvision.transforms.functional_tensor (removed in torchvision>=0.16)
# BEFORE realesrgan/basicsr are installed, so pip does not pull a newer torchvision.
RUN pip install --upgrade pip && \
    pip install torch==2.0.1 torchvision==0.15.2 \
        --index-url https://download.pytorch.org/whl/cu118

COPY workers/upscale/requirements.txt .
RUN pip install -r requirements.txt

# Robustly fix basicsr's removed torchvision import (the #1 Real-ESRGAN crash).
# Works whether or not the torch/torchvision pin held — rewrites the bad import.
RUN F=$(python3 -c 'import basicsr,os;print(os.path.join(os.path.dirname(basicsr.__file__),"data","degradations.py"))') && \
    sed -i 's/from torchvision.transforms.functional_tensor import rgb_to_grayscale/from torchvision.transforms.functional import rgb_to_grayscale/' "$F" && \
    echo "patched basicsr degradations.py"

COPY workers/upscale/handler.py .

CMD ["python3","-u","handler.py"]
