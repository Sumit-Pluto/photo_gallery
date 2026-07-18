'use client';

import { useViewMedia } from '../../hooks/useViewMedia';
import { findDuplicateGroups } from '../../lib/grouping';
import { Icon } from '../../icons';
import { useGallery, useGalleryStoreApi } from '../../store/context';
import { albumById } from '../../store/selectors';
import { MediaGrid } from '../MediaGrid';
import { PhotoTile } from '../PhotoTile';
import { EmptyState } from './EmptyState';

const EMPTY_COPY: Record<string, { title: string; subtitle: string; icon: any }> = {
  favourites: { title: 'No Favourites', subtitle: 'Tap the heart on a photo to add it here.', icon: 'heart' },
  'recently-saved': { title: 'Nothing Saved Yet', subtitle: 'Downloaded and shared media will appear here.', icon: 'download' },
  videos: { title: 'No Videos', subtitle: 'Imported videos will appear here.', icon: 'video' },
  screenshots: { title: 'No Screenshots', subtitle: 'Screenshots are detected automatically on import.', icon: 'screenshot' },
  search: { title: 'Search Your Library', subtitle: 'Search by name, place, tag or detected object.', icon: 'search' },
};

/** Generic grid screen for the simple filtered views. */
export function GridScreen() {
  const items = useViewMedia();
  const view = useGallery((s) => s.view);

  if (items.length === 0) {
    const copy = EMPTY_COPY[view] ?? { title: 'No Items', subtitle: '', icon: 'image' };
    return <EmptyState icon={copy.icon} title={copy.title} subtitle={copy.subtitle} />;
  }
  return (
    <div className="apg-scroll">
      <MediaGrid items={items} />
    </div>
  );
}

export function AlbumView() {
  const view = useGallery((s) => s.view);
  const albums = useGallery((s) => s.albums);
  const items = useViewMedia();
  const album = albumById(albums, view);

  return (
    <div className="apg-scroll">
      <div style={{ padding: '18px 14px 4px' }}>
        <div style={{ fontSize: 26, fontWeight: 700 }}>{album?.name ?? 'Album'}</div>
        <div style={{ color: 'var(--apg-text-secondary)', fontSize: 13 }}>
          {items.length} item{items.length === 1 ? '' : 's'}
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon="collections"
          title="No Photos"
          subtitle="Select photos in your library and add them to this album."
        />
      ) : (
        <MediaGrid items={items} />
      )}
    </div>
  );
}

export function SharedAlbumsView() {
  const api = useGalleryStoreApi();
  const shares = useGallery((s) => s.shares);
  const media = useGallery((s) => s.media);

  if (shares.length === 0) {
    return (
      <EmptyState
        icon="people"
        title="Shared Albums"
        subtitle="Select photos or an album and choose Share to create a link. Your shares appear here."
      />
    );
  }
  return (
    <div className="apg-scroll" style={{ padding: 16 }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Shared Albums</div>
      <div className="apg-pinned-row">
        {shares.map((sh) => {
          const cover = media.find((m) => m.id === sh.mediaIds[0]);
          return (
            <div key={sh.id} className="apg-pinned-card" style={{ cursor: 'default' }}>
              {cover ? <img src={cover.thumbnail ?? cover.src} alt="" /> : <Icon name="people" size={28} />}
              <div className="apg-pinned-card__label">{sh.title}</div>
              <div className="apg-pinned-card__badge">{sh.mediaIds.length}</div>
              <div
                style={{
                  position: 'absolute',
                  inset: 'auto 0 0 0',
                  display: 'flex',
                  gap: 6,
                  padding: 6,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
                }}
              >
                <button
                  type="button"
                  className="apg-btn"
                  style={{ flex: 1, padding: '3px 6px', fontSize: 11 }}
                  onClick={() => void navigator.clipboard?.writeText(sh.url)}
                >
                  Copy Link
                </button>
                <button
                  type="button"
                  className="apg-btn"
                  style={{ padding: '3px 6px', fontSize: 11, color: 'var(--apg-danger)' }}
                  onClick={() => api.getState().revokeShare(sh.id)}
                >
                  Revoke
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ActivityView() {
  const shares = useGallery((s) => s.shares);
  if (shares.length === 0) {
    return (
      <EmptyState
        icon="chat"
        title="Activity"
        subtitle="Your sharing activity — links you create — will appear here."
      />
    );
  }
  return (
    <div className="apg-scroll" style={{ padding: 16, maxWidth: 640 }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Activity</div>
      {shares.map((sh) => (
        <div
          key={sh.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            marginBottom: 8,
            background: 'var(--apg-bg-elevated)',
            borderRadius: 12,
          }}
        >
          <span style={{ color: 'var(--apg-accent)' }}>
            <Icon name="share" size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              You shared “{sh.title}”
            </div>
            <div style={{ color: 'var(--apg-text-secondary)', fontSize: 12 }}>
              {sh.mediaIds.length} item{sh.mediaIds.length === 1 ? '' : 's'} ·{' '}
              {formatRelative(sh.createdAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} day(s) ago`;
}

export function DuplicatesView() {
  const api = useGalleryStoreApi();
  const media = useGallery((s) => s.media);
  const groups = findDuplicateGroups(media);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon="duplicates"
        title="No Duplicates"
        subtitle="Exact and near-duplicate items will be grouped here so you can merge them."
      />
    );
  }

  return (
    <div className="apg-scroll" style={{ padding: 16 }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
        {groups.length} Duplicate Group{groups.length === 1 ? '' : 's'}
      </div>
      {groups.map((group, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            marginBottom: 10,
            background: 'var(--apg-bg-elevated)',
            borderRadius: 12,
          }}
        >
          <div
            className="apg-grid"
            style={{
              gridTemplateColumns: `repeat(${Math.min(group.length, 4)}, 64px)`,
              gap: 4,
              padding: 0,
              flex: 1,
            }}
          >
            {group.slice(0, 4).map((m) => (
              <PhotoTile key={m.id} item={m} orderedIds={group.map((g) => g.id)} />
            ))}
          </div>
          <button
            type="button"
            className="apg-btn apg-btn--primary"
            onClick={() => api.getState().trash(group.slice(1).map((m) => m.id))}
          >
            <Icon name="duplicates" size={14} /> Keep 1, Trash {group.length - 1}
          </button>
        </div>
      ))}
    </div>
  );
}
