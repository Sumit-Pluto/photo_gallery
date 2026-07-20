# CRM Chat + Translate Pod (self-bootstrapping)

One RunPod **Pod** running **Qwen2.5-14B** (chat/assistant, GPU) + **NLLB-200-1.3B**
(translation, CPU). It **auto-starts on every boot/resume** — you only Stop/Resume;
the CRM team's URLs never change and nothing needs editing.

## One-time: create the Pod
RunPod → **Pods → Deploy**:

| Setting | Value |
|---|---|
| **GPU** | **RTX 3090 (24 GB)** — On-Demand / Secure Cloud (not Spot) |
| **Template** | RunPod PyTorch (has python3 + CUDA) |
| **Network Volume** | create one, **~50 GB**, mount at **`/workspace`** ← holds models + deps so Stop/Resume keeps them |
| **Container Disk** | **40 GB** |
| **Expose HTTP Ports** (Edit Template) | `8000,11434` |
| **Docker / Start Command** | see below |

**Start Command** (paste exactly — this is the whole setup):
```
bash -c "curl -fsSL https://raw.githubusercontent.com/Sumit-Pluto/photo_gallery/main/chat-pod/start.sh | bash"
```

First boot downloads Qwen (~16 GB) + converts NLLB → **~15–20 min**. Every Resume
after that: models already on the volume → **ready in ~1–2 min**, same URLs.

## The two URLs to share with the CRM team
After deploy, each exposed port has a stable proxy URL (stable as long as you
**Stop/Resume**, never Terminate):
```
Chat  (Qwen, OpenAI-compatible):  https://<POD_ID>-11434.proxy.runpod.net/v1/chat/completions
Translate (NLLB):                 https://<POD_ID>-8000.proxy.runpod.net/translate
```

## API for the CRM
**Chat / summarize** (OpenAI format, supports `stream:true`):
```json
POST /v1/chat/completions
{ "model": "qwen2.5:14b-instruct-q8_0", "stream": true,
  "messages": [{ "role": "user", "content": "Summarize this thread in English: ..." }] }
```
**Translate before send / on receive:**
```json
POST /translate
{ "text": "When can you deliver the cement?", "source": "eng_Latn", "target": "hin_Deva" }
-> { "translation": "..." }
```

## FLORES language codes (NLLB)
`eng_Latn` English · `hin_Deva` Hindi · `spa_Latn` Spanish · `fra_Latn` French ·
`deu_Latn` German · `arb_Arab` Arabic · `zho_Hans` Chinese · `rus_Cyrl` Russian ·
`por_Latn` Portuguese · `ben_Beng` Bengali · `tam_Taml` Tamil · `tel_Telu` Telugu ·
`mar_Deva` Marathi · `guj_Gujr` Gujarati · `pan_Guru` Punjabi · `jpn_Jpan` Japanese ·
`kor_Hang` Korean · `vie_Latn` Vietnamese · `ind_Latn` Indonesian
(full list: NLLB-200 FLORES-200 codes.) Your CRM maps each user's language → its code.

## Security (do this)
- **Only call these URLs from your CRM backend**, never the browser (the proxy URLs are public).
- Optional: set env **`CHAT_POD_KEY`** on the pod → the translate API then requires
  `Authorization: Bearer <key>`. (Ollama has no built-in auth — keep it backend-only or front it with a gateway.)

## Daily operation (what you actually do)
- **Start working:** Pod → **Resume** → wait ~1–2 min → team uses the same URLs.
- **Done:** Pod → **Stop** (stops GPU billing; keeps the volume + URL).
- **Never Terminate** — that deletes the pod and changes the URL.

## Tuning
- Lighter/faster model: set env `QWEN_MODEL=qwen2.5:14b` (Q4, ~9 GB) or `qwen2.5:7b`.
- The script reads `QWEN_MODEL`, `NLLB_HF`, `CHAT_POD_KEY` from env if you want to override.
