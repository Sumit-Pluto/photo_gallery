/**
 * Core domain types for the Photo Gallery SDK.
 *
 * These are intentionally framework-agnostic so the same model can be reused by
 * a Node backend, a React UI, or a CLI importer.
 */

export type MediaId = string;
export type AlbumId = string;
export type PersonId = string;

/** How a media item most likely entered the library. Auto-detected on import. */
export type MediaSource =
  | 'camera' // shot on a phone/DSLR (has EXIF capture data)
  | 'screenshot' // device screen capture
  | 'download' // saved from the web / a browser
  | 'social' // WhatsApp / Instagram / Telegram etc.
  | 'scanned' // document scan
  | 'ai' // AI generated / upscaled
  | 'imported' // generic file import, source unknown
  | 'unknown';

export type MediaKind = 'image' | 'video';

/** A geographic location attached to a media item. */
export interface GeoLocation {
  lat: number;
  lng: number;
  /** Reverse-geocoded human label, e.g. "Mumbai, India". */
  place?: string;
  city?: string;
  country?: string;
}

/** Non-destructive edit adjustments (all normalized -1..1 unless noted). */
export interface EditAdjustments {
  exposure: number;
  brilliance: number;
  highlights: number;
  shadows: number;
  contrast: number;
  brightness: number;
  blackPoint: number;
  saturation: number;
  vibrance: number;
  warmth: number;
  tint: number;
  sharpness: number;
  definition: number;
  vignette: number;
}

export interface EditState {
  adjustments: Partial<EditAdjustments>;
  /** Named filter preset, e.g. "vivid", "dramatic", "mono". */
  filter?: string;
  /** Clockwise rotation in degrees (0/90/180/270). */
  rotation?: number;
  /** Fine straighten/tilt angle in degrees (-45..45). */
  straighten?: number;
  flipH?: boolean;
  flipV?: boolean;
  /** Crop as fractions of the source dimensions (0..1). */
  crop?: { x: number; y: number; width: number; height: number };
  /** Markup overlay (shapes, arrows, measurement labels, text). */
  annotations?: Annotation[];

  // ---- video-only edits ----
  /** Legacy single trim range in seconds. Superseded by `segments`; still honored. */
  trim?: { start: number; end: number };
  /**
   * Multi-segment trim: an ordered list of keep-ranges (cut unwanted middles,
   * reorder, or speed up parts). The exported clip is the segments concatenated.
   * When present this takes precedence over `trim`.
   */
  segments?: VideoSegment[];
  /** Legacy single static image overlay. Superseded by `overlays`; still honored. */
  overlay?: { src: string; x: number; y: number; scale: number };
  /** Image/text/watermark overlays with timing + keyframe animation. */
  overlays?: VideoOverlay[];
  /** Frame (output-timeline seconds) to grab as the poster/thumbnail on export. */
  posterTime?: number;
  /** Export quality knobs. */
  export?: { maxDim?: number; fps?: number; bitrate?: number };
  /** Audio mix: mute/volume the original, add a music track, and fade in/out. */
  audio?: {
    muted?: boolean;
    originalVolume?: number;
    musicSrc?: string;
    musicVolume?: number;
    /** Master fade in / out over the whole exported clip, in seconds. */
    fadeIn?: number;
    fadeOut?: number;
  };
}

/** One keep-range of a multi-segment video trim. */
export interface VideoSegment {
  id: string;
  /** Range within the SOURCE video, in seconds. */
  start: number;
  end: number;
  /** Playback speed for this segment (1 = normal, 0.5 = slow-mo, 2 = fast). */
  speed?: number;
}

/** A single animation keyframe for a video overlay. Times are OUTPUT-timeline seconds. */
export interface OverlayKeyframe {
  t: number;
  /** Position of the overlay's top-left as 0..1 fractions of the frame. */
  x?: number;
  y?: number;
  /** Width as a 0..1 fraction of the frame width. */
  scale?: number;
  /** Rotation in degrees. */
  rotation?: number;
  /** 0..1 opacity. */
  opacity?: number;
}

/** An image or text overlay composited onto a video, with timing + keyframes. */
export interface VideoOverlay {
  id: string;
  kind: 'image' | 'text';
  /** Image data/URL (kind 'image'). */
  src?: string;
  /** Text content (kind 'text'). */
  text?: string;
  color?: string;
  /** Text size as a 0..1 fraction of the frame height. */
  fontSize?: number;
  bold?: boolean;
  // Base transform — used when no keyframe brackets the current time.
  x: number;
  y: number;
  scale: number;
  rotation?: number;
  opacity?: number;
  /** Visible window (output-timeline seconds). Absent = whole clip. */
  in?: number;
  out?: number;
  keyframes?: OverlayKeyframe[];
  /** Marks a persistent watermark (visible for the whole clip). */
  watermark?: boolean;
}

export type AnnotationShape =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'double-arrow'
  | 'text'
  | 'freehand';

/** A single markup annotation. All geometry is normalized 0..1 relative to the image box. */
export interface Annotation {
  id: string;
  shape: AnnotationShape;
  color: string;
  strokeWidth: number; // display px
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Text content / measurement label (text + double-arrow shapes). */
  text?: string;
  /** Freehand path points (normalized). */
  points?: Array<{ x: number; y: number }>;
}

/** A detected object/region inside an image (for click-to-find-similar). */
export interface DetectedObject {
  label: string;
  confidence: number;
  /** Bounding box as fractions of the image (0..1). */
  box: { x: number; y: number; width: number; height: number };
}

/** A detected face region, optionally linked to a person cluster. */
export interface DetectedFace {
  personId?: PersonId;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
  /** Embedding vector for clustering / similarity (optional). */
  embedding?: number[];
}

