import type { MediaItem } from '@photo-gallery/sdk';

/**
 * Free, in-browser OCR via tesseract.js (no API key, nothing leaves the browser).
 *
 * tesseract spins up a Web Worker that compiles a WASM core and downloads the
 * English language model. ALL three assets are pinned to `cdn.jsdelivr.net`,
 * which is already allow-listed in the CSP (faceProvider uses it too) — so no
 * fetch silently falls back to tesseract's default `tessdata.projectnaptha.com`
 * (which is NOT allow-listed and would be blocked). The module is dynamically
 * imported on first use so it never bloats the initial bundle.
 *
 * IMPORTANT: tesseract hallucinates low-confidence gibberish for photos that
 * contain no text. We therefore keep only high-confidence, word-shaped tokens
 * and require several of them — otherwise a landscape photo would wrongly count
 * as a "document". See `meaningfulText`.
 */

// Must equal the EXACT tesseract.js version in apps/web/package.json (pinned, no
// caret) so the worker CDN URL can never drift from the installed main-thread code.
const VERSION = '5.1.1';
const WORKER_PATH = `https://cdn.jsdelivr.net/npm/tesseract.js@${VERSION}/dist/worker.min.js`;
const CORE_PATH = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5';
// jsDelivr's GitHub mirror of naptha/tessdata (same files as projectnaptha.com).
const LANG_PATH = 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0';

/** A word per tesseract's output hierarchy. */
interface OcrWord {
  text?: string;
  confidence?: number;
}
interface OcrData {
  text?: string;
  confidence?: number;
  words?: OcrWord[];
  blocks?: Array<{
    paragraphs?: Array<{ lines?: Array<{ words?: OcrWord[] }> }>;
  }> | null;
}

type Worker = import('tesseract.js').Worker;

let workerPromise: Promise<Worker | null> | null = null;

/** Create + initialize the tesseract worker exactly once; null if it fails. */
function ensureWorker(): Promise<Worker | null> {
  workerPromise ??= (async () => {
    try {
      const { createWorker } = await import('tesseract.js');
      // v5: createWorker(langs, oem, options) already loads + initializes the
      // language internally — do NOT call the removed v4 worker.load().
      return await createWorker('eng', 1, {
        workerPath: WORKER_PATH,
        corePath: CORE_PATH,
        langPath: LANG_PATH,
      });
    } catch (err) {
      console.warn('[ocrProvider] worker init failed; OCR disabled.', err);
      return null;
    }
  })();
  return workerPromise;
}

const WORD_CONFIDENCE = 70; // a word tesseract is actually sure about
const MIN_WORDS = 4; // need several confident words to call it a document
const MIN_CHARS = 10;

/** Flatten tesseract's word list from whichever shape this version returns. */
function collectWords(data: OcrData): OcrWord[] {
  if (Array.isArray(data.words) && data.words.length) return data.words;
  const out: OcrWord[] = [];
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs ?? [])
      for (const l of p.lines ?? [])
        for (const w of l.words ?? []) out.push(w);
  return out;
}

/**
 * Return real text or '' (not a document). Prefers per-word confidence; falls
 * back to the overall mean confidence + a word-shape heuristic if the build
 * doesn't expose words.
 */
function meaningfulText(data: OcrData): string {
  const words = collectWords(data);
  if (words.length > 0) {
    const good = words.filter(
      (w) => (w.confidence ?? 0) >= WORD_CONFIDENCE && /[A-Za-z0-9]{2,}/.test(w.text ?? ''),
    );
    const text = good
      .map((w) => (w.text ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    return good.length >= MIN_WORDS && text.length >= MIN_CHARS ? text : '';
  }
  // Fallback: overall confidence + count of word-shaped tokens.
  const raw = (data.text ?? '').trim();
  const conf = typeof data.confidence === 'number' ? data.confidence : 0;
  const realWords = raw.match(/[A-Za-z]{3,}/g) ?? [];
  return conf >= 72 && realWords.length >= 6 ? raw : '';
}

export function createOCRProvider() {
  return {
    async ocr(_item: MediaItem, image: ImageBitmap | HTMLImageElement): Promise<string> {
      const worker = await ensureWorker();
      if (!worker) return '';
      try {
        // Request the block hierarchy so per-word confidence is available.
        const { data } = (await worker.recognize(image as unknown as HTMLImageElement, {}, {
          text: true,
          blocks: true,
        })) as { data: OcrData };
        return meaningfulText(data);
      } catch {
        return '';
      }
    },
  };
}
