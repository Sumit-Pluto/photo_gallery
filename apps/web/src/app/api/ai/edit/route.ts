import { type NextRequest, NextResponse } from 'next/server';

import { RunpodError } from '../../../../lib/runpod/client';
import { rpImg2Img, rpInpaint, rpRemoveBackground, rpUpscale } from '../../../../lib/runpod/endpoints';

export const runtime = 'nodejs';
export const maxDuration = 60; // SD / cold-start models can take a while

/**
 * Generative image-edit proxy. The BACKEND is pluggable so you are not tied to a
 * paid model — pick one with env `AI_EDIT_PROVIDER` (default `auto`):
 *
 *   - `runpod`      → your RunPod serverless GPU endpoints (one per model, per
 *                     docs/model-api-spec). Maps each op → endpoint: restore/upscale
 *                     → Real-ESRGAN (#7), colorize → DDColor (#8), replace-sky/
 *                     magic-eraser/generative-fill → SD 3.5 masked inpaint (#9),
 *                     prompt → SD 3.5 img2img (#10). Env: RUNPOD_API_KEY + per-model
 *                     RUNPOD_*_URL. Key stays server-side. See docs/AI-SETUP.md.
 *   - `local`       → your own Stable Diffusion server (Automatic1111 / Forge /
 *                     SD.Next img2img API). Env: LOCAL_SD_URL (e.g. http://127.0.0.1:7860).
 *                     100% free + private, needs a GPU box you run. Most reliable.
 *   - `huggingface` → free Hugging Face Inference API (instruction image editing).
 *                     Env: HF_API_TOKEN (free), HF_IMAGE_MODEL (default instruct-pix2pix).
 *   - `gemini`      → Google Gemini image model (needs a billed key for image output).
 *                     Env: GEMINI_API_KEY, GEMINI_IMAGE_MODEL.
 *   - `auto`        → first configured of: runpod → local → huggingface → gemini.
 *
 * NOTE: `remove-background` runs in-browser by default (@imgly, free, no key), so
 * it usually never reaches here. Object detection uses its own route (/api/ai/classify).
 * See docs/AI-SETUP.md.
 */

const OP_PROMPTS: Record<string, string> = {
  restore:
    'Restore and enhance this photograph: improve sharpness and clarity, correct exposure and white balance, reduce noise and compression artifacts, recover detail. Keep it natural and photorealistic.',
  colorize: 'Colorize this image with natural, realistic, well-balanced colors.',
  'replace-sky':
    'Replace the sky with a dramatic, beautiful golden-hour sky with soft clouds. Keep the foreground subject unchanged and the result photorealistic.',
};

const MAX_BASE64 = 4_000_000; // ~3 MB decoded — stays under serverless body limits (e.g. Vercel ~4.5MB)

type Provider = 'runpod' | 'local' | 'huggingface' | 'gemini' | 'none';

function resolveProvider(): Provider {
  const explicit = (process.env.AI_EDIT_PROVIDER || 'auto').toLowerCase();
  if (
    explicit === 'runpod' ||
    explicit === 'local' ||
    explicit === 'huggingface' ||
    explicit === 'gemini'
  )
    return explicit;
  if (explicit === 'none') return 'none';
  // auto: prefer RunPod GPU endpoints, then a private local server, then free HF, then Gemini.
  // Detect RunPod when the key + ANY image endpoint URL is set (an upscale/colorize-only
  // deployment is valid — not just the SD ones).
  if (
    process.env.RUNPOD_API_KEY &&
    (process.env.RUNPOD_SD_IMG2IMG_URL ||
      process.env.RUNPOD_SD_INPAINT_URL ||
      process.env.RUNPOD_UPSCALE_URL ||
      process.env.RUNPOD_COLORIZE_URL ||
      process.env.RUNPOD_BG_REMOVE_URL)
  )
    return 'runpod';
  if (process.env.LOCAL_SD_URL) return 'local';
  if (process.env.HF_API_TOKEN) return 'huggingface';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'none';
}

/** Ops that only the RunPod (mask/fixed-function) backend can serve. */
const RUNPOD_ONLY_OPS = new Set(['upscale', 'magic-eraser', 'generative-fill']);

interface EditResult {
  imageBase64: string;
  mimeType: string;
}

