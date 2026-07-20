/**
 * Typed wrappers for each RunPod endpoint in `model-api-spec.docx`.
 * Every function reads its own `RUNPOD_*_URL` env var, sends the exact `input`
 * contract the spec documents, and normalizes the response.
 *
 * Server-side only. Missing/invalid URLs throw a RunpodError(500) so an
 * unconfigured op surfaces as a clear message in the editor rather than a crash.
 */

import { stripDataUri, pickOutputImage } from './base64';
import { RunpodError, runpodCall } from './client';
import type {
  Img2ImgReq,
  InpaintReq,
  RunpodDetection,
  RunpodImageResult,
  TiltResult,
  TranscriptResult,
} from './types';

function envNum(v: string | undefined, fallback: number): number {
  // Treat a blank/whitespace env var as unset — Number('') is 0 (finite), which
  // would otherwise send e.g. strength:0 for `RUNPOD_SD_STRENGTH=`.
  if (v == null || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function endpointUrl(envVar: string): string {
  const url = process.env[envVar];
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new RunpodError(`${envVar} is not set (or is not an http(s) URL).`, 500);
  }
  return url;
}

/** Run an image-in/image-out endpoint and normalize the result to base64 PNG. */
async function imageOp(
  name: string,
  envVar: string,
  input: Record<string, unknown>,
): Promise<RunpodImageResult> {
  const output = await runpodCall({ name, url: endpointUrl(envVar), input });
  return { imageBase64: pickOutputImage(output), mimeType: 'image/png' };
}

// ---------------------------------------------------------------------------
// Image endpoints
// ---------------------------------------------------------------------------

/** #6 Background removal (U²-Net via rembg). model: u2net | u2netp | u2net_human_seg */
export function rpRemoveBackground(imageB64: string, model?: string): Promise<RunpodImageResult> {
  return imageOp('background-removal', 'RUNPOD_BG_REMOVE_URL', {
    task: 'remove-bg',
    image: imageB64,
    ...(model ? { model_name: model } : {}),
  });
}

/** #7 Real-ESRGAN enhance/upscale (RealESRGAN_x4plus). The caller's scale (from the
 *  op / restore pass) is authoritative — it is not overridden by any env default. */
export function rpUpscale(imageB64: string, scale: 2 | 4, faceEnhance = false): Promise<RunpodImageResult> {
  return imageOp('upscale', 'RUNPOD_UPSCALE_URL', {
    task: 'upscale',
    image: imageB64,
    scale,
    face_enhance: faceEnhance,
  });
}

/** #8 DDColor B&W → colorize. */
export function rpColorize(imageB64: string, inputSize?: number): Promise<RunpodImageResult> {
  return imageOp('colorize', 'RUNPOD_COLORIZE_URL', {
    image: imageB64,
    ...(inputSize ? { input_size: inputSize } : {}),
  });
}

/** #9 SD 3.5 masked inpainting (sky fix / eraser / fill). Also #11 outpaint (pre-padded). */
export function rpInpaint(p: InpaintReq): Promise<RunpodImageResult> {
  const input: Record<string, unknown> = {
    task: 'inpaint',
    image: p.imageB64,
    mask: p.maskB64,
    prompt: p.prompt,
    strength: p.strength ?? envNum(process.env.RUNPOD_SD_STRENGTH, 0.8),
    guidance_scale: p.guidanceScale ?? envNum(process.env.RUNPOD_SD_GUIDANCE, 7),
    num_inference_steps: p.steps ?? envNum(process.env.RUNPOD_SD_STEPS, 35),
  };
  const negative = p.negativePrompt ?? process.env.RUNPOD_SD_NEGATIVE_PROMPT;
  if (negative) input.negative_prompt = negative;
  if (p.seed != null) input.seed = p.seed;
  return imageOp('sd-inpaint', 'RUNPOD_SD_INPAINT_URL', input);
}

/** #10 SD 3.5 general prompt edit (img2img, no mask). */
export function rpImg2Img(p: Img2ImgReq): Promise<RunpodImageResult> {
  const input: Record<string, unknown> = {
    task: 'img2img',
    image: p.imageB64,
    prompt: p.prompt,
    strength: p.strength ?? envNum(process.env.RUNPOD_SD_STRENGTH, 0.6),
    guidance_scale: p.guidanceScale ?? envNum(process.env.RUNPOD_SD_GUIDANCE, 7),
    num_inference_steps: p.steps ?? envNum(process.env.RUNPOD_SD_STEPS, 35),
  };
  const negative = p.negativePrompt ?? process.env.RUNPOD_SD_NEGATIVE_PROMPT;
  if (negative) input.negative_prompt = negative;
  if (p.seed != null) input.seed = p.seed;
  return imageOp('sd-img2img', 'RUNPOD_SD_IMG2IMG_URL', input);
}

// ---------------------------------------------------------------------------
// #1 YOLO detection → SDK DetectedObject shape (box as fractions 0..1)
// ---------------------------------------------------------------------------

export async function rpDetect(
  imageB64: string,
  width: number,
  height: number,
): Promise<RunpodDetection[]> {
  const output = await runpodCall<unknown>({
    name: 'yolo-detect',
    url: endpointUrl('RUNPOD_YOLO_URL'),
    input: { image: imageB64, task: 'detect' },
  });
  return normalizeDetections(output, width, height);
}

function extractDetectionArray(output: unknown): unknown[] {
  if (Array.isArray(output)) return output;
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    for (const key of ['detections', 'predictions', 'objects', 'results', 'boxes']) {
      if (Array.isArray(o[key])) return o[key] as unknown[];
    }
  }
  return [];
}

