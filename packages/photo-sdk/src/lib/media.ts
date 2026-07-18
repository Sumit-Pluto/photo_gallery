import { nanoid } from 'nanoid';

import type { MediaItem, MediaKind } from '../types';
import { classifyMediaSource } from './classify';

export type MediaInput = Partial<MediaItem> & { src: string };

/** Normalize loose input into a fully-formed MediaItem with sensible defaults. */
export function createMediaItem(input: MediaInput): MediaItem {
  const now = Date.now();
  const kind: MediaKind = input.kind ?? (input.mime?.startsWith('video/') ? 'video' : 'image');
  const name = input.name ?? 'Untitled';
  const width = input.width ?? 1600;
  const height = input.height ?? 1067;
  const mime = input.mime ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg');

  const source =
    input.source ??
    classifyMediaSource({
      name,
      width,
      height,
      mime,
      hasCameraExif: Boolean(input.exif && Object.keys(input.exif).length > 0),
    });

  return {
    id: input.id ?? nanoid(10),
    kind,
    src: input.src,
    thumbnail: input.thumbnail,
    poster: input.poster,
    name,
    width,
    height,
    mime,
    bytes: input.bytes,
    takenAt: input.takenAt ?? now,
    importedAt: input.importedAt ?? now,
    editedAt: input.editedAt,
    deletedAt: input.deletedAt,
    duration: input.duration,
    favorite: input.favorite ?? false,
    hidden: input.hidden ?? false,
    source,
    albumIds: input.albumIds ?? [],
    tags: input.tags ?? [],
    objectLabels: input.objectLabels ?? [],
    personIds: input.personIds ?? [],
    location: input.location,
    exif: input.exif,
    caption: input.caption,
    objects: input.objects,
    faces: input.faces,
    // Preserve OCR text through the normalization path — without this it's dropped
    // on every reload, so the analyzer re-runs OCR on the whole library each time.
    ocrText: input.ocrText,
    analyzedAt: input.analyzedAt,
    colorPalette: input.colorPalette,
    blurScore: input.blurScore,
    qualityScore: input.qualityScore,
    embedding: input.embedding,
    isLivePhoto: input.isLivePhoto,
    isRaw: input.isRaw,
    isPanorama: input.isPanorama,
    edits: input.edits,
    // Preserve edit history + comments through the single normalization path so
    // versions/comments survive a reload (localStorage adapter re-normalizes on load).
    versions: input.versions,
    comments: input.comments,
  };
}

/**
 * Validate a media URL. Allows http(s), data:image/video, blob, and same-origin
 * relative paths; rejects dangerous schemes (javascript:, vbscript:, file:, …).
 * Security: untrusted `src`/`thumbnail`/`poster` must never carry an active scheme.
 */
export function safeMediaUrl(value: unknown): string | undefined {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return undefined;
  if (/^(https?:|blob:)/i.test(s)) return s;
  if (/^data:(image|video)\//i.test(s)) return s;
  // No scheme at all → treat as a relative same-origin path.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return undefined; // unknown / disallowed scheme
}

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const asFiniteNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * Coerce an untrusted object (from props or persisted storage) into a safe
 * MediaItem. Returns null if it has no usable source. This is the single
 * normalization path so persisted and prop-supplied data are validated alike.
 */
export function normalizeMediaItem(raw: unknown): MediaItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const src = safeMediaUrl(r.src);
  if (!src) return null;

  let location: MediaItem['location'];
  if (r.location && typeof r.location === 'object') {
    const loc = r.location as Record<string, unknown>;
    const lat = asFiniteNumber(loc.lat);
    const lng = asFiniteNumber(loc.lng);
    if (lat !== undefined && lng !== undefined) {
      location = { lat, lng, place: asString(loc.place), city: asString(loc.city), country: asString(loc.country) };
    }
  }

  return createMediaItem({
    ...(r as MediaInput),
    src,
    thumbnail: safeMediaUrl(r.thumbnail),
    poster: safeMediaUrl(r.poster),
    name: asString(r.name),
    caption: asString(r.caption),
    tags: asStringArray(r.tags),
    objectLabels: asStringArray(r.objectLabels),
    albumIds: asStringArray(r.albumIds),
    personIds: asStringArray(r.personIds),
    location,
  });
}

