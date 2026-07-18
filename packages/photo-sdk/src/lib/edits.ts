import { FILTER_PRESETS, ZERO_ADJUSTMENTS } from '../constants';
import type { EditAdjustments, EditState } from '../types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function resolveAdjustments(edits: EditState): EditAdjustments {
  const preset = edits.filter ? FILTER_PRESETS[edits.filter]?.adjustments ?? {} : {};
  return { ...ZERO_ADJUSTMENTS, ...preset, ...edits.adjustments };
}

/** Build a CSS `filter` string approximating the adjustment stack. */
export function editFilterCss(edits?: EditState): string | undefined {
  if (!edits) return undefined;
  const a = resolveAdjustments(edits);

  const brightness = clamp(
    1 + a.exposure * 0.4 + a.brightness * 0.4 + a.shadows * 0.12 - a.highlights * 0.06,
    0.2,
    2.2,
  );
  const contrast = clamp(
    1 + a.contrast * 0.5 + a.definition * 0.2 + a.sharpness * 0.15 + a.blackPoint * 0.25,
    0.2,
    2.6,
  );
  const saturate = clamp(1 + a.saturation * 0.85 + a.vibrance * 0.35, 0, 3);
  const sepia = clamp(Math.max(0, a.warmth) * 0.5, 0, 1);
  const hue = (a.warmth < 0 ? a.warmth * 14 : 0) + a.tint * 14;

  const parts = [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
  ];
  // Heavily desaturated presets read as true monochrome.
  if (saturate <= 0.2) parts.push('grayscale(1)');
  else parts.push(`saturate(${saturate.toFixed(3)})`);
  if (sepia > 0.01) parts.push(`sepia(${sepia.toFixed(3)})`);
  if (Math.abs(hue) > 0.5) parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);

  return parts.join(' ');
}

/** Build a CSS `transform` for rotation + straighten + flips. */
export function editTransformCss(edits?: EditState): string | undefined {
  if (!edits) return undefined;
  const straighten = edits.straighten ?? 0;
  const rot = (edits.rotation ?? 0) + straighten;
  // Scale up slightly when straightening so the rotated image still covers the frame.
  const cover = straighten ? 1 + Math.min(0.5, Math.abs(straighten) / 90) : 1;
  const sx = (edits.flipH ? -1 : 1) * cover;
  const sy = (edits.flipV ? -1 : 1) * cover;
  if (!rot && sx === 1 && sy === 1) return undefined;
  return `rotate(${rot}deg) scale(${sx}, ${sy})`;
}

export { ZERO_ADJUSTMENTS };