/** First non-empty STRING among the args (numbers ignored — a numeric `class` is an index, not a name). */
function firstLabel(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function normalizeDetections(output: unknown, width: number, height: number): RunpodDetection[] {
  const out: RunpodDetection[] = [];
  for (const raw of extractDetectionArray(output)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    // Prefer a human-readable name (ultralytics tojson puts the string in `name`
    // and a numeric index in `class`); fall back to class_<id>. Using firstLabel
    // (not `??`) also means an explicit empty-string label doesn't get kept + dropped.
    const classId = o.class_id ?? (typeof o.class === 'number' ? o.class : undefined);
    const label = (
      firstLabel(o.label, o.name, o.class_name, typeof o.class === 'string' ? o.class : undefined) ??
      (classId != null ? `class_${classId}` : 'object')
    ).toLowerCase();
    const confidence = Number(o.confidence ?? o.score ?? o.conf ?? 0) || 0;
    const box = normalizeBox(o, width, height);
    if (box && label) out.push({ label, confidence, box });
  }
  return out;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asNum4(v: unknown): [number, number, number, number] | null {
  if (!Array.isArray(v) || v.length < 4) return null;
  const a = num(v[0]);
  const b = num(v[1]);
  const c = num(v[2]);
  const d = num(v[3]);
  return a === null || b === null || c === null || d === null ? null : [a, b, c, d];
}

/**
 * Normalize a detection box to {x, y, width, height} as fractions 0..1 of the
 * image, from whatever shape the endpoint emits:
 *   - `xyxy: [x1,y1,x2,y2]` (ultralytics) and generic `box: [...]` → corner form
 *   - `xywh: [...]` and COCO `bbox: [x,y,w,h]` → x/y/width/height form
 *   - object `{x1,y1,x2,y2}` / `{left,top,right,bottom}` (ultralytics tojson) → corners
 *   - object `{x,y,width,height}` → x/y/width/height
 * Pixel values (any component > 1) are divided by the image dims; already-
 * normalized fractions pass through. VERIFY the shape against your live #1 endpoint.
 */
function normalizeBox(o: Record<string, unknown>, width: number, height: number): RunpodDetection['box'] | null {
  const W = width || 1;
  const H = height || 1;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const frac = (x: number, y: number, w: number, h: number): RunpodDetection['box'] => {
    if (Math.max(Math.abs(x), Math.abs(y), Math.abs(w), Math.abs(h)) > 1) {
      x /= W;
      y /= H;
      w /= W;
      h /= H;
    }
    return { x: clamp01(x), y: clamp01(y), width: clamp01(w), height: clamp01(h) };
  };
  const fromXyxy = (x1: number, y1: number, x2: number, y2: number) => frac(x1, y1, x2 - x1, y2 - y1);

  // 1. Array boxes, interpreted by which key holds them.
  const xyxyArr = asNum4(o.xyxy);
  if (xyxyArr) return fromXyxy(xyxyArr[0], xyxyArr[1], xyxyArr[2], xyxyArr[3]);
  const xywhArr = asNum4(o.xywh) ?? asNum4(o.bbox); // COCO `bbox` is [x,y,w,h]
  if (xywhArr) return frac(xywhArr[0], xywhArr[1], xywhArr[2], xywhArr[3]);
  const boxArr = asNum4(o.box); // generic array box → assume corner form
  if (boxArr) return fromXyxy(boxArr[0], boxArr[1], boxArr[2], boxArr[3]);

  // 2. Object boxes (either nested under `box` or directly on the detection).
  const src = o.box && typeof o.box === 'object' && !Array.isArray(o.box) ? (o.box as Record<string, unknown>) : o;
  const x1 = num(src.x1 ?? src.left);
  const y1 = num(src.y1 ?? src.top);
  const x2 = num(src.x2 ?? src.right);
  const y2 = num(src.y2 ?? src.bottom);
  if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) return fromXyxy(x1, y1, x2, y2);

  const x = num(src.x);
  const y = num(src.y);
  const w = num(src.width);
  const h = num(src.height);
  if (x !== null && y !== null && w !== null && h !== null) return frac(x, y, w, h);

  return null;
}

// ---------------------------------------------------------------------------
// Scaffold-only endpoints (typed + wired to env, but no route/UI yet).
// See docs/AI-SETUP.md → "Not yet wired". Kept so the client covers all 15
// endpoints and a future feature can call them without new plumbing.
// ---------------------------------------------------------------------------

/** #2 Camera tilt (DeepSingleImageCalibration). */
export async function rpTilt(imageB64: string): Promise<TiltResult> {
  const o = await runpodCall<Record<string, unknown>>({
    name: 'tilt',
    url: endpointUrl('RUNPOD_TILT_URL'),
    input: { image: imageB64 },
  });
  return {
    rollDegrees: Number(o.roll_degrees ?? 0) || 0,
    pitchDegrees: Number(o.pitch_degrees ?? 0) || 0,
    fovDegrees: Number(o.fov_degrees ?? 0) || 0,
  };
}

/** #3 Voice-to-text (Parakeet). Audio must be WAV 16kHz mono PCM16. */
export async function rpTranscribe(
  audioB64: string,
  opts?: { language?: string; timestamps?: boolean; punctuation?: boolean },
): Promise<TranscriptResult> {
  const o = await runpodCall<Record<string, unknown>>({
    name: 'transcribe',
    url: endpointUrl('RUNPOD_STT_URL'),
    input: { audio: audioB64, task: 'transcribe', ...(opts ?? {}) },
  });
  const rawSegments = Array.isArray(o.segments) ? o.segments : [];
  const segments = rawSegments.map((s) => {
    const seg = (s ?? {}) as Record<string, unknown>;
    return {
      text: String(seg.text ?? ''),
      startSec: Number(seg.start_sec ?? 0) || 0,
      endSec: Number(seg.end_sec ?? 0) || 0,
    };
  });
  return { transcript: String(o.transcript ?? ''), segments: segments.length ? segments : undefined };
}

/** #12 Audio noise removal (RNNoise). Audio must be WAV 48kHz mono 16-bit PCM. */
export async function rpDenoiseAudio(audioB64: string): Promise<{ audioB64: string }> {
  const o = await runpodCall<Record<string, unknown>>({
    name: 'audio-denoise',
    url: endpointUrl('RUNPOD_AUDIO_DENOISE_URL'),
    input: { audio: audioB64, task: 'denoise' },
  });
  const a = o.audio ?? o.output ?? '';
  return { audioB64: stripDataUri(String(a)) };
}
