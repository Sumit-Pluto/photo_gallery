"""
NLLB-200 translation API (CPU, CTranslate2 int8). Part of the CRM chat pod.
Runs on port 8000 alongside Ollama/Qwen (port 11434) on the same pod.

POST /translate  {"text": "...", "source": "eng_Latn", "target": "hin_Deva"}
              -> {"translation": "..."}
GET  /health  -> {"ok": true}

Optional auth: set env CHAT_POD_KEY, then callers must send
`Authorization: Bearer <key>`.
"""

import os

import ctranslate2
import transformers
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

CT2 = os.environ.get("NLLB_CT2", "/workspace/nllb-ct2")
HF = os.environ.get("NLLB_HF", "facebook/nllb-200-1.3B")
API_KEY = os.environ.get("CHAT_POD_KEY", "")

_translator = ctranslate2.Translator(CT2, device="cpu", compute_type="int8")
_tok = transformers.AutoTokenizer.from_pretrained(HF)

app = FastAPI(title="CRM Translate (NLLB-200)")


class Req(BaseModel):
    text: str
    source: str  # FLORES code, e.g. "eng_Latn"
    target: str  # FLORES code, e.g. "hin_Deva"


def _check(authorization: str) -> None:
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.post("/translate")
def translate(r: Req, authorization: str = Header(default="")):
    _check(authorization)
    text = (r.text or "").strip()
    if not text:
        return {"translation": ""}
    _tok.src_lang = r.source
    source = _tok.convert_ids_to_tokens(_tok.encode(text))
    results = _translator.translate_batch([source], target_prefix=[[r.target]])
    hyp = results[0].hypotheses[0][1:]  # drop the leading target-language token
    return {"translation": _tok.decode(_tok.convert_tokens_to_ids(hyp))}


@app.get("/health")
def health():
    return {"ok": True}
