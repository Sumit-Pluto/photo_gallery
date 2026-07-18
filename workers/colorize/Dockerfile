FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-dev \
        libgl1 libglib2.0-0 \
        git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY workers/colorize/requirements.txt .
RUN pip3 install --upgrade pip && pip3 install -r requirements.txt

COPY workers/colorize/handler.py .

CMD ["python3", "-u", "handler.py"]
