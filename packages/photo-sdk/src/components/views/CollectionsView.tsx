'use client';

import { useState } from 'react';

import { formatDay } from '../../lib/format';
import { groupByTime } from '../../lib/grouping';
import { resolveLabel } from '../../lib/smartAlbums';
import { Icon, type IconName } from '../../icons';
import { useGallery, useGalleryStoreApi } from '../../store/context';
import { albumMedia, liveMedia, objectLabelCounts } from '../../store/selectors';
import type { MediaItem, ViewId } from '../../types';
import { openContextMenu } from '../ContextMenu';
import { promptAlbumName } from '../modals';

function SectionHeader({
  title,
  chevronTo,
  action,
}: {
  title: string;
  chevronTo?: () => void;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="apg-collections__header">
      <div
        className="apg-collections__title"
        onClick={chevronTo}
        role={chevronTo ? 'button' : undefined}
        tabIndex={chevronTo ? 0 : undefined}
        onKeyDown={
          chevronTo
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  chevronTo();
                }
              }
            : undefined
        }
      >
        {title}
        {chevronTo ? <Icon name="chevron-right" size={18} /> : null}
      </div>
      {action ? (
        <button type="button" className="apg-collections__action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function PinnedCard({
  label,
  cover,
  badge,
  onClick,
}: {
  label: string;
  cover?: MediaItem;
  badge?: IconName;
  onClick: () => void;
}) {
  return (
    <button type="button" className="apg-pinned-card" onClick={onClick} aria-label={label}>
      {cover ? <img src={cover.thumbnail ?? cover.src} alt="" draggable={false} /> : null}
      {badge ? (
        <span className="apg-pinned-card__badge">
          <Icon name={badge} size={16} />
        </span>
      ) : null}
      <span className="apg-pinned-card__label">{label}</span>
    </button>
  );
}

function EmptyCard({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text: string;
}) {
  return (
    <div className="apg-empty-card">
      <span className="apg-empty-card__icon">
        <Icon name={icon} size={30} />
      </span>
      <div className="apg-empty-card__title">{title}</div>
      <div className="apg-empty-card__text">{text}</div>
    </div>
  );
}

