import type { MediaItem } from '@photo-gallery/sdk';

/**
 * Free, in-browser semantic search via CLIP (transformers.js / ONNX-WASM).
 *
 * CLIP maps images and text into the SAME 512-D space, so "show me beach photos"
 * ranks visually-matching images even when they have no tags or filename hints.
 * The model is downloaded once from the Hugging Face CDN (allow-listed in the CSP)
 * and cached by the browser; the module is dynamically imported on first use so it
 * never bloats the initial bundle. Nothing leaves the browser.
 */

const MODEL_ID = 'Xenova/clip-vit-base-patch16';

type TF = typeof import('@huggingface/transformers');

let tfMod: TF | null = null;
let visionPromise: Promise<{ processor: any; model: any } | null> | null = null;
let textPromise: Promise<{ tokenizer: any; model: any } | null> | null = null;

async function loadTf(): Promise<TF> {
  if (!tfMod) {
    tfMod = await import('@huggingface/transformers');
    // Remote-only (models from HF CDN); rely on browser cache between sessions.
    tfMod.env.allowLocalModels = false;
  }
  return tfMod;
}

function ensureVision() {
  visionPromise ??= (async () => {
    try {
      const tf = await loadTf();
      const [processor, model] = await Promise.all([
        tf.AutoProcessor.from_pretrained(MODEL_ID),
        tf.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID),
      ]);
      return { processor, model };
    } catch (err) {
      console.warn('[clipProvider] vision model load failed; semantic search disabled.', err);
      return null;
    }
  })();
  return visionPromise;
}

function ensureText() {
  textPromise ??= (async () => {
    try {
      const tf = await loadTf();
      const [tokenizer, model] = await Promise.all([
        tf.AutoTokenizer.from_pretrained(MODEL_ID),
        tf.CLIPTextModelWithProjection.from_pretrained(MODEL_ID),
      ]);
      return { tokenizer, model };
    } catch (err) {
      console.warn('[clipProvider] text model load failed; semantic search disabled.', err);
      return null;
    }
  })();
  return textPromise;
}

/** Draw an image onto a canvas (downscaled) for the CLIP image processor. */
function toCanvas(image: ImageBitmap | HTMLImageElement, maxDim = 384): HTMLCanvasElement {
  const w = (image as HTMLImageElement).naturalWidth || (image as ImageBitmap).width;
  const h = (image as HTMLImageElement).naturalHeight || (image as ImageBitmap).height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function tensorToArray(t: any): number[] {
  const data: Float32Array = t?.data ?? t;
  return Array.from(data as ArrayLike<number>);
}

export function createClipProvider() {
  return {
    async embedImage(_item: MediaItem, image: ImageBitmap | HTMLImageElement): Promise<number[]> {
      const v = await ensureVision();
      if (!v) return [];
      try {
        const tf = await loadTf();
        const canvas = toCanvas(image);
        const imageData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        const raw = new tf.RawImage(imageData.data, canvas.width, canvas.height, 4).rgb();
        const inputs = await v.processor(raw);
        const out = await v.model(inputs);
        return tensorToArray(out.image_embeds);
      } catch (err) {
        console.warn('[clipProvider] embedImage failed.', err);
        return [];
      }
    },

    async embedText(query: string): Promise<number[]> {
      const t = await ensureText();
      if (!t) return [];
      try {
        const inputs = t.tokenizer([query], { padding: true, truncation: true });
        const out = await t.model(inputs);
        return tensorToArray(out.text_embeds);
      } catch (err) {
        console.warn('[clipProvider] embedText failed.', err);
        return [];
      }
    },
  };
}
