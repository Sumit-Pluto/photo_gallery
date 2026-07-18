/** Hard cap on stored OCR text — prevents a pathological image from bloating
 * the store / backend row (DoS) and keeps search tokenization cheap. */
export const OCR_TEXT_MAX_CHARS = 10_000;

// C0 control characters + DEL. Built from a string of \u escapes so the source
// stays pure ASCII. Replaced with spaces (then collapsed) so a newline between
// two words doesn't fuse them into a single search token.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

/**
 * Clean OCR output before it is stored or searched.
 *
 * OCR text is attacker-influencable (it comes from pixels inside an imported
 * image), so we treat it as untrusted input at the write boundary: strip
 * control characters, collapse whitespace into single spaces, and length-cap.
 * No HTML stripping is required because the value is only ever rendered through
 * React/textContent (never innerHTML) — but if a future search-highlight feature
 * is added it MUST build nodes with createElement + textContent, never innerHTML.
 */
export function sanitizeOcrText(input: string): string {
  const cleaned = input.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= OCR_TEXT_MAX_CHARS) return cleaned;
  // Truncate on a word boundary so a word straddling the cap isn't split into an
  // unsearchable fragment (search does substring matching on whole tokens).
  const cut = cleaned.slice(0, OCR_TEXT_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}
