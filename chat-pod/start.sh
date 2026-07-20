#!/usr/bin/env bash
# =============================================================================
# CRM chat + translate pod — self-bootstrapping start script.
#
# Set this as the Pod's Docker/Start Command (one line):
#   bash -c "curl -fsSL https://raw.githubusercontent.com/Sumit-Pluto/photo_gallery/main/chat-pod/start.sh | bash"
#
# It is IDEMPOTENT: safe to run on first boot AND on every Resume. Everything
# heavy (models + python deps) lives on the /workspace VOLUME, so Stop/Resume
# keeps it — the CRM team just needs the two proxy URLs, nothing to edit.
#
#   Qwen2.5-14B (chat/assistant)  -> GPU, Ollama,  port 11434 (OpenAI-compatible)
#   NLLB-200-1.3B (translation)   -> CPU, CTranslate2 + FastAPI, port 8000
# =============================================================================
set -uo pipefail

WORK=/workspace
VENV="$WORK/venv"
export OLLAMA_MODELS="$WORK/ollama"
export OLLAMA_HOST=0.0.0.0
export NLLB_HF="facebook/nllb-200-1.3B"
export NLLB_CT2="$WORK/nllb-ct2"
QWEN_MODEL="${QWEN_MODEL:-qwen2.5:14b-instruct-q8_0}"   # 8-bit ~16GB; override via env

mkdir -p "$WORK" "$OLLAMA_MODELS"
echo "[chat-pod] boot — models/deps on $WORK (persist across Stop/Resume)"

# --- 0. system deps: lspci lets Ollama auto-detect the GPU (else it may use CPU) ---
if ! command -v lspci >/dev/null 2>&1; then
  echo "[chat-pod] installing pciutils (GPU detection)..."
  apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq pciutils >/dev/null 2>&1 || true
fi

# --- 1. Ollama (installs to container disk; reinstalled cheaply if missing) ----
if ! command -v ollama >/dev/null 2>&1; then
  echo "[chat-pod] installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

# --- 2. Python deps on the VOLUME (persist) -----------------------------------
if [ ! -x "$VENV/bin/uvicorn" ]; then
  echo "[chat-pod] creating venv + installing NLLB deps (one time)..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q ctranslate2 transformers sentencepiece fastapi uvicorn
fi

# --- 3. Fetch the translate server (always latest from repo) -------------------
curl -fsSL https://raw.githubusercontent.com/Sumit-Pluto/photo_gallery/main/chat-pod/translate.py -o "$WORK/translate.py" \
  || echo "[chat-pod] WARN: could not refresh translate.py (using existing)"

# --- 4. Start Ollama, wait for it, ensure Qwen is pulled (idempotent) ---------
echo "[chat-pod] starting Ollama (GPU)..."
ollama serve &
for i in $(seq 1 30); do curl -s http://localhost:11434/api/tags >/dev/null 2>&1 && break; sleep 2; done
echo "[chat-pod] ensuring model $QWEN_MODEL (first time downloads ~16GB)..."
ollama pull "$QWEN_MODEL" || echo "[chat-pod] WARN: pull failed (will use cached if present)"

# --- 5. Convert NLLB once (cached on the volume after) ------------------------
if [ ! -d "$NLLB_CT2" ]; then
  echo "[chat-pod] converting NLLB -> CTranslate2 int8 (one time)..."
  "$VENV/bin/ct2-transformers-converter" --model "$NLLB_HF" --output_dir "$NLLB_CT2" --quantization int8
fi

# --- 6. Start the NLLB translate API (CPU) -----------------------------------
echo "[chat-pod] starting NLLB translate API (CPU) on :8000..."
cd "$WORK"
"$VENV/bin/uvicorn" translate:app --host 0.0.0.0 --port 8000 &

echo "[chat-pod] READY  ->  Qwen :11434 (chat)  |  NLLB :8000 (translate)"
wait
