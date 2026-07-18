/**
 * Shared client-side image encoding helpers for the AI providers. Downscale an
 * image to a JPEG base64 (keeping the exact output dims), and rasterize a mask
 * to a PNG base64 matched to those same dims — SD 3.5 (#9) requires the image
 * and mask to be identical pixel sizes.
 */

export interface EncodedImage {
  /** base64 JPEG (no data: prefix). */
  data: string;
  mimeType: string;
  /** Actual pixel dims of the encoded image (after downscale). */
  width: number;
  height: number;
}

/** Draw an image to a downscaled canvas and return base64 JPEG + its dims. */
export function imageToBase64(image: ImageBitmap | HTMLImageElement, maxDim: number): EncodedImage {
  const w = (image as HTMLImageElement).naturalWidth || (image as ImageBitmap).width;
  const h = (image as HTMLImageElement).naturalHeight || (image as ImageBitmap).height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported.');
  ctx.drawImage(image as CanvasImageSource, 0, 0, cw, ch);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return { data: dataUrl.split(',')[1] ?? '', mimeType: 'image/jpeg', width: cw, height: ch };
}

/**
 * Rasterize a mask (ImageData, white = region to regenerate) to a PNG base64
 * scaled to targetW×targetH so it matches the encoded image exactly.
 */
export function maskToBase64(mask: ImageData, targetW: number, targetH: number): string {
  const tmp = document.createElement('canvas');
  tmp.width = mask.width;
  tmp.height = mask.height;
  const tctx = tmp.getContext('2d');
  if (!tctx) throw new Error('Canvas not supported.');
  tctx.putImageData(mask, 0, 0);

  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas not supported.');
  // Nearest-neighbour, not bilinear — keep the mask strictly binary so SD 3.5 gets
  // crisp white(regenerate)/black(keep) edges instead of an anti-aliased grey halo.
  octx.imageSmoothingEnabled = false;
  octx.drawImage(tmp, 0, 0, targetW, targetH);
  return out.toDataURL('image/png').split(',')[1] ?? '';
}
