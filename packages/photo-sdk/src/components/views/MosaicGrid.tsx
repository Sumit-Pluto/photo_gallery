'use client';

import { useEffect, useState } from 'react';

import { editFilterCss } from '../../lib/edits';
import { groupByTime } from '../../lib/grouping';
import { useGalleryStoreApi } from '../../store/context';
import type { MediaItem } from '../../types';

/**
 * macOS "Grid" / Memories-style mosaic: date-grouped sections, each led by a
 * full-width auto-sliding hero, followed by an irregular grid of tiles with
 * varied spans (portrait/landscape/square) rather than a uniform square grid.
 */

// (col-span, row-span) pattern for the tiles under the hero → deliberate variety.
const SPANS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [1, 2],
  [2, 1],
  [1, 1],
  [2, 2],
  [1, 2],
  [1, 1],
  [2, 1],
];

function Tile({ item, onOpen, span }: { item: MediaItem; onOpen: () => void; span: readonly [number, number] }) {
  return (
    <button
      type="button"
      className="apg-mosaic__tile"
      style={{ gridColumn: `span ${span[0]}`, gridRow: `span ${span[1]}` }}
      onClick={onOpen}
      aria-label={item.name}
    >
      {item.kind === 'video' ? (
        <video src={item.src} poster={item.poster} muted preload="metadata" playsInline />
      ) : (
        <img
          src={item.thumbnail ?? item.src}
          alt=""
          loading="lazy"
          style={{ filter: editFilterCss(item.edits) }}
        />
      )}
    </button>
  );
}

/** Full-width hero that cross-fades through the section's first few photos. */
function SlideHero({ items, onOpen }: { items: MediaItem[]; onOpen: (id: string) => void }) {
  const [i, setI] = useState(0);
  const slides = items.slice(0, 6);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 3500);
    return () => clearInterval(t);
  }, [slides.length]);
  const current = slides[i % slides.length] ?? items[0]!;
  return (
    <button type="button" className="apg-mosaic__hero" onClick={() => onOpen(current.id)} aria-label="Open photo">
      {slides.map((m, idx) => (
        <img
          key={m.id}
          src={m.thumbnail ?? m.src}
          alt=""
          style={{ opacity: idx === i % slides.length ? 1 : 0, filter: editFilterCss(m.edits) }}
        />
      ))}
      {slides.length > 1 ? (
        <span className="apg-mosaic__dots" aria-hidden>
          {slides.map((m, idx) => (
            <span key={m.id} className={idx === i % slides.length ? 'is-active' : ''} />
          ))}
        </span>
      ) : null}
    </button>
  );
}

export function MosaicGrid({ items, groupBy = 'month' }: { items: MediaItem[]; groupBy?: 'month' | 'day' }) {
  const api = useGalleryStoreApi();
  const open = (id: string) => api.getState().openLightbox(id);
  const sections = groupByTime(items, groupBy);

  return (
    <div className="apg-scroll apg-mosaic-wrap">
      {sections.map((s) => (
        <section key={s.key} className="apg-mosaic-section">
          <div className="apg-mosaic__title">{s.title}</div>
          <SlideHero items={s.items} onOpen={open} />
          {s.items.length > 1 ? (
            <div className="apg-mosaic">
              {s.items.slice(1).map((m, idx) => (
                <Tile key={m.id} item={m} span={SPANS[idx % SPANS.length]!} onOpen={() => open(m.id)} />
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
