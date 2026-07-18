import type { EditAdjustments } from './types';

/** Recycle bin retention before items are eligible for permanent deletion. */
export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Library grid zoom presets: column count per density step. */
export const GRID_ZOOM_STEPS = [10, 8, 6, 5, 4, 3, 2] as const;
export const DEFAULT_ZOOM_INDEX = 3; // 5 columns

export const ZERO_ADJUSTMENTS: EditAdjustments = {
  exposure: 0,
  brilliance: 0,
  highlights: 0,
  shadows: 0,
  contrast: 0,
  brightness: 0,
  blackPoint: 0,
  saturation: 0,
  vibrance: 0,
  warmth: 0,
  tint: 0,
  sharpness: 0,
  definition: 0,
  vignette: 0,
};

/** Built-in, one-tap filter presets (Apple-style). Values feed the editor. */
export const FILTER_PRESETS: Record<
  string,
  { label: string; adjustments: Partial<EditAdjustments> }
> = {
  original: { label: 'Original', adjustments: {} },
  vivid: { label: 'Vivid', adjustments: { saturation: 0.35, contrast: 0.15, vibrance: 0.25 } },
  vividWarm: { label: 'Vivid Warm', adjustments: { saturation: 0.3, warmth: 0.25, contrast: 0.1 } },
  vividCool: { label: 'Vivid Cool', adjustments: { saturation: 0.3, warmth: -0.25, contrast: 0.1 } },
  dramatic: { label: 'Dramatic', adjustments: { contrast: 0.4, shadows: -0.25, highlights: -0.15 } },
  dramaticWarm: {
    label: 'Dramatic Warm',
    adjustments: { contrast: 0.4, warmth: 0.2, shadows: -0.2 },
  },
  dramaticCool: {
    label: 'Dramatic Cool',
    adjustments: { contrast: 0.4, warmth: -0.2, shadows: -0.2 },
  },
  mono: { label: 'Mono', adjustments: { saturation: -1, contrast: 0.1 } },
  silvertone: { label: 'Silvertone', adjustments: { saturation: -1, brightness: 0.05, contrast: 0.2 } },
  noir: { label: 'Noir', adjustments: { saturation: -1, contrast: 0.45, blackPoint: 0.2 } },
};

/** Object labels that auto-generate "AI albums" (like face clustering, for things). */
export const AUTO_ALBUM_OBJECTS = [
  'person',
  'dog',
  'cat',
  'car',
  'laptop',
  'cell phone',
  'chair',
  'dining table',
  'tv',
  'bottle',
  'cup',
  'book',
  'potted plant',
  'bicycle',
  'food',
] as const;

/** Object-detection labels treated as pets/animals — grouped into "People & Pets". */
export const PET_LABELS = ['dog', 'cat', 'bird', 'horse', 'rabbit'] as const;

/** Map tile sources (all free, no API key required). */
export const MAP_TILES = {
  map: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
} as const;

export const STORAGE_KEY = 'photo-gallery-sdk:v1';
