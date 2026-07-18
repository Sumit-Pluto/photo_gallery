import type { Annotation, EditState } from '../types';
import { editFilterCss } from './edits';

export interface BakeResult {
  blob: Blob;
  width: number;
  height: number;
  annotations: Annotation[];
}

/** True if the edit stack contains geometry that must be flattened into pixels. */
export function hasGeometry(edits?: EditState): boolean {
  if (!edits) return false;
  const c = edits.crop;
  const cropped = !!c && (c.x > 0.001 || c.y > 0.001 || c.width < 0.999 || c.height < 0.999);
  return cropped || !!edits.rotation || !!edits.straighten || !!edits.flipH || !!edits.flipV;
}

/**
 * Flatten the visual edit stack (crop → flips → filter → rotation/straighten) of
 * a (CORS-clean) image into a new JPEG Blob. Annotations are re-mapped into the
 * cropped space (when un-rotated) so they stay aligned.
 */
export async function bakeEdits(
  img: HTMLImageElement,
  edits: EditState,
): Promise<BakeResult> {
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  const c = edits.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const sx = Math.round(c.x * natW);
  const sy = Math.round(c.y * natH);
  const sw = Math.max(1, Math.round(c.width * natW));
  const sh = Math.max(1, Math.round(c.height * natH));

  // Canvas A: cropped region with flips + colour filter baked in.
  const a = document.createElement('canvas');
  a.width = sw;
  a.height = sh;
  const actx = a.getContext('2d');
  if (!actx) throw new Error('Canvas unavailable');
  const filter = editFilterCss(edits);
  if (filter) actx.filter = filter;
  const fH = edits.flipH ? -1 : 1;
  const fV = edits.flipV ? -1 : 1;
  actx.save();
  actx.translate(fH < 0 ? sw : 0, fV < 0 ? sh : 0);
  actx.scale(fH, fV);
  actx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  actx.restore();

  // Optional vignette.
  const vig = edits.adjustments?.vignette ?? 0;
  if (vig > 0) {
    actx.filter = 'none';
    const g = actx.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.35, sw / 2, sh / 2, Math.max(sw, sh) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, vig * 0.85).toFixed(2)})`);
    actx.fillStyle = g;
    actx.fillRect(0, 0, sw, sh);
  }

  // Rotation (90/180/270 + fine straighten).
  const deg = ((edits.rotation ?? 0) + (edits.straighten ?? 0)) % 360;
  let out = a;
  if (deg !== 0) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const ow = Math.round(sw * cos + sh * sin);
    const oh = Math.round(sw * sin + sh * cos);
    const o = document.createElement('canvas');
    o.width = ow;
    o.height = oh;
    const octx = o.getContext('2d');
    if (!octx) throw new Error('Canvas unavailable');
    octx.translate(ow / 2, oh / 2);
    octx.rotate(rad);
    octx.drawImage(a, -sw / 2, -sh / 2);
    out = o;
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
  );

  // Re-map annotations into the cropped coordinate space (skip when rotated).
  let annotations: Annotation[] = [];
  if (edits.annotations?.length && deg === 0) {
    const remap = (x: number, y: number) => ({
      x: (x - c.x) / c.width,
      y: (y - c.y) / c.height,
    });
    annotations = edits.annotations.map((an) => {
      const p1 = remap(an.x1, an.y1);
      const p2 = remap(an.x2, an.y2);
      return {
        ...an,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        points: an.points?.map((pt) => remap(pt.x, pt.y)),
      };
    });
  }

  return { blob, width: out.width, height: out.height, annotations };
}
