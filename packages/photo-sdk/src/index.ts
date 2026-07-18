// ============================================================================
// @photo-gallery/sdk — public API
// A reusable, macOS Photos-style photo gallery for React / Next.js.
// ============================================================================

// Main component + props
export { PhotoGallery } from './components/PhotoGallery';
export type { PhotoGalleryProps } from './components/PhotoGallery';

// Headless store access (for advanced composition / external control)
export { useGallery, useGalleryStoreApi, GalleryStoreContext } from './store/context';
export { createGalleryStore, DEFAULT_FEATURES } from './store/store';
export type {
  GalleryState,
  GalleryStore,
  GalleryConfig,
  GalleryFeatures,
  ThemeTokens,
  GridFilter,
} from './store/store';
export * as selectors from './store/selectors';

// Domain types
export type {
  MediaItem,
  MediaId,
  MediaKind,
  MediaSource,
  Album,
  AlbumId,
  AlbumKind,
  Person,
  PersonId,
  GeoLocation,
  EditState,
  EditAdjustments,
  Annotation,
  AnnotationShape,
  DetectedObject,
  DetectedFace,
  SmartRule,
  SmartRuleSet,
  ThemePreference,
  ResolvedTheme,
  LibraryScale,
  MapMode,
  ViewId,
} from './types';

// Storage adapters
export { createLocalStorageAdapter } from './adapters/localStorage';
export type { StorageAdapter, PersistedState } from './adapters/types';

// AI provider interface (pluggable; free in-browser or cloud)
export type { AIProvider, GenerativeEditOp } from './ai/types';
export { cosineSimilarity } from './ai/types';

// Helpers
export { createMediaItem, mediaFromFile, isAcceptedMediaFile } from './lib/media';
export type { MediaInput } from './lib/media';
export { classifyMediaSource, sourceLabel } from './lib/classify';
export { matchesRuleSet, resolveSmartAlbum, defaultSystemAlbums, objectSmartAlbums } from './lib/smartAlbums';
export { editFilterCss, editTransformCss } from './lib/edits';
export { summarizeEdits } from './lib/versions';
export {
  normalizeSegments,
  outputDuration,
  sourceToOutputTime,
  videoOutputSize,
  resolveOverlays,
  sampleOverlay,
} from './lib/videoTimeline';
export { bakeVideo } from './lib/videoBake';
// Pure, dependency-free AI post-processing utils (reusable + unit-testable).
export { clusterFaces } from './lib/cluster';
export type { FaceCluster } from './lib/cluster';
export { sanitizeOcrText, OCR_TEXT_MAX_CHARS } from './lib/text';

// Icons (re-usable in host apps)
export { Icon } from './icons';
export type { IconName } from './icons';

// Constants
export {
  FILTER_PRESETS,
  GRID_ZOOM_STEPS,
  TRASH_RETENTION_DAYS,
  AUTO_ALBUM_OBJECTS,
} from './constants';
