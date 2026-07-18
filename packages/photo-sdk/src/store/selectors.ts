import { matchesRuleSet, resolveSmartAlbum } from '../lib/smartAlbums';
import type { Album, MediaItem } from '../types';
import type { GalleryState, GridFilter } from './store';

/** Items that are not in the recycle bin and not hidden. */
export function liveMedia(media: MediaItem[]): MediaItem[] {
  return media.filter((m) => !m.deletedAt && !m.hidden);
}

export function trashedMedia(media: MediaItem[]): MediaItem[] {
  return media
    .filter((m) => m.deletedAt)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export function albumById(albums: Album[], id: string): Album | undefined {
  return albums.find((a) => a.id === id);
}

/** Resolve the members of any album (smart albums are computed live). */
export function albumMedia(album: Album, media: MediaItem[]): MediaItem[] {
  if (album.kind === 'smart' && album.ruleSet) {
    const ids = new Set(resolveSmartAlbum(album, media));
    return liveMedia(media)
      .filter((m) => ids.has(m.id))
      .sort((a, b) => b.takenAt - a.takenAt);
  }
  const order = new Map(album.mediaIds.map((id, i) => [id, i]));
  return liveMedia(media)
    .filter((m) => order.has(m.id))
    .sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
}

function applyGridFilter(items: MediaItem[], filter: GridFilter): MediaItem[] {
  switch (filter) {
    case 'favourites': return items.filter((m) => m.favorite);
    case 'edited': return items.filter((m) => Boolean(m.edits));
    case 'photos': return items.filter((m) => m.kind === 'image');
    case 'videos': return items.filter((m) => m.kind === 'video');
    case 'screenshots': return items.filter((m) => m.source === 'screenshot');
    case 'not-in-album': return items.filter((m) => m.albumIds.length === 0);
    default: return items;
  }
}

/** Full-text-ish search across the most useful fields. */
export function searchMedia(items: MediaItem[], query: string): MediaItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const tokens = q.split(/\s+/).filter(Boolean);
  return items.filter((m) => {
    const haystack = [
      m.name,
      m.source,
      m.kind,
      m.caption ?? '',
      m.ocrText ?? '',
      m.location?.place ?? '',
      m.location?.city ?? '',
      m.location?.country ?? '',
      ...m.tags,
      ...m.objectLabels,
    ]
      .join(' ')
      .toLowerCase();
    // Every token must match somewhere (AND semantics).
    return tokens.every((t) => haystack.includes(t));
  });
}

/**
 * The media shown for the current view, after applying trash exclusion,
 * grid filter, search and object-focus. Returns reverse-chronological order.
 */
export function mediaForView(state: GalleryState): MediaItem[] {
  const { media, albums, view, gridFilter, searchQuery, objectFocus, tagFocus, personFocus, searchPreset, semanticResults, recentlyViewed } =
    state;
  let items: MediaItem[];
  // When a search ranks results (keyword + semantic), preserve that order
  // instead of re-sorting chronologically.
  let ranked = false;

  // Quick search presets (from the search dropdown) take precedence on the search view.
  if (view === 'search' && searchPreset) {
    const live = liveMedia(media);
    if (searchPreset === 'edited') {
      // Edited = has an edit timestamp (baked crops/AI) or a live edit stack (filters/markup).
      return live
        .filter((m) => m.editedAt || m.edits)
        .sort((a, b) => (b.editedAt ?? 0) - (a.editedAt ?? 0));
    }
    if (searchPreset === 'added') {
      return [...live].sort((a, b) => b.importedAt - a.importedAt);
    }
    // viewed
    const order = new Map(recentlyViewed.map((id, i) => [id, i]));
    return live.filter((m) => order.has(m.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  if (view === 'recently-deleted') {
    items = trashedMedia(media);
  } else if (view === 'duplicates') {
    items = liveMedia(media);
  } else if (view.startsWith('album:') || view.startsWith('sys:')) {
    const album = albumById(albums, view);
    items = album ? albumMedia(album, media) : [];
  } else if (view === 'favourites') {
    items = liveMedia(media).filter((m) => m.favorite);
  } else if (view === 'recently-saved') {
    items = liveMedia(media).filter((m) => m.source === 'download' || m.source === 'social');
  } else if (view === 'videos') {
    items = liveMedia(media).filter((m) => m.kind === 'video');
  } else if (view === 'screenshots') {
    items = liveMedia(media).filter((m) => m.source === 'screenshot');
  } else {
    items = liveMedia(media);
  }

  if (view !== 'recently-deleted') {
    items = applyGridFilter(items, gridFilter);
  }
  if (objectFocus) {
    items = items.filter((m) => m.objectLabels.includes(objectFocus));
  }
  if (tagFocus) {
    items = items.filter((m) => m.tags.includes(tagFocus));
  }
  if (personFocus) {
    items = items.filter((m) => m.personIds.includes(personFocus));
  }
  if (searchQuery && (view === 'search' || view === 'library')) {
    const keyword = searchMedia(items, searchQuery);
    // Blend in semantic ("looks like") matches after the keyword hits, in
    // similarity order, skipping any already matched by keyword.
    if (semanticResults && semanticResults.length) {
      const inView = new Map(items.map((m) => [m.id, m]));
      const kwIds = new Set(keyword.map((m) => m.id));
      const semantic = semanticResults
        .filter((id) => !kwIds.has(id) && inView.has(id))
        .map((id) => inView.get(id)!);
      items = [...keyword, ...semantic];
    } else {
      items = keyword;
    }
    ranked = true;
  }

  // Default reverse-chronological unless an album imposed its own order or the
  // results are relevance-ranked by search.
  if (!view.startsWith('album:') && !ranked) {
    items = [...items].sort((a, b) => b.takenAt - a.takenAt);
  }
  return items;
}

/** Distinct object labels across the live library (for AI auto-albums). */
export function objectLabelCounts(media: MediaItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of liveMedia(media)) {
    for (const label of m.objectLabels) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return counts;
}

/** Items with a geolocation (for the Map view). Any source — incl. screenshots. */
export function locatedMedia(media: MediaItem[]): MediaItem[] {
  return liveMedia(media).filter((m) => m.location);
}

export interface LocationCluster {
  /** Centroid of the grouped photos. */
  lat: number;
  lng: number;
  /** Photos at this location, most-recent first (first = pin cover). */
  items: MediaItem[];
}

/**
 * Group located media into pins by rounding coordinates to `precision` decimals
 * (1 ≈ 11 km, 2 ≈ 1.1 km). The Map view raises precision as you zoom in, so
 * clusters split apart — macOS-style.
 */
export function clusterByLocation(items: MediaItem[], precision = 1): LocationCluster[] {
  const groups = new Map<string, MediaItem[]>();
  for (const m of items) {
    if (!m.location) continue;
    const key = `${m.location.lat.toFixed(precision)},${m.location.lng.toFixed(precision)}`;
    const arr = groups.get(key);
    if (arr) arr.push(m);
    else groups.set(key, [m]);
  }
  return [...groups.values()].map((arr) => {
    const lat = arr.reduce((s, m) => s + m.location!.lat, 0) / arr.length;
    const lng = arr.reduce((s, m) => s + m.location!.lng, 0) / arr.length;
    const sorted = [...arr].sort((a, b) => b.takenAt - a.takenAt);
    return { lat, lng, items: sorted };
  });
}

export { matchesRuleSet };
