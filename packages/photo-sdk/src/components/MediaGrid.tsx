'use client';

import { useMemo } from 'react';

import { GRID_ZOOM_STEPS } from '../constants';
import { useGallery } from '../store/context';
import type { MediaItem } from '../types';
import { PhotoTile } from './PhotoTile';

/** Minimum tile width (px) for each zoom step — drives responsive auto-fill. */
const TILE_MIN_BY_ZOOM = [104, 124, 150, 188, 232, 300, 420];

export interface MediaGridProps {
  items: MediaItem[];
  /** Optional sticky section title rendered above the grid. */
  title?: string;
}

/**
 * Adaptive, responsive photo grid. Column count follows the zoom level via CSS
 * `auto-fill`, so it reflows naturally from ultra-wide screens down to a phone.
 * Images are lazy-decoded for performance with large libraries.
 */
export function MediaGrid({ items, title }: MediaGridProps) {
  const zoomIndex = useGallery((s) => s.zoomIndex);
  const orderedIds = useMemo(() => items.map((i) => i.id), [items]);

  const tileMin = TILE_MIN_BY_ZOOM[Math.min(zoomIndex, TILE_MIN_BY_ZOOM.length - 1)] ?? 188;

  return (
    <div>
      {title ? <div className="apg-grid__section-title">{title}</div> : null}
      <div
        className="apg-grid"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileMin}px, 1fr))` }}
      >
        {items.map((item) => (
          <PhotoTile key={item.id} item={item} orderedIds={orderedIds} />
        ))}
      </div>
    </div>
  );
}

export { GRID_ZOOM_STEPS };
