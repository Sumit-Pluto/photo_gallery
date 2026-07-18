import type { MediaItem } from '../types';
import { formatDay, formatMonth, formatYear } from './format';

export interface MediaSection<T = MediaItem> {
  key: string;
  title: string;
  subtitle?: string;
  items: T[];
}

type Granularity = 'day' | 'month' | 'year';

function bucketKey(ms: number, granularity: Granularity): string {
  const d = new Date(ms);
  switch (granularity) {
    case 'day': return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    case 'month': return `${d.getFullYear()}-${d.getMonth()}`;
    case 'year': return `${d.getFullYear()}`;
  }
}

function bucketTitle(ms: number, granularity: Granularity): string {
  switch (granularity) {
    case 'day': return formatDay(ms);
    case 'month': return formatMonth(ms);
    case 'year': return formatYear(ms);
  }
}

/**
 * Group media into reverse-chronological sections by day/month/year.
 * Used by the Library's Years / Months / All Photos views.
 */
export function groupByTime(
  items: MediaItem[],
  granularity: Granularity,
): MediaSection[] {
  const sorted = [...items].sort((a, b) => b.takenAt - a.takenAt);
  const map = new Map<string, MediaSection>();
  for (const item of sorted) {
    const key = bucketKey(item.takenAt, granularity);
    let section = map.get(key);
    if (!section) {
      section = { key, title: bucketTitle(item.takenAt, granularity), items: [] };
      map.set(key, section);
    }
    section.items.push(item);
  }
  return [...map.values()];
}

/** Find probable duplicates by (name, bytes, dimensions) signature. */
export function findDuplicateGroups(items: MediaItem[]): MediaItem[][] {
  const map = new Map<string, MediaItem[]>();
  for (const item of items) {
    if (item.deletedAt) continue;
    const sig = `${item.name.toLowerCase()}|${item.bytes ?? 0}|${item.width}x${item.height}`;
    const arr = map.get(sig) ?? [];
    arr.push(item);
    map.set(sig, arr);
  }
  return [...map.values()].filter((g) => g.length > 1);
}