/** The central media entity (photo or video). */
export interface MediaItem {
  id: MediaId;
  kind: MediaKind;
  /** Full-resolution source (URL, blob URL, or data URL). */
  src: string;
  /** Optional smaller thumbnail; falls back to `src`. */
  thumbnail?: string;
  /** Optional poster frame for videos. */
  poster?: string;
  name: string;
  width: number;
  height: number;
  mime: string;
  bytes?: number;

  /** Capture time (ms epoch). Used for grouping by year/month/day. */
  takenAt: number;
  importedAt: number;
  editedAt?: number;
  /** When moved to the recycle bin (ms epoch). Absent = not deleted. */
  deletedAt?: number;

  /** Video duration in seconds. */
  duration?: number;

  favorite: boolean;
  hidden: boolean;

  source: MediaSource;
  /** User album ids this item belongs to. */
  albumIds: AlbumId[];
  /** Free-form + auto-generated tags / keywords. */
  tags: string[];
  /** Detected object labels (denormalized from `objects` for fast filtering). */
  objectLabels: string[];
  /** Person cluster ids present in this item. */
  personIds: PersonId[];

  location?: GeoLocation;
  exif?: Record<string, string | number>;

  // AI-derived metadata (optional, filled lazily by providers).
  caption?: string;
  /**
   * Printed/handwritten text extracted from the image by OCR.
   * @security Attacker-influencable (text inside an imported image). Render ONLY
   * via React JSX / textContent — never innerHTML. Sanitized + length-capped on write.
   * `undefined` = not yet processed; `''` = OCR ran, found no text (so it isn't retried).
   */
  ocrText?: string;
  objects?: DetectedObject[];
  faces?: DetectedFace[];
  /** When AI analysis last ran on this item (ms epoch); absent = not analyzed. */
  analyzedAt?: number;
  colorPalette?: string[];
  /** 0..1 blur estimate (higher = blurrier). */
  blurScore?: number;
  /** 0..1 aesthetic/quality estimate. */
  qualityScore?: number;
  /** Embedding for semantic search (optional). */
  embedding?: number[];

  isLivePhoto?: boolean;
  isRaw?: boolean;
  isPanorama?: boolean;

  edits?: EditState;

  /** Edit history — v1 is always the original; each save appends a version. */
  versions?: MediaVersion[];
  /** User comments on this photo/video (chronological). */
  comments?: MediaComment[];
}

/** A saved snapshot of a photo/video at one point in its edit history. */
export interface MediaVersion {
  id: string;
  /** 1 = original; increments on every saved edit. */
  version: number;
  createdAt: number;
  /** The media source for this version. */
  src: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  /** Edit stack applied to produce this version (from the original). */
  edits?: EditState;
  /** Human-readable audit log of what changed in this version. */
  changes: string[];
  /** Optional user label / note. */
  note?: string;
}

/** A comment left on a photo/video. */
export interface MediaComment {
  id: string;
  author?: string;
  text: string;
  createdAt: number;
}

export type AlbumKind = 'user' | 'smart' | 'folder' | 'shared';

/** A field/operator/value rule used by smart albums. */
export interface SmartRule {
  field:
    | 'source'
    | 'kind'
    | 'favorite'
    | 'tag'
    | 'object'
    | 'person'
    | 'mime'
    | 'name'
    | 'takenAt'
    | 'hasLocation'
    | 'hasText'
    | 'isRaw'
    | 'isLivePhoto'
    | 'isPanorama';
  op: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'isTrue' | 'isFalse';
  value?: string | number | boolean;
}

export interface SmartRuleSet {
  /** 'all' = AND, 'any' = OR. */
  match: 'all' | 'any';
  rules: SmartRule[];
}

export interface Album {
  id: AlbumId;
  name: string;
  kind: AlbumKind;
  /** Parent folder id for nesting. */
  parentId?: AlbumId;
  /** Ordered media ids (user albums). */
  mediaIds: MediaId[];
  /** Rules for smart albums. */
  ruleSet?: SmartRuleSet;
  coverId?: MediaId;
  createdAt: number;
  pinned?: boolean;
  /** Whether this is a system-provided album (cannot be deleted/renamed). */
  system?: boolean;
  /** Icon key for system albums. */
  icon?: string;
}

export interface Person {
  id: PersonId;
  name?: string;
  coverId?: MediaId;
  mediaIds: MediaId[];
  isPet?: boolean;
}

/** A share created by the user (single photo, several photos, or a whole album). */
export interface ShareRecord {
  id: string;
  /** Short public token embedded in the share link. */
  token: string;
  scope: 'photo' | 'photos' | 'album';
  mediaIds: MediaId[];
  albumId?: AlbumId;
  title: string;
  /** Shareable deep link (also the download entry point). */
  url: string;
  createdAt: number;
}

/** Theme preference. `semi-dark` = dark glass sidebar with light content. */
export type ThemePreference = 'system' | 'light' | 'dark' | 'semi-dark';

/** A concrete resolved theme applied to the DOM. */
export type ResolvedTheme = 'light' | 'dark' | 'semi-dark';

/** Library zoom density (Apple-style years/months/days/all). */
export type LibraryScale = 'years' | 'months' | 'days' | 'all';

export type MapMode = 'map' | 'satellite' | 'grid';

/** The active view inside the gallery. Album views encode the id. */
export type ViewId =
  | 'library'
  | 'collections'
  | 'favourites'
  | 'recently-saved'
  | 'map'
  | 'videos'
  | 'screenshots'
  | 'people'
  | 'recently-deleted'
  | 'duplicates'
  | 'albums'
  | 'shared-albums'
  | 'activity'
  | 'search'
  | 'versions'
  | `album:${string}`
  | `sys:${string}`;
