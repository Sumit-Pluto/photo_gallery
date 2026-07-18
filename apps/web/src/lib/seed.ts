import type { MediaInput } from '@photo-gallery/sdk';

/**
 * Demo seed data. Uses free Picsum photos with synthetic-but-realistic metadata
 * (capture dates, GPS locations, tags, detected objects, sources) so that the
 * Map, Search, Smart Albums and "find similar object" features all have data to
 * show without any backend or API key.
 *
 * Picsum is allow-listed in the CSP (see next.config.mjs). Videos use Google's
 * public sample bucket, also allow-listed.
 */

const CITIES: Array<{ place: string; city: string; country: string; lat: number; lng: number }> = [
  { place: 'Mumbai, India', city: 'Mumbai', country: 'India', lat: 19.076, lng: 72.8777 },
  { place: 'New Delhi, India', city: 'New Delhi', country: 'India', lat: 28.6139, lng: 77.209 },
  { place: 'Bengaluru, India', city: 'Bengaluru', country: 'India', lat: 12.9716, lng: 77.5946 },
  { place: 'Goa, India', city: 'Goa', country: 'India', lat: 15.2993, lng: 74.124 },
  { place: 'Manali, India', city: 'Manali', country: 'India', lat: 32.2432, lng: 77.1892 },
  { place: 'Jaipur, India', city: 'Jaipur', country: 'India', lat: 26.9124, lng: 75.7873 },
  { place: 'San Francisco, USA', city: 'San Francisco', country: 'USA', lat: 37.7749, lng: -122.4194 },
  { place: 'New York, USA', city: 'New York', country: 'USA', lat: 40.7128, lng: -74.006 },
  { place: 'London, UK', city: 'London', country: 'UK', lat: 51.5074, lng: -0.1278 },
  { place: 'Paris, France', city: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
  { place: 'Tokyo, Japan', city: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503 },
  { place: 'Dubai, UAE', city: 'Dubai', country: 'UAE', lat: 25.2048, lng: 55.2708 },
];

const TAG_POOL = [
  ['beach', 'sunset', 'ocean'],
  ['mountain', 'snow', 'hike'],
  ['food', 'restaurant'],
  ['city', 'building', 'night'],
  ['nature', 'flower', 'plant'],
  ['friends', 'party'],
  ['travel', 'landmark'],
  ['selfie', 'portrait'],
];

const OBJECT_POOL = [
  ['person'],
  ['dog'],
  ['cat'],
  ['car'],
  ['laptop', 'cup'],
  ['dining table', 'chair', 'bottle'],
  ['tv', 'chair'],
  ['potted plant'],
  ['bicycle', 'person'],
];

// Served from the demo's own /public so it plays same-origin (no CORS / ORB issues).
const SAMPLE_VIDEOS = ['/sample-clip.mp4'];

const DAY = 24 * 60 * 60 * 1000;

export function buildSeedPhotos(now = Date.now()): MediaInput[] {
  const items: MediaInput[] = [];

  for (let i = 0; i < 44; i++) {
    const seed = `apg-${i}`;
    const takenAt = now - Math.floor(i * 8.4 + (i % 5) * 3) * DAY;
    // ~75% of demo photos are geotagged (real photos populate location via EXIF GPS on import).
    const hasLoc = i % 4 !== 0;
    const city = CITIES[i % CITIES.length]!;
    const tags = TAG_POOL[i % TAG_POOL.length]!;
    const objects = i % 3 === 0 ? OBJECT_POOL[i % OBJECT_POOL.length]! : [];

    // Distribute sources to populate smart albums.
    let source: MediaInput['source'] = 'camera';
    let name = `IMG_${4000 + i}.jpg`;
    let width = 1600;
    let height = 1067;

    const variant = i % 7;
    if (variant === 1) {
      source = 'screenshot';
      name = `Screenshot 2026-0${(i % 9) + 1}-12 at 9.41.${10 + i}.png`;
      width = 1170;
      height = 2532;
    } else if (variant === 2) {
      source = 'download';
      name = `download-${i}.jpg`;
    } else if (variant === 3) {
      source = 'social';
      name = `IMG-2026031${i % 9}-WA00${i % 9}.jpg`;
    } else if (variant === 5) {
      // panorama
      width = 2400;
      height = 820;
      name = `PANO_${i}.jpg`;
    }

    const isVideo = i % 11 === 4; // a few videos
    if (isVideo) {
      const v = SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length]!;
      items.push({
        src: v,
        poster: `https://picsum.photos/seed/${seed}/1280/720`,
        thumbnail: `https://picsum.photos/seed/${seed}/600/400`,
        name: `MOV_${5000 + i}.mp4`,
        kind: 'video',
        mime: 'video/mp4',
        width: 1280,
        height: 720,
        duration: 30 + (i % 4) * 12,
        takenAt,
        source: 'camera',
        bytes: 18_000_000 + i * 250_000,
        tags,
        objectLabels: objects,
        favorite: i % 9 === 0,
        location: hasLoc ? { ...city } : undefined,
      });
      continue;
    }

    items.push({
      src: `https://picsum.photos/seed/${seed}/${width}/${height}`,
      thumbnail: `https://picsum.photos/seed/${seed}/${Math.round(width / 3)}/${Math.round(height / 3)}`,
      name,
      kind: 'image',
      mime: source === 'screenshot' ? 'image/png' : 'image/jpeg',
      width,
      height,
      takenAt,
      source,
      bytes: 2_400_000 + i * 90_000,
      tags,
      objectLabels: objects,
      favorite: i % 6 === 0,
      isPanorama: variant === 5,
      location: hasLoc ? { ...city } : undefined,
      exif:
        source === 'camera'
          ? { Make: 'Apple', Model: 'iPhone 16 Pro', FNumber: 1.8, ISO: 100 + (i % 8) * 50 }
          : undefined,
    });
  }

  return items;
}
