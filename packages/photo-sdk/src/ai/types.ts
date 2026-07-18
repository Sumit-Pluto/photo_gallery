import type { DetectedFace, DetectedObject, MediaItem } from '../types';

/**
 * Pluggable AI provider. The UI never calls a model directly — it calls this
 * interface, so any backend (free in-browser TensorFlow.js / transformers.js,
 * a self-hosted model, or a cloud API like Gemini) can be swapped in.
 *
 * Every method is optional; features degrade gracefully when a capability is
 * absent. Implementations should be lazy (load models on first use).
 */
export interface AIProvider {
  readonly name: string;

  /** Detect objects (table, chair, laptop, dog, ...). Enables click-to-find. */
  detectObjects?(item: MediaItem, image: ImageBitmap | HTMLImageElement): Promise<DetectedObject[]>;

  /** Detect (and optionally embed) faces for clustering into People. */
  detectFaces?(item: MediaItem, image: ImageBitmap | HTMLImageElement): Promise<DetectedFace[]>;

  /** Generate a one-line natural-language caption / description. */
  caption?(item: MediaItem, image: ImageBitmap | HTMLImageElement): Promise<string>;

  /** Extract printed/handwritten text (OCR) for document search. */
  ocr?(item: MediaItem, image: ImageBitmap | HTMLImageElement): Promise<string>;

  /** Produce an embedding vector for semantic similarity & NL search. */
  embedImage?(item: MediaItem, image: ImageBitmap | HTMLImageElement): Promise<number[]>;
  embedText?(query: string): Promise<number[]>;

  /** Generative edits (sky replace, magic eraser, generative fill, restore). */
  generativeEdit?(
    item: MediaItem,
    image: ImageBitmap | HTMLImageElement,
    op: GenerativeEditOp,
  ): Promise<Blob>;

  /**
   * Transcribe recorded speech (base64 WAV, 16 kHz mono PCM16) to text.
   * Powers voice input for photo annotations / comments.
   */
  transcribeAudio?(audioBase64: string): Promise<string>;

  /**
   * Denoise recorded audio (base64 WAV) → cleaned base64 WAV. Useful before
   * transcription when the recording was made on a noisy site.
   */
  denoiseAudio?(audioBase64: string): Promise<string>;

  /** Estimate camera tilt (roll/pitch/fov, degrees) for auto-straightening. */
  estimateTilt?(item: MediaItem, image: ImageBitmap | HTMLImageElement): Promise<TiltEstimate>;
}

/** Camera-tilt estimate (degrees). `rollDegrees` = in-plane rotation to correct. */
export interface TiltEstimate {
  rollDegrees: number;
  pitchDegrees: number;
  fovDegrees: number;
}

export type GenerativeEditOp =
  | { type: 'remove-background' }
  | { type: 'replace-sky'; prompt?: string; strength?: number }
  | { type: 'magic-eraser'; mask: ImageData; strength?: number }
  | { type: 'generative-fill'; prompt: string; mask: ImageData; strength?: number }
  | { type: 'restore' }
  | { type: 'upscale'; factor: 2 | 4 }
  | { type: 'colorize' }
  /** Outpaint / expand-canvas: pad the image and generatively fill the new border. */
  | { type: 'outpaint'; prompt?: string; factor?: number; strength?: number }
  /**
   * Free-form natural-language edit instruction. `strength` (0..1) controls how
   * strongly the edit is applied (subtle → strong); the backend maps it to the
   * appropriate model knob.
   */
  | { type: 'prompt'; prompt: string; strength?: number };

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
