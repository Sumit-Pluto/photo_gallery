import type { Album, MediaItem, SmartRule, SmartRuleSet } from '../types';

/** The user's permanent tag-rename map: canonical lowercased detector label → chosen label. */
export type LabelAliases = Record<string, string>;

/**
 * Resolve a detected object label through the user's rename alias map. Keys are
 * canonical lowercased detector labels ("car"); the value is the label the user
 * renamed it to ("excavator"). Returns the original label when no alias applies.
 */
export function resolveLabel(label: string, aliases: LabelAliases = {}): string {
  return aliases[label.trim().toLowerCase()] ?? label;
}

/** Evaluate a single smart rule against a media item. */
function evalRule(item: MediaItem, rule: SmartRule, aliases: LabelAliases = {}): boolean {
  const { field, op, value } = rule;

  const get = (): unknown => {
    switch (field) {
      case 'source': return item.source;
      case 'kind': return item.kind;
      case 'favorite': return item.favorite;
      case 'mime': return item.mime;
      case 'name': return item.name;
      case 'takenAt': return item.takenAt;
      case 'hasLocation': return Boolean(item.location);
      case 'hasText': return Boolean(item.ocrText && item.ocrText.trim().length > 0);
      case 'isRaw': return Boolean(item.isRaw);
      case 'isLivePhoto': return Boolean(item.isLivePhoto);
      case 'isPanorama': return Boolean(item.isPanorama);
      case 'tag': return item.tags;
      // Resolve object labels through the rename map so a photo detected as the
      // original label still matches the renamed album's rule.
      case 'object': return item.objectLabels.map((l) => resolveLabel(l, aliases));
      case 'person': return item.personIds;
      default: return undefined;
    }
  };

  const actual = get();

  switch (op) {
    case 'eq': return actual === value;
    case 'neq': return actual !== value;
    case 'isTrue': return actual === true;
    case 'isFalse': return actual === false || actual === undefined;
    case 'gt': return typeof actual === 'number' && typeof value === 'number' && actual > value;
    case 'lt': return typeof actual === 'number' && typeof value === 'number' && actual < value;
    case 'contains':
      if (Array.isArray(actual)) {
        return actual.some(
          (v) => typeof v === 'string' && typeof value === 'string' && v.toLowerCase().includes(value.toLowerCase()),
        );
      }
      if (typeof actual === 'string' && typeof value === 'string') {
        return actual.toLowerCase().includes(value.toLowerCase());
      }
      return false;
    default: return false;
  }
}

/** Does an item satisfy a rule set (AND/OR over its rules)? */
export function matchesRuleSet(
  item: MediaItem,
  ruleSet: SmartRuleSet,
  aliases: LabelAliases = {},
): boolean {
  if (item.deletedAt) return false; // trashed items never appear in smart albums
  if (ruleSet.rules.length === 0) return true;
  return ruleSet.match === 'all'
    ? ruleSet.rules.every((r) => evalRule(item, r, aliases))
    : ruleSet.rules.some((r) => evalRule(item, r, aliases));
}

/** Resolve the live member ids of a smart album from the full library. */
export function resolveSmartAlbum(
  album: Album,
  items: MediaItem[],
  aliases: LabelAliases = {},
): string[] {
  if (!album.ruleSet) return [];
  return items.filter((i) => matchesRuleSet(i, album.ruleSet!, aliases)).map((i) => i.id);
}

/**
 * The system smart albums Photos ships with. These are recomputed from the
 * library whenever it changes, so they always reflect current content.
 */
export function defaultSystemAlbums(now: number): Album[] {
  const base = (
    id: string,
    name: string,
    icon: string,
    ruleSet: SmartRuleSet,
    pinned = true,
  ): Album => ({
    id,
    name,
    kind: 'smart',
    mediaIds: [],
    ruleSet,
    createdAt: now,
    pinned,
    system: true,
    icon,
  });

  return [
    base('sys:favourites', 'Favourites', 'heart', {
      match: 'all',
      rules: [{ field: 'favorite', op: 'isTrue' }],
    }),
    base('sys:videos', 'Videos', 'video', {
      match: 'all',
      rules: [{ field: 'kind', op: 'eq', value: 'video' }],
    }),
    base('sys:screenshots', 'Screenshots', 'screenshot', {
      match: 'all',
      rules: [{ field: 'source', op: 'eq', value: 'screenshot' }],
    }),
    base('sys:documents', 'Documents', 'document', {
      match: 'all',
      rules: [{ field: 'hasText', op: 'isTrue' }],
    }),
    base('sys:selfies', 'Selfies', 'person', {
      match: 'any',
      rules: [{ field: 'tag', op: 'contains', value: 'selfie' }],
    }, false),
    base('sys:recently-saved', 'Recently Saved', 'download', {
      match: 'any',
      rules: [
        { field: 'source', op: 'eq', value: 'download' },
        { field: 'source', op: 'eq', value: 'social' },
      ],
    }),
    base('sys:raw', 'RAW', 'raw', {
      match: 'all',
      rules: [{ field: 'isRaw', op: 'isTrue' }],
    }, false),
    base('sys:live', 'Live Photos', 'live', {
      match: 'all',
      rules: [{ field: 'isLivePhoto', op: 'isTrue' }],
    }, false),
    base('sys:panoramas', 'Panoramas', 'pano', {
      match: 'all',
      rules: [{ field: 'isPanorama', op: 'isTrue' }],
    }, false),
  ];
}

/** Title-case a detected object label for display ("dining table" → "Dining Table"). */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Auto-generate one live smart album per DETECTED OBJECT label — e.g. every photo
 * containing a "chair" is grouped into a "Chair" album, "table" into "Table", etc.
 * Membership is resolved live (via resolveSmartAlbum) as detection tags more photos;
 * these are system albums (never persisted — regenerated on load).
 *
 * @param minCount only surface a label once it appears on at least this many photos.
 */
export function objectSmartAlbums(
  media: MediaItem[],
  now: number,
  aliases: LabelAliases = {},
  minCount = 1,
): Album[] {
  const counts = new Map<string, number>();
  for (const m of media) {
    if (m.deletedAt || m.hidden) continue;
    // Resolve labels through the rename map, then de-dupe within one item so a
    // single photo counts once per (renamed) label and renamed labels regroup.
    for (const label of new Set(m.objectLabels.map((l) => resolveLabel(l, aliases)))) {
      const key = label.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => ({
      id: `sys:obj:${label}`,
      name: titleCase(label),
      kind: 'smart' as const,
      mediaIds: [],
      ruleSet: { match: 'all', rules: [{ field: 'object', op: 'contains', value: label }] } as SmartRuleSet,
      createdAt: now,
      pinned: false,
      system: true,
      icon: 'tag',
    }));
}
