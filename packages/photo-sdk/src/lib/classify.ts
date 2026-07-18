import type { MediaSource } from '../types';

/**
 * Heuristic media-source classification — no AI model required.
 *
 * Uses filename patterns, dimensions, mime type and the presence of camera EXIF
 * data to guess whether a file is a screenshot, a download, a social-app save,
 * a scanned document, or a real camera capture. This mirrors how Photos
 * auto-populates its "Screenshots" / "Recents" smart albums.
 */

export interface ClassifyInput {
  name: string;
  width: number;
  height: number;
  mime: string;
  hasCameraExif?: boolean;
  /** Common device screen sizes help confirm screenshots. */
  knownScreenSizes?: Array<[number, number]>;
}

const SCREENSHOT_NAME = /(screen[\s_-]?shot|screenshot|screen recording|capture)/i;
const SOCIAL_NAME = /(whatsapp|img-\d{8}-wa\d+|telegram|instagram|insta|fb_img|facebook|messenger|signal|snapchat)/i;
const DOWNLOAD_NAME = /(download|untitled|unsplash|pexels|pixabay|getty|shutterstock|wallpaper)/i;
const SCAN_NAME = /(scan|scanned|cam[\s_-]?scanner|doc[\s_-]?scan|adobe[\s_-]?scan)/i;
const AI_NAME = /(midjourney|dall[\s_-]?e|stable[\s_-]?diffusion|sdxl|ai[\s_-]?generated|upscayl|gigapixel|remaster)/i;
const CAMERA_NAME = /(img_\d+|dsc[_-]?\d+|dscf\d+|p\d{7}|gopr\d+|dji_\d+|_mg_\d+|pxl_\d+)/i;

const DEFAULT_SCREEN_SIZES: Array<[number, number]> = [
  [1170, 2532], [1284, 2778], [1080, 2400], [1080, 1920], [1440, 3200],
  [2532, 1170], [2778, 1284], [2400, 1080], [1920, 1080],
  [2560, 1440], [3840, 2160], [1280, 800], [2880, 1800], [1366, 768],
];

export function classifyMediaSource(input: ClassifyInput): MediaSource {
  const { name, width, height, mime, hasCameraExif } = input;
  const lower = name.toLowerCase();

  if (mime.startsWith('video/')) {
    if (SCREENSHOT_NAME.test(lower)) return 'screenshot'; // screen recording
    if (SOCIAL_NAME.test(lower)) return 'social';
    return hasCameraExif ? 'camera' : 'imported';
  }

  if (AI_NAME.test(lower)) return 'ai';
  if (SCAN_NAME.test(lower)) return 'scanned';
  if (SCREENSHOT_NAME.test(lower)) return 'screenshot';
  if (SOCIAL_NAME.test(lower)) return 'social';

  // An image at an exact device resolution with no camera EXIF -> almost certainly a screenshot.
  const sizes = input.knownScreenSizes ?? DEFAULT_SCREEN_SIZES;
  const matchesScreen = sizes.some(([w, h]) => w === width && h === height);
  if (!hasCameraExif && matchesScreen) {
    return 'screenshot';
  }

  if (CAMERA_NAME.test(lower) || hasCameraExif) return 'camera';
  if (DOWNLOAD_NAME.test(lower)) return 'download';

  // PNGs without camera data are usually web downloads or graphics, not captures.
  if (mime === 'image/png' && !hasCameraExif) return 'download';

  return 'imported';
}

/** Human-friendly label for a media source. */
export function sourceLabel(source: MediaSource): string {
  switch (source) {
    case 'camera': return 'Camera';
    case 'screenshot': return 'Screenshot';
    case 'download': return 'Downloaded';
    case 'social': return 'Social';
    case 'scanned': return 'Scanned';
    case 'ai': return 'AI Generated';
    case 'imported': return 'Imported';
    default: return 'Unknown';
  }
}
