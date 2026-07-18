/**
 * base64 / data-URI helpers shared by the RunPod endpoint wrappers.
 * Different endpoints name their image field differently and some prefix a
 * `data:` URI — these helpers normalize both.
 */

/** "data:image/png;base64,XXXX" -> "XXXX" (leaves a bare base64 string untouched). */
export function stripDataUri(s: string): string {
  if (!s.startsWith('data:')) return s;
  const i = s.indexOf(',');
  return i === -1 ? s : s.slice(i + 1);
}

/** Wrap a bare base64 string in a data: URI. */
export function toDataUri(b64: string, mime: string): string {
  return `data:${mime};base64,${stripDataUri(b64)}`;
}

/**
 * Pull the first image-like base64 string out of a RunPod endpoint's `output`,
 * regardless of which field name it used. Handles the common shapes:
 *   "iVBOR..."                       (raw string)
 *   { image: "..." } / { image_png } / { image_base64 }
 *   { images: ["..."] }              (array)
 *   { output: { image: "..." } }     (nested)
 * Mirrors the A1111 normalization already used for the local SD backend.
 */
export function pickOutputImage(output: unknown): string {
  const s = findImageString(output, false);
  if (!s) throw new Error('RunPod output did not contain an image.');
  return stripDataUri(s);
}

/** Keys whose name implies the value IS the image — any non-empty string is accepted. */
const IMAGE_KEYS = ['image_png', 'image', 'image_base64', 'images'] as const;
/** Generic wrapper keys — a string here must actually look like image data. */
const CONTAINER_KEYS = ['output', 'result', 'data'] as const;

/** A base64 image payload is long; a status/id string ("success", "job-abc") is short. */
function looksLikeImageData(s: string): boolean {
  if (s.startsWith('data:image/')) return true;
  return s.length >= 256 && /^[A-Za-z0-9+/=\s]+$/.test(s.slice(0, 256));
}

/**
 * `strict` is true when we descended through a generic wrapper key (output/result/
 * data), where a bare string could be a status/id rather than an image — so it must
 * pass `looksLikeImageData`. Under an explicit image key (or at top level) any
 * non-empty string is taken as the image.
 */
function findImageString(value: unknown, strict: boolean, depth = 0): string | undefined {
  if (depth > 5) return undefined;
  if (typeof value === 'string') {
    if (!value) return undefined;
    return !strict || looksLikeImageData(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    for (const el of value) {
      const s = findImageString(el, strict, depth + 1);
      if (s) return s;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const key of IMAGE_KEYS) {
      if (key in o) {
        const s = findImageString(o[key], false, depth + 1);
        if (s) return s;
      }
    }
    for (const key of CONTAINER_KEYS) {
      if (key in o) {
        const s = findImageString(o[key], true, depth + 1);
        if (s) return s;
      }
    }
  }
  return undefined;
}