/** Accepted upload types — guards against importing arbitrary/executable files. */
const ACCEPTED = /^(image\/(jpeg|png|gif|webp|heic|heif|avif|bmp|tiff)|video\/(mp4|quicktime|webm|x-matroska|3gpp))$/;

export function isAcceptedMediaFile(file: File): boolean {
  return ACCEPTED.test(file.type) || /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?|mp4|mov|webm|mkv|3gp)$/i.test(file.name);
}

/** Read a Blob/File into a base64 data: URL. Durable across reloads (unlike blob: URLs). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Build a MediaItem from a browser File (reads real dimensions / duration). */
export async function mediaFromFile(file: File): Promise<MediaItem | null> {
  if (!isAcceptedMediaFile(file)) return null;
  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|3gp)$/i.test(file.name);
  const url = URL.createObjectURL(file);

  try {
    if (isVideo) {
      const meta = await readVideoMeta(url);
      return createMediaItem({
        src: url,
        name: file.name,
        mime: file.type || 'video/mp4',
        bytes: file.size,
        kind: 'video',
        takenAt: file.lastModified || Date.now(),
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
      });
    }
    const dims = await readImageMeta(url);
    const meta = await readExif(file);
    return createMediaItem({
      src: url,
      name: file.name,
      mime: file.type || 'image/jpeg',
      bytes: file.size,
      kind: 'image',
      takenAt: meta.takenAt ?? file.lastModified ?? Date.now(),
      width: dims.width,
      height: dims.height,
      isPanorama: dims.width / Math.max(1, dims.height) > 2.2,
      location: meta.location,
      exif: meta.exif,
      tags: meta.tags,
    });
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

interface ExifMeta {
  takenAt?: number;
  location?: MediaItem['location'];
  exif?: Record<string, string | number>;
  /** Existing keywords/tags from IPTC/XMP. */
  tags?: string[];
}

/** Parse EXIF + IPTC/XMP (date, GPS, camera, keywords) from an image File. Lazy-loads `exifr`. */
async function readExif(file: File): Promise<ExifMeta> {
  try {
    const exifr = (await import('exifr')).default;
    // Parse GPS + IPTC + XMP so existing keywords/tags and location are imported.
    const data = await exifr.parse(file, { gps: true, iptc: true, xmp: true });
    if (!data) return {};
    const out: ExifMeta = {};
    const dt = data.DateTimeOriginal ?? data.CreateDate;
    if (dt) {
      const t = new Date(dt).getTime();
      if (Number.isFinite(t)) out.takenAt = t;
    }
    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      out.location = { lat: data.latitude, lng: data.longitude };
    }
    const exif: Record<string, string | number> = {};
    for (const k of [
      'Make',
      'Model',
      'LensModel',
      'ISO',
      'FNumber',
      'FocalLength',
      'Orientation',
    ] as const) {
      const v = data[k];
      if (typeof v === 'string' || typeof v === 'number') exif[k] = v;
    }
    if (Object.keys(exif).length) out.exif = exif;

    // Import existing keywords/tags from IPTC (Keywords) and XMP (dc:subject).
    const raw: unknown[] = [];
    const push = (v: unknown) => {
      if (Array.isArray(v)) raw.push(...v);
      else if (typeof v === 'string') raw.push(...v.split(/[;,]/));
    };
    push(data.Keywords);
    push(data.subject);
    const tags = [...new Set(raw.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
    if (tags.length) out.tags = tags;
    return out;
  } catch {
    return {};
  }
}

function readImageMeta(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

function readVideoMeta(url: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () =>
      resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    v.onerror = reject;
    v.src = url;
  });
}
