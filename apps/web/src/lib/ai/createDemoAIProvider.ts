import type { AIProvider } from '@photo-gallery/sdk';

import { createClipProvider } from './clipProvider';
import { createFaceProvider } from './faceProvider';
import { imageToBase64, maskToBase64 } from './imageEncode';
import { createOCRProvider } from './ocrProvider';
import { createRunpodYoloProvider } from './runpodYoloProvider';
import { createTensorflowProvider } from './tensorflowProvider';

/**
 * The demo's AI provider, combining free in-browser capabilities + a
 * server-proxied generative-edit backend (RunPod / local SD / Hugging Face / Gemini):
 *  - object detection: TensorFlow.js COCO-SSD, fully in-browser (no key)
 *  - face detection + recognition: face-api.js, in-browser → clustered into People
 *  - OCR: tesseract.js, in-browser → searchable text + the Documents album (no key)
 *  - background removal: @imgly, in-browser WASM (no key) — see generativeEdit
 *  - other generative edits: proxied through /api/ai/edit (RunPod / local SD /
 *    Hugging Face / Gemini, chosen by env) so the API key stays server-side.
 *
 * Object detection uses the in-browser COCO-SSD by default, or the RunPod YOLO
 * construction-material classifier (#1) when NEXT_PUBLIC_APG_RUNPOD_DETECT=true
 * (proxied through /api/ai/classify, with COCO-SSD as the automatic fallback).
 */
export function createDemoAIProvider(): AIProvider {
  const tf = createTensorflowProvider();
  const face = createFaceProvider();
  const ocr = createOCRProvider();
  const clip = createClipProvider();

  // Opt-in server-side detection; defaults to free in-browser COCO-SSD.
  const detectObjects =
    process.env.NEXT_PUBLIC_APG_RUNPOD_DETECT === 'true'
      ? createRunpodYoloProvider(tf).detectObjects
      : tf.detectObjects;

  return {
    name: 'demo-ai (coco-ssd/yolo + face-api + tesseract + clip + runpod-edit)',
    detectObjects,
    detectFaces: face.detectFaces,
    ocr: ocr.ocr,
    embedImage: clip.embedImage,
    embedText: clip.embedText,

    async generativeEdit(item, image, op) {
      // Remove Background runs fully in-browser (free, no key) via @imgly — works
      // even with no backend. Other ops go through the /api/ai/edit route.
      if (op.type === 'remove-background') {
        const inputBlob = await canvasBlob(image, 1600);
        const { removeBackground } = await import('@imgly/background-removal');
        return removeBackground(inputBlob, { output: { format: 'image/png' } });
      }

      // Outpaint / expand-canvas: pad the image with a neutral border, mark that
      // border WHITE in the mask, and run it through the same inpaint path as
      // generative-fill — no extra backend route needed.
      if (op.type === 'outpaint') {
        const { imageBase64: padded, maskBase64: border } = padForOutpaint(
          image,
          typeof op.factor === 'number' ? op.factor : 1.5,
        );
        const outParams: Record<string, unknown> = {};
        if (typeof op.strength === 'number') outParams.strength = op.strength;
        const outRes = await fetch('/api/ai/edit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            imageBase64: padded,
            mimeType: 'image/png',
            op: {
              type: 'generative-fill',
              prompt:
                op.prompt ||
                'Extend and continue the scene naturally, matching lighting, colors and perspective.',
            },
            maskBase64: border,
            params: outParams,
          }),
        });
        if (!outRes.ok) {
          const err = (await outRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error || `AI request failed (${outRes.status}).`);
        }
        const outJson = (await outRes.json()) as { imageBase64: string; mimeType?: string };
        return base64ToBlob(outJson.imageBase64, outJson.mimeType || 'image/png');
      }

      const { data, mimeType, width, height } = imageToBase64(image, 1280);
      // SD 3.5 masked ops (#9) carry an ImageData mask — rasterize it to a PNG
      // matched to the (downscaled) image dims, and strip it from the op since
      // ImageData is not JSON-serializable.
      const maskBase64 = 'mask' in op ? maskToBase64(op.mask, width, height) : undefined;
      const wireOp: Record<string, unknown> = { type: op.type };
      if ('prompt' in op && typeof op.prompt === 'string') wireOp.prompt = op.prompt;
      if ('factor' in op && typeof op.factor === 'number') wireOp.factor = op.factor;

      // Forward the "edit strength" slider (0..1) so the backend can scale the edit.
      const params: Record<string, unknown> = {};
      if ('strength' in op && typeof op.strength === 'number') params.strength = op.strength;

      const res = await fetch('/api/ai/edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64: data, mimeType, op: wireOp, maskBase64, params }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `AI request failed (${res.status}).`);
      }
      const { imageBase64, mimeType: outMime } = (await res.json()) as {
        imageBase64: string;
        mimeType?: string;
      };
      return base64ToBlob(imageBase64, outMime || 'image/png');
    },

    // Voice annotation: record → (optional denoise) → transcribe. Both proxy
    // through server routes so the RunPod key stays server-side.
    async transcribeAudio(audioBase64) {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio: audioBase64 }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Transcription failed (${res.status}).`);
      }
      const { transcript } = (await res.json()) as { transcript?: string };
      return (transcript ?? '').trim();
    },

    async denoiseAudio(audioBase64) {
      const res = await fetch('/api/ai/denoise', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio: audioBase64 }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Denoise failed (${res.status}).`);
      }
      const { audio } = (await res.json()) as { audio?: string };
      return audio ?? audioBase64;
    },

    // Camera-tilt estimation is opt-in (needs the RunPod tilt endpoint deployed);
    // gate it so the editor's Auto-straighten button only appears when configured.
    estimateTilt:
      process.env.NEXT_PUBLIC_APG_RUNPOD_TILT === 'true'
        ? async (_item, image) => {
            const { data } = imageToBase64(image, 1024);
            const res = await fetch('/api/ai/tilt', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ image: data }),
            });
            if (!res.ok) {
              const err = (await res.json().catch(() => ({}))) as { error?: string };
              throw new Error(err.error || `Tilt estimate failed (${res.status}).`);
            }
            return (await res.json()) as {
              rollDegrees: number;
              pitchDegrees: number;
              fovDegrees: number;
            };
          }
        : undefined,
  };
}

