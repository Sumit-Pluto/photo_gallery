import type { EditState, VideoOverlay, VideoSegment } from '../types';

/**
 * Pure helpers shared by the video bake engine (lib/videoBake.ts) and the editor's
 * live preview (VideoEditor.tsx), so the on-screen preview matches the export exactly.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Resolve the ordered keep-segments (falls back to legacy trim, then the whole clip). */
export function normalizeSegments(edits: EditState, totalDur: number): VideoSegment[] {
  const raw: VideoSegment[] =
    edits.segments && edits.segments.length
      ? edits.segments
      : edits.trim
        ? [{ id: 'legacy', start: edits.trim.start, end: edits.trim.end }]
        : [{ id: 'full', start: 0, end: totalDur }];
  const out = raw
    .map((s) => ({
      ...s,
      start: clamp(s.start, 0, totalDur),
      end: clamp(s.end, 0, totalDur),
      speed: s.speed && s.speed > 0 ? s.speed : 1,
    }))
    .filter((s) => s.end - s.start > 0.05);
  return out.length ? out : [{ id: 'full', start: 0, end: totalDur, speed: 1 }];
}

/** Total duration of the exported clip (sum of segment durations ÷ their speed). */
export function outputDuration(segs: VideoSegment[]): number {
  return segs.reduce((n, s) => n + (s.end - s.start) / (s.speed || 1), 0);
}

/** Map a SOURCE time to the OUTPUT-timeline time (for previewing keyframed overlays). */
export function sourceToOutputTime(segs: VideoSegment[], srcT: number): number {
  let acc = 0;
  for (const s of segs) {
    const dur = (s.end - s.start) / (s.speed || 1);
    if (srcT >= s.start && srcT <= s.end) return acc + (srcT - s.start) / (s.speed || 1);
    if (srcT < s.start) return acc; // in a gap before this segment
    acc += dur;
  }
  return acc;
}

export interface VideoOutputSize {
  W: number;
  H: number;
  /** Content dims BEFORE the 90°/270° swap (how the frame is drawn pre-rotation). */
  contentW: number;
  contentH: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  rot: number;
}

/** Compute the exported frame size from crop + 90° rotation, capped to `maxDim`. */
export function videoOutputSize(
  srcW: number,
  srcH: number,
  edits: EditState,
  maxDim: number,
): VideoOutputSize {
  const crop = edits.crop;
  const cropW = crop ? Math.max(1, Math.round(crop.width * srcW)) : srcW;
  const cropH = crop ? Math.max(1, Math.round(crop.height * srcH)) : srcH;
  const rot = ((((edits.rotation ?? 0) % 360) + 360) % 360);
  const swap = rot === 90 || rot === 270;
  const scale = Math.min(1, maxDim / Math.max(cropW, cropH));
  const contentW = Math.max(2, Math.round(cropW * scale));
  const contentH = Math.max(2, Math.round(cropH * scale));
  return {
    W: swap ? contentH : contentW,
    H: swap ? contentW : contentH,
    contentW,
    contentH,
    cropX: crop ? crop.x * srcW : 0,
    cropY: crop ? crop.y * srcH : 0,
    cropW,
    cropH,
    rot,
  };
}

/** Merge the overlays list with any legacy single `overlay` (as a watermark). */
export function resolveOverlays(edits: EditState): VideoOverlay[] {
  const list = [...(edits.overlays ?? [])];
  if (edits.overlay?.src && !list.some((o) => o.src === edits.overlay!.src)) {
    list.push({
      id: 'legacy-overlay',
      kind: 'image',
      src: edits.overlay.src,
      x: edits.overlay.x,
      y: edits.overlay.y,
      scale: edits.overlay.scale,
      opacity: 1,
      watermark: true,
    });
  }
  return list;
}

export interface SampledOverlay {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

/** Resolve an overlay's transform at output-time `t` by interpolating its keyframes. */
export function sampleOverlay(o: VideoOverlay, t: number): SampledOverlay {
  const base = {
    x: o.x,
    y: o.y,
    scale: o.scale,
    rotation: o.rotation ?? 0,
    opacity: o.opacity ?? 1,
  };
  const inT = o.in ?? -Infinity;
  const outT = o.out ?? Infinity;
  const visible = t >= inT && t <= outT;
  const kfs = o.keyframes;
  if (!kfs || kfs.length === 0) return { ...base, visible };

  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  let prev: (typeof sorted)[number] | null = null;
  let next: (typeof sorted)[number] | null = null;
  for (const k of sorted) {
    if (k.t <= t) prev = k;
    if (k.t >= t && !next) next = k;
  }
  const pick = (k: (typeof sorted)[number], key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity') =>
    k[key] ?? base[key];

  if (prev && next && prev !== next) {
    const span = next.t - prev.t || 1;
    const f = (t - prev.t) / span;
    const lerp = (key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity') => {
      const a = pick(prev!, key);
      const b = pick(next!, key);
      return a + (b - a) * f;
    };
    return {
      x: lerp('x'),
      y: lerp('y'),
      scale: lerp('scale'),
      rotation: lerp('rotation'),
      opacity: lerp('opacity'),
      visible,
    };
  }
  const k = prev ?? next!;
  return {
    x: pick(k, 'x'),
    y: pick(k, 'y'),
    scale: pick(k, 'scale'),
    rotation: pick(k, 'rotation'),
    opacity: pick(k, 'opacity'),
    visible,
  };
}
