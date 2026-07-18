'use client';

import { groupByTime } from '../../lib/grouping';
import { Icon } from '../../icons';
import { useGallery, useGalleryStoreApi } from '../../store/context';
import { albumMedia, liveMedia } from '../../store/selectors';
import type { ViewId } from '../../types';
import { promptAlbumName } from '../modals';
import { EmptyState } from './EmptyState';

/**
 * "All Albums" overview — a meaningful web-gallery view (replaces macOS's
 * iOS-only "Projects / App Store" screen). Shows every album as a cover card,
 * plus auto "Recent Days" groupings, and a Create action.
 */
export function AlbumsOverview() {
  const api = useGalleryStoreApi();
  const albums = useGallery((s) => s.albums);
  const media = useGallery((s) => s.media);
  const userAlbums = albums.filter((a) => a.kind === 'user' || a.kind === 'folder');
  const live = liveMedia(media);
  const recentDays = groupByTime(live, 'day').slice(0, 12);

  const create = () =>
    promptAlbumName('New Album', '', (name) => {
      const id = api.getState().createAlbum(name);
      api.getState().setView(`album:${id}` as ViewId);
    });

  if (userAlbums.length === 0 && live.length === 0) {
    return (
      <EmptyState
        icon="collections"
        title="No Albums Yet"
        subtitle="Create an album to organize your photos, or import some to get started."
        action={{ label: 'Create Album', onClick: create }}
      />
    );
  }

  return (
    <div className="apg-scroll">
      <div className="apg-collections">
        <section className="apg-collections__section">
          <div className="apg-collections__header">
            <div className="apg-collections__title">My Albums</div>
            <button type="button" className="apg-collections__action" onClick={create}>
              Create
            </button>
          </div>
          {userAlbums.length === 0 ? (
            <div className="apg-empty-card">
              <span className="apg-empty-card__icon">
                <Icon name="collections" size={28} />
              </span>
              <div className="apg-empty-card__title">No albums yet</div>
              <div className="apg-empty-card__text">Click Create to make your first album.</div>
            </div>
          ) : (
            <div className="apg-pinned-row">
              {userAlbums.map((a) => {
                const am = albumMedia(a, media);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="apg-pinned-card"
                    onClick={() => api.getState().setView(a.id as ViewId)}
                    aria-label={a.name}
                  >
                    {(am.find((m) => m.id === a.coverId) ?? am[0]) ? (
                      <img
                        src={(am.find((m) => m.id === a.coverId) ?? am[0])!.thumbnail ?? (am.find((m) => m.id === a.coverId) ?? am[0])!.src}
                        alt=""
                        draggable={false}
                      />
                    ) : null}
                    <span className="apg-pinned-card__label">
                      {a.name}
                      <span style={{ opacity: 0.8, fontWeight: 500 }}> · {am.length}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {recentDays.length > 0 ? (
          <section className="apg-collections__section">
            <div className="apg-collections__header">
              <div className="apg-collections__title">Recent Days</div>
            </div>
            <div className="apg-pinned-row">
              {recentDays.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className="apg-pinned-card"
                  onClick={() => api.getState().openLightbox(d.items[0]!.id)}
                  aria-label={d.title}
                >
                  <img src={d.items[0]!.thumbnail ?? d.items[0]!.src} alt="" draggable={false} />
                  <span className="apg-pinned-card__label">{d.title}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