export function CollectionsView() {
  const api = useGalleryStoreApi();
  const media = useGallery((s) => s.media);
  const albums = useGallery((s) => s.albums);
  const labelAliases = useGallery((s) => s.labelAliases);
  const live = liveMedia(media);

  const first = (pred: (m: MediaItem) => boolean) => live.find(pred);
  const userAlbums = albums.filter((a) => a.kind === 'user' || a.kind === 'folder');
  const go = (v: ViewId) => () => api.getState().setView(v);

  const recentDays = groupByTime(live, 'day').slice(0, 8);
  const featured = [...live].sort((a, b) => b.takenAt - a.takenAt).slice(0, 12);
  const objectEntries = [...objectLabelCounts(media, labelAliases).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14);

  // Right-click an object card → permanently rename its tag (car → excavator).
  const renameTag = (label: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      {
        label: 'Rename Tag',
        icon: 'tag',
        onClick: () =>
          promptAlbumName('Rename Tag', label, (name) => api.getState().renameLabel(label, name), {
            placeholder: 'Tag name',
          }),
      },
    ]);
  };

  return (
    <div className="apg-scroll">
      <div className="apg-collections">
        {/* Memories */}
        <section className="apg-collections__section">
          <SectionHeader title="Memories" />
          <EmptyCard
            icon="clock"
            title="No Memories Available"
            text="Memories will appear here when more photos and videos are added to the library."
          />
        </section>

        {/* Pinned */}
        <section className="apg-collections__section">
          <SectionHeader title="Pinned" chevronTo={go('collections')} />
          <div className="apg-pinned-row">
            <PinnedCard label="Favourites" badge="heart-fill" cover={first((m) => m.favorite)} onClick={go('favourites')} />
            <PinnedCard label="Recently Saved" cover={first((m) => m.source === 'download' || m.source === 'social')} onClick={go('recently-saved')} />
            <PinnedCard label="Map" cover={first((m) => Boolean(m.location))} onClick={go('map')} />
            <PinnedCard label="Videos" cover={first((m) => m.kind === 'video')} onClick={go('videos')} />
            <PinnedCard label="Screenshots" cover={first((m) => m.source === 'screenshot')} onClick={go('screenshots')} />
            <PinnedCard label="Documents" badge="document" cover={first((m) => Boolean(m.ocrText && m.ocrText.trim()))} onClick={go('sys:documents')} />
            <PinnedCard label="People & Pets" onClick={go('people')} />
            <PinnedCard label="Recently Deleted" badge="trash" onClick={go('recently-deleted')} />
          </div>
        </section>

        {/* Albums */}
        <section className="apg-collections__section">
          <SectionHeader
            title="Albums"
            action={{
              label: 'Create',
              onClick: () =>
                promptAlbumName('New Album', '', (name) => {
                  const id = api.getState().createAlbum(name);
                  api.getState().setView(`album:${id}` as ViewId);
                }),
            }}
          />
          {userAlbums.length === 0 ? (
            <EmptyCard
              icon="collections"
              title="No Albums Available"
              text="Albums will appear here when they are added to the library or synced."
            />
          ) : (
            <div className="apg-pinned-row">
              {userAlbums.map((a) => {
                const am = albumMedia(a, media);
                return (
                  <PinnedCard
                    key={a.id}
                    label={a.name}
                    cover={am.find((m) => m.id === a.coverId) ?? am[0]}
                    onClick={go(a.id as ViewId)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Objects (AI) — auto categories from on-device object detection */}
        {objectEntries.length > 0 ? (
          <section className="apg-collections__section">
            <SectionHeader title="Objects" />
            <div className="apg-pinned-row">
              {objectEntries.map(([label, count]) => (
                <button
                  key={label}
                  type="button"
                  className="apg-pinned-card"
                  onClick={() => api.getState().setView(`sys:obj:${label}` as ViewId)}
                  onContextMenu={renameTag(label)}
                  aria-label={`${count} photos containing ${label}`}
                >
                  {(() => {
                    // Match on the resolved label so the cover works for items still
                    // stored under the original detector label.
                    const cover = live.find((m) =>
                      m.objectLabels.some((l) => resolveLabel(l, labelAliases) === label),
                    );
                    return cover ? <img src={cover.thumbnail ?? cover.src} alt="" draggable={false} /> : null;
                  })()}
                  <span className="apg-pinned-card__label" style={{ textTransform: 'capitalize' }}>
                    {label}
                    <span style={{ opacity: 0.8, fontWeight: 500 }}> · {count}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* People & Pets */}
        <section className="apg-collections__section">
          <SectionHeader title="People & Pets" chevronTo={go('people')} />
          <EmptyCard
            icon="person-circle"
            title="Finding People…"
            text="Photos creates albums and groups of people and pets found in your library."
          />
        </section>

        {/* Featured Photos */}
        <section className="apg-collections__section">
          <SectionHeader title="Featured Photos" />
          {featured.length === 0 ? (
            <EmptyCard
              icon="image"
              title="No Featured Photos Available"
              text="Featured Photos will appear here when more photos and videos are added."
            />
          ) : (
            <div className="apg-pinned-row">
              {featured.map((m) => (
                <PinnedCard key={m.id} label="" cover={m} onClick={() => api.getState().openLightbox(m.id)} />
              ))}
            </div>
          )}
        </section>

        {/* Shared Albums */}
        <section className="apg-collections__section">
          <SectionHeader title="Shared Albums" action={{ label: 'Start Sharing', onClick: () => api.getState().setView('shared-albums') }} />
          <EmptyCard
            icon="people"
            title="Shared Albums"
            text="Share photos and videos with just the people you choose, and let them add photos, videos and comments."
          />
        </section>

        {/* Recent Days */}
        <section className="apg-collections__section">
          <SectionHeader title="Recent Days" />
          {recentDays.length === 0 ? (
            <EmptyCard
              icon="clock"
              title="No Days Available"
              text="Days will appear here when more photos and videos are added to the library."
            />
          ) : (
            <div className="apg-pinned-row">
              {recentDays.map((d) => (
                <PinnedCard
                  key={d.key}
                  label={formatDay(d.items[0]!.takenAt)}
                  cover={d.items[0]}
                  onClick={() => api.getState().openLightbox(d.items[0]!.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Trips */}
        <section className="apg-collections__section">
          <SectionHeader title="Trips" />
          <EmptyCard
            icon="suitcase"
            title="No Trips Available"
            text="Trips will appear here when more photos and videos are added to the library."
          />
        </section>

        {/* Utilities */}
        <section className="apg-collections__section">
          <SectionHeader title="Utilities" chevronTo={go('recently-deleted')} />
          <button type="button" className="apg-list-row" onClick={go('recently-deleted')} style={{ width: '100%', border: 'none', cursor: 'default' }}>
            <Icon name="trash" size={18} />
            Recently Deleted
            <span className="apg-list-row__trail">
              <Icon name="lock" size={15} />
            </span>
          </button>
          <button type="button" className="apg-list-row" onClick={go('duplicates')} style={{ width: '100%', border: 'none', cursor: 'default' }}>
            <Icon name="duplicates" size={18} />
            Duplicates
            <span className="apg-list-row__trail">{live.length ? 0 : 0}</span>
          </button>
          <button type="button" className="apg-list-row" onClick={go('map')} style={{ width: '100%', border: 'none', cursor: 'default' }}>
            <Icon name="map" size={18} />
            Map
          </button>
        </section>
      </div>
    </div>
  );
}