export async function POST(req: NextRequest) {
  const provider = resolveProvider();
  if (provider === 'none') {
    return NextResponse.json(
      {
        error:
          'AI image editing is not configured. Set AI_EDIT_PROVIDER=runpod + RUNPOD_API_KEY + the per-model RUNPOD_*_URL vars (RunPod GPU), or LOCAL_SD_URL (own Stable Diffusion), HF_API_TOKEN (free Hugging Face), or GEMINI_API_KEY. Background removal and all analysis still work with no key. See docs/AI-SETUP.md.',
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { imageBase64, mimeType, op, maskBase64, params } = (body ?? {}) as {
    imageBase64?: unknown;
    mimeType?: unknown;
    op?: { type?: string; prompt?: string; factor?: number };
    maskBase64?: unknown;
    params?: unknown;
  };

  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return NextResponse.json({ error: 'Invalid image.' }, { status: 400 });
  }
  const hasMask = typeof maskBase64 === 'string' && maskBase64.length > 0;
  // Image + mask share one request body — budget them together against the cap.
  if (imageBase64.length + (hasMask ? (maskBase64 as string).length : 0) > MAX_BASE64) {
    return NextResponse.json({ error: 'Image (plus mask) is too large — try a smaller image.' }, { status: 400 });
  }
  const safeMime =
    typeof mimeType === 'string' && /^image\/(jpeg|png|webp)$/.test(mimeType) ? mimeType : 'image/jpeg';

  const opType = op?.type ?? '';
  if (provider !== 'runpod' && RUNPOD_ONLY_OPS.has(opType)) {
    return NextResponse.json(
      { error: 'This edit needs the RunPod backend (set AI_EDIT_PROVIDER=runpod).' },
      { status: 400 },
    );
  }

  // Build the instruction from an allow-listed op (never trust arbitrary server prompts).
  let instruction = '';
  if (opType === 'prompt' || opType === 'generative-fill') {
    const p = typeof op?.prompt === 'string' ? op.prompt.trim() : '';
    if (!p) return NextResponse.json({ error: 'Empty prompt.' }, { status: 400 });
    instruction = p.slice(0, 500);
  } else if (opType === 'replace-sky') {
    instruction =
      typeof op?.prompt === 'string' && op.prompt.trim()
        ? `Replace the sky with: ${op.prompt.trim().slice(0, 300)}. Keep the foreground unchanged and photorealistic.`
        : OP_PROMPTS['replace-sky']!;
  } else if (opType === 'magic-eraser') {
    instruction = 'Fill the selected region with a clean, seamless, plausible background. Photorealistic.';
  } else if (OP_PROMPTS[opType]) {
    instruction = OP_PROMPTS[opType]!;
  } else if (opType !== 'upscale') {
    return NextResponse.json({ error: 'Unsupported operation.' }, { status: 400 });
  }

  try {
    let result: EditResult;
    if (provider === 'runpod')
      result = await editRunPod(op ?? {}, imageBase64, instruction, hasMask ? (maskBase64 as string) : undefined, params);
    else if (provider === 'local') result = await editLocal(instruction, imageBase64);
    else if (provider === 'huggingface') result = await editHuggingFace(instruction, imageBase64);
    else result = await editGemini(instruction, imageBase64, safeMime);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI request failed.';
    const status = err instanceof AiError || err instanceof RunpodError ? err.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

// ---------------------------------------------------------------------------
// Backend: RunPod serverless GPU endpoints (one model per endpoint).
// Each op maps to the endpoint from the spec; the API key + URLs stay server-side.
// ---------------------------------------------------------------------------
interface SdParams {
  negativePrompt?: string;
  strength?: number;
  steps?: number;
  seed?: number;
  guidanceScale?: number;
}

function sanitizeParams(raw: unknown): SdParams {
  const p = (raw ?? {}) as Record<string, unknown>;
  const out: SdParams = {};
  if (typeof p.negativePrompt === 'string' && p.negativePrompt.trim())
    out.negativePrompt = p.negativePrompt.trim().slice(0, 300);
  const strength = Number(p.strength);
  if (Number.isFinite(strength)) out.strength = Math.max(0, Math.min(1, strength));
  const steps = Number(p.steps);
  if (Number.isFinite(steps)) out.steps = Math.max(1, Math.min(60, Math.round(steps)));
  const guidance = Number(p.guidanceScale);
  if (Number.isFinite(guidance)) out.guidanceScale = Math.max(1, Math.min(20, guidance));
  const seed = Number(p.seed);
  if (Number.isFinite(seed)) out.seed = Math.max(0, Math.min(2_147_483_647, Math.round(seed)));
  return out;
}

async function editRunPod(
  op: { type?: string; prompt?: string; factor?: number },
  imageBase64: string,
  instruction: string,
  maskBase64: string | undefined,
  rawParams: unknown,
): Promise<EditResult> {
  const params = sanitizeParams(rawParams);
  switch (op.type) {
    case 'remove-background':
      // U²-Net via rembg (#6) — a real endpoint replacing the flaky in-browser remover.
      return rpRemoveBackground(imageBase64);
    case 'restore':
      // Real-ESRGAN (#7) with the GFPGAN face pass = "Restore & Enhance".
      return rpUpscale(imageBase64, 4, true);
    case 'upscale':
      return rpUpscale(imageBase64, op.factor === 4 ? 4 : 2, false);
    case 'colorize':
      // The dedicated DDColor endpoint kept hard-crashing (modelscope). Route
      // colorize through the img2img model as an instruction instead — reliable,
      // and high quality once img2img is FLUX. (RUNPOD_COLORIZE_URL now unused.)
      return rpImg2Img({ imageB64: imageBase64, prompt: instruction, ...params });
    case 'prompt':
      return rpImg2Img({ imageB64: imageBase64, prompt: instruction, ...params }); // SD 3.5 img2img (#10)
    case 'replace-sky':
      // True sky replacement is masked inpaint (#9). Without a mask (no in-app sky
      // segmentation yet) degrade to a low-strength img2img (#10) so the foreground
      // is mostly preserved. Add a mask (brush UI / sky-seg) to get real #9.
      if (maskBase64)
        return rpInpaint({ imageB64: imageBase64, maskB64: maskBase64, prompt: instruction, ...params });
      return rpImg2Img({ imageB64: imageBase64, prompt: instruction, ...params, strength: params.strength ?? 0.4 });
    case 'magic-eraser':
    case 'generative-fill':
      // SD 3.5 masked inpaint (#9) — white in the mask = the region to regenerate.
      if (!maskBase64) throw new AiError('This edit needs a mask/selection.', 400);
      return rpInpaint({ imageB64: imageBase64, maskB64: maskBase64, prompt: instruction, ...params });
    default:
      throw new AiError('Unsupported operation.', 400);
  }
}

class AiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Backend: local Stable Diffusion (Automatic1111 / Forge / SD.Next img2img API)
// ---------------------------------------------------------------------------
async function editLocal(instruction: string, imageBase64: string): Promise<EditResult> {
  const base = process.env.LOCAL_SD_URL;
  if (!base || !/^https?:\/\//i.test(base)) {
    throw new AiError('LOCAL_SD_URL is not a valid http(s) URL.', 500);
  }
  const url = `${base.replace(/\/$/, '')}/sdapi/v1/img2img`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        init_images: [imageBase64],
        prompt: instruction,
        denoising_strength: Number(process.env.LOCAL_SD_DENOISE ?? 0.55),
        steps: Number(process.env.LOCAL_SD_STEPS ?? 25),
        cfg_scale: 7,
        sampler_name: process.env.LOCAL_SD_SAMPLER || 'Euler a',
      }),
    });
  } catch {
    throw new AiError('Could not reach your local Stable Diffusion server (LOCAL_SD_URL).', 502);
  }
  if (!res.ok) {
    throw new AiError(`Local SD server error (${res.status}).`, 502);
  }
  const data = (await res.json().catch(() => null)) as { images?: string[] } | null;
  const out = data?.images?.[0];
  if (!out) throw new AiError('Local SD server did not return an image.', 502);
  // A1111 returns raw base64 PNG (no data: prefix).
  return { imageBase64: out.includes(',') ? out.split(',')[1]! : out, mimeType: 'image/png' };
}

