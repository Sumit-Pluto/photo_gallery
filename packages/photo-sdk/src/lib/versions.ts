import type { EditState } from '../types';

/**
 * Human-readable audit log of what an edit changed — shown per version in the
 * photo/video details and the Versions browser.
 */
export function summarizeEdits(edits?: EditState): string[] {
  if (!edits) return ['Edited'];
  const c: string[] = [];
  if (edits.crop) c.push('Cropped');
  if (edits.rotation) c.push(`Rotated ${edits.rotation}°`);
  if (typeof edits.straighten === 'number' && Math.round(edits.straighten) !== 0)
    c.push(`Straightened ${Math.round(edits.straighten)}°`);
  if (edits.flipH) c.push('Flipped horizontally');
  if (edits.flipV) c.push('Flipped vertically');
  if (edits.filter) c.push(`Filter: ${edits.filter}`);
  const adj = Object.entries(edits.adjustments ?? {}).filter(([, v]) => v).map(([k]) => k);
  if (adj.length) c.push(`Adjusted ${adj.slice(0, 3).join(', ')}${adj.length > 3 ? '…' : ''}`);
  const n = edits.annotations?.length ?? 0;
  if (n) c.push(`${n} annotation${n === 1 ? '' : 's'}`);
  // ---- video ----
  const segCount = edits.segments?.length ?? 0;
  if (segCount > 1) c.push(`Split into ${segCount} segments`);
  else if (edits.trim || segCount === 1) c.push('Trimmed');
  if (edits.segments?.some((s) => (s.speed ?? 1) !== 1)) c.push('Speed change');
  const ovCount = (edits.overlays?.length ?? 0) + (edits.overlay ? 1 : 0);
  if (ovCount) {
    c.push(`${ovCount} overlay${ovCount === 1 ? '' : 's'}`);
    if (edits.overlays?.some((o) => o.keyframes && o.keyframes.length > 1)) c.push('Keyframe animation');
    if (edits.overlays?.some((o) => o.watermark)) c.push('Watermark');
    if (edits.overlays?.some((o) => o.kind === 'text')) c.push('Text');
  }
  if (edits.audio?.muted) c.push('Muted original audio');
  if (edits.audio?.denoisedSrc) c.push('Reduced audio noise (AI)');
  if (edits.audio?.musicSrc) c.push('Added music');
  if (edits.audio?.fadeIn || edits.audio?.fadeOut) c.push('Audio fade');
  return c.length ? c : ['Edited'];
}
