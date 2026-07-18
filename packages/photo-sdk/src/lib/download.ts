import type { MediaItem } from '../types';

/** Trigger a browser download of a single media item by URL. */
export function downloadMedia(item: MediaItem): void {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = item.src;
  a.download = sanitizeFilename(item.name);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Export a metadata-only JSON sidecar for the current selection. */
export function exportMetadata(items: MediaItem[]): void {
  if (typeof document === 'undefined') return;
  const payload = items.map((i) => ({
    name: i.name,
    takenAt: new Date(i.takenAt).toISOString(),
    source: i.source,
    tags: i.tags,
    objects: i.objectLabels,
    location: i.location,
    favorite: i.favorite,
    width: i.width,
    height: i.height,
  }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'photos-metadata.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Sanitize a filename to prevent path traversal / illegal characters when it is
 * used as a download target. Security-relevant: never trust an imported name.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    // Strip path separators and characters illegal on common filesystems.
    .replace(/[/\\?%*:|"<>]/g, '_')
    // Collapse parent-directory sequences (path traversal guard).
    .replace(/\.\.+/g, '_')
    .trim();
  return cleaned.slice(0, 200) || 'photo';
}