// ---------------------------------------------------------------------------
// Backend: Hugging Face Inference API (free tier) — instruction image editing.
// ---------------------------------------------------------------------------
async function editHuggingFace(instruction: string, imageBase64: string): Promise<EditResult> {
  const token = process.env.HF_API_TOKEN;
  if (!token) throw new AiError('HF_API_TOKEN is not set.', 500);
  const model = process.env.HF_IMAGE_MODEL || 'timbrooks/instruct-pix2pix';
  let res: Response;
  try {
    res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        // Wait for the (free) model to warm up instead of a fast 503.
        'x-wait-for-model': 'true',
      },
      body: JSON.stringify({
        inputs: imageBase64,
        parameters: { prompt: instruction, guidance_scale: 7, image_guidance_scale: 1.5 },
      }),
    });
  } catch {
    throw new AiError('Could not reach the Hugging Face Inference API.', 502);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    if (res.status === 503)
      throw new AiError('The free model is loading — try again in ~20s.', 503);
    throw new AiError(`Hugging Face error (${res.status}). ${detail}`, 502);
  }
  // Success returns raw image bytes.
  const outMime = res.headers.get('content-type') || 'image/png';
  if (outMime.startsWith('application/json')) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new AiError(j?.error ? `Hugging Face: ${j.error}` : 'Hugging Face returned no image.', 502);
  }
  const buf = await res.arrayBuffer();
  return { imageBase64: Buffer.from(buf).toString('base64'), mimeType: outMime };
}

// ---------------------------------------------------------------------------
// Backend: Google Gemini image model (needs a billed key for image output).
// ---------------------------------------------------------------------------
async function editGemini(instruction: string, imageBase64: string, safeMime: string): Promise<EditResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError('GEMINI_API_KEY is not set.', 500);
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const prompt = `Edit this image as follows: ${instruction}. Preserve realism unless explicitly asked otherwise.`;
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ inlineData: { mimeType: safeMime, data: imageBase64 } }, { text: prompt }] },
          ],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      },
    );
  } catch {
    throw new AiError('Could not reach the AI service.', 502);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    throw new AiError(`AI service error (${res.status}). ${detail}`, 502);
  }
  const data = (await res.json().catch(() => null)) as GeminiResponse | null;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
  const out = imgPart?.inlineData?.data ?? imgPart?.inline_data?.data;
  if (!out) throw new AiError('The model did not return an image (the free Gemini tier has no image output — use LOCAL_SD_URL or HF_API_TOKEN instead).', 502);
  const outMime = imgPart?.inlineData?.mimeType ?? imgPart?.inline_data?.mime_type ?? 'image/png';
  return { imageBase64: out, mimeType: outMime };
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}