/** Draw an image to a canvas (downscaled) and return a JPEG Blob. */
function canvasBlob(image: ImageBitmap | HTMLImageElement, maxDim: number): Promise<Blob> {
  const w = (image as HTMLImageElement).naturalWidth || (image as ImageBitmap).width;
  const h = (image as HTMLImageElement).naturalHeight || (image as ImageBitmap).height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas not supported.'));
  ctx.drawImage(image as CanvasImageSource, 0, 0, cw, ch);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
  );
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Pad an image with a neutral border for outpaint and return {paddedImage, mask}
 * as base64 PNG — the border is WHITE in the mask (regenerate), the original
 * image area BLACK (keep). Capped at 1280px on the long side.
 */
function padForOutpaint(
  image: ImageBitmap | HTMLImageElement,
  factor: number,
): { imageBase64: string; maskBase64: string } {
  const w = (image as HTMLImageElement).naturalWidth || (image as ImageBitmap).width;
  const h = (image as HTMLImageElement).naturalHeight || (image as ImageBitmap).height;
  const f = Math.max(1.1, Math.min(2, factor));
  const maxDim = 1280;
  let pw = Math.round(w * f);
  let ph = Math.round(h * f);
  const scale = Math.min(1, maxDim / Math.max(pw, ph));
  pw = Math.max(16, Math.round(pw * scale));
  ph = Math.max(16, Math.round(ph * scale));
  const iw = Math.max(1, Math.round(w * scale));
  const ih = Math.max(1, Math.round(h * scale));
  const ox = Math.floor((pw - iw) / 2);
  const oy = Math.floor((ph - ih) / 2);

  const imgCanvas = document.createElement('canvas');
  imgCanvas.width = pw;
  imgCanvas.height = ph;
  const ictx = imgCanvas.getContext('2d');
  if (!ictx) throw new Error('Canvas not supported.');
  ictx.fillStyle = '#808080';
  ictx.fillRect(0, 0, pw, ph);
  ictx.drawImage(image as CanvasImageSource, ox, oy, iw, ih);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = pw;
  maskCanvas.height = ph;
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) throw new Error('Canvas not supported.');
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(0, 0, pw, ph);
  mctx.fillStyle = '#000000';
  mctx.fillRect(ox, oy, iw, ih);

  return {
    imageBase64: imgCanvas.toDataURL('image/png').split(',')[1] ?? '',
    maskBase64: maskCanvas.toDataURL('image/png').split(',')[1] ?? '',
  };
}
