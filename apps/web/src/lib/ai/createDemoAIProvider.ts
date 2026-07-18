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
