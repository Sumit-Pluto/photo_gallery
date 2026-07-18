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
}

export type GenerativeEditOp =
  | { type: 'remove-background' }
  | { type: 'replace-sky'; prompt?: string }
  | { type: 'magic-eraser'; mask: ImageData }
  | { type: 'generative-fill'; prompt: string; mask: ImageData }
  | { type: 'restore' }
  | { type: 'upscale'; factor: 2 | 4 }
  | { type: 'colorize' }
  /** Free-form natural-language edit instruction. */
  | { type: 'prompt'; prompt: string };

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
