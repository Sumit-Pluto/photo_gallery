'use client';

import { Icon } from '../../icons';
import { useGallery, useGalleryStoreApi } from '../../store/context';
import { promptAlbumName } from '../modals';

export function PeopleView() {
  const api = useGalleryStoreApi();
  const people = useGallery((s) => s.people);
  const media = useGallery((s) => s.media);

  if (people.length === 0) {
    return (
      <div className="apg-empty">
        <div className="apg-empty__card">
          <span style={{ color: 'var(--apg-text-tertiary)' }}>
            <Icon name="person-circle" size={44} />
          </span>
          <div className="apg-empty__title" style={{ fontSize: 24 }}>
            Finding People…
          </div>
          <div className="apg-empty__subtitle">
            Photos creates albums and groups of people and pets found in your library when you are
            not using the app.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="apg-scroll">
      <div
        className="apg-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 18, padding: 18 }}
      >
        {people.map((p) => {
          const cover = media.find((m) => m.id === (p.coverId ?? p.mediaIds[0]));
          const rename = () =>
            promptAlbumName(
              p.name ? `Rename ${p.isPet ? 'pet' : 'person'}` : `Name this ${p.isPet ? 'pet' : 'person'}`,
              p.name ?? '',
              (name) => api.getState().renamePerson(p.id, name),
              { placeholder: p.isPet ? 'Pet name' : 'Name', confirmLabel: 'Save' },
            );
          return (
            <div
              key={p.id}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <button
                type="button"
                aria-label={`View photos of ${p.name ?? 'this ' + (p.isPet ? 'pet' : 'person')}`}
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'var(--apg-bg-elevated)',
                  display: 'grid',
                  placeItems: 'center',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
                onClick={() => api.getState().setPersonFocus(p.id)}
              >
                {cover ? (
                  <img
                    src={cover.thumbnail ?? cover.src}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Icon name={p.isPet ? 'tag' : 'person-circle'} size={40} />
                )}
              </button>
              <button
                type="button"
                onClick={rename}
                title="Click to name"
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  color: p.name ? 'var(--apg-text)' : 'var(--apg-accent)',
                }}
              >
                {p.name ?? (p.isPet ? '+ Name pet' : '+ Add Name')}
              </button>
              <span style={{ fontSize: 11, color: 'var(--apg-text-tertiary)' }}>
                {p.mediaIds.length} {p.mediaIds.length === 1 ? 'photo' : 'photos'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
