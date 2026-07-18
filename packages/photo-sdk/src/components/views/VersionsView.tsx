'use client';

import { formatDate, formatTime } from '../../lib/format';
import { Icon } from '../../icons';
import { useGallery, useGalleryStoreApi } from '../../store/context';
import { EmptyState } from './EmptyState';

/**
 * Audit browser — every photo/video that has an edit history or comments.
 * Click an item to open it with the Info panel showing the full version
 * timeline (v1 = original, never overwritten) and comment thread.
 */
export function VersionsView() {
  const api = useGalleryStoreApi();
  const media = useGallery((s) => s.media);

  const tracked = media
    .filter((m) => !m.deletedAt && ((m.versions?.length ?? 0) > 0 || (m.comments?.length ?? 0) > 0))
    .sort((a, b) => (b.editedAt ?? b.importedAt) - (a.editedAt ?? a.importedAt));

  const open = (id: string) => {
    const s = api.getState();
    s.openLightbox(id);
    s.setInfoOpen(true);
  };

  if (tracked.length === 0) {
    return (
      <EmptyState
        icon="clock"
        title="No Version History Yet"
        subtitle="Edit a photo or video (the original is always kept as version 1) or add a comment, and it will appear here with its full audit log."
      />
    );
  }

  return (
    <div className="apg-scroll" style={{ padding: 16, maxWidth: 760 }}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Versions &amp; Audit Log</div>
      <div style={{ color: 'var(--apg-text-secondary)', fontSize: 13, marginBottom: 14 }}>
        {tracked.length} item{tracked.length === 1 ? '' : 's'} with edit history or comments. Originals are
        never overwritten.
      </div>

      <div className="apg-audit-list">
        {tracked.map((m) => {
          const versions = m.versions ?? [];
          const latest = versions[versions.length - 1];
          const comments = m.comments?.length ?? 0;
          return (
            <button key={m.id} type="button" className="apg-audit-card" onClick={() => open(m.id)}>
              <span className="apg-audit-card__thumb-wrap">
                <img className="apg-audit-card__thumb" src={m.thumbnail ?? m.src} alt="" />
                {m.kind === 'video' ? (
                  <span className="apg-audit-card__play">
                    <Icon name="play" size={14} />
                  </span>
                ) : null}
              </span>
              <span className="apg-audit-card__body">
                <span className="apg-audit-card__name">{m.name}</span>
                <span className="apg-audit-card__tags">
                  <span className="apg-audit-card__tag">
                    <Icon name="clock" size={12} />
                    {versions.length || 1} version{(versions.length || 1) === 1 ? '' : 's'}
                  </span>
                  {comments > 0 ? (
                    <span className="apg-audit-card__tag">
                      <Icon name="chat" size={12} />
                      {comments} comment{comments === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </span>
                {latest ? (
                  <span className="apg-audit-card__latest">
                    Latest: {latest.changes.join(', ')} · {formatDate(latest.createdAt)}{' '}
                    {formatTime(latest.createdAt)}
                  </span>
                ) : null}
              </span>
              <Icon name="chevron-right" size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
