'use client';

import { useState } from 'react';

import { TRASH_RETENTION_MS } from '../../constants';
import { daysUntilPermanentDelete } from '../../lib/format';
import { Icon } from '../../icons';
import { useViewMedia } from '../../hooks/useViewMedia';
import { useGallery, useGalleryStoreApi } from '../../store/context';
import { MediaGrid } from '../MediaGrid';
import { openSecuritySettings } from '../modals';

export function RecentlyDeletedView() {
  const api = useGalleryStoreApi();
  const items = useViewMedia();
  const lockHash = useGallery((s) => s.lock.hash);
  const lockUnlocked = useGallery((s) => s.lockUnlocked);
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);

  // Locked: a password is set and the user hasn't unlocked this session.
  if (lockHash && !lockUnlocked) {
    const submit = async () => {
      const ok = await api.getState().unlockLock(pw);
      if (!ok) setError(true);
      setPw('');
    };
    return (
      <div className="apg-empty">
        <span style={{ color: 'var(--apg-text-tertiary)' }}>
          <Icon name="lock" size={56} />
        </span>
        <div className="apg-empty__title" style={{ fontSize: 21 }}>
          Enter Your Password to View Recently Deleted
        </div>
        <input
          className="apg-modal__input"
          type="password"
          autoFocus
          value={pw}
          placeholder="Password"
          style={{ maxWidth: 280 }}
          onChange={(e) => {
            setPw(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        {error ? (
          <div style={{ color: 'var(--apg-danger)', fontSize: 13 }}>Incorrect password.</div>
        ) : null}
        <button type="button" className="apg-btn apg-btn--primary" onClick={() => void submit()}>
          Unlock
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="apg-empty">
        <div className="apg-empty__card">
          <span style={{ color: 'var(--apg-text-tertiary)' }}>
            <Icon name="trash" size={40} />
          </span>
          <div className="apg-empty__title" style={{ fontSize: 22 }}>
            No Recently Deleted Items
          </div>
          <div className="apg-empty__subtitle">
            Deleted items are kept here for {Math.round(TRASH_RETENTION_MS / 86400000)} days.
          </div>
        </div>
      </div>
    );
  }

  // Soonest expiry = the smallest remaining days across all trashed items
  // (independent of display order, which is sorted by capture date).
  const nextExpiry = items.reduce((min, m) => {
    if (!m.deletedAt) return min;
    return Math.min(min, daysUntilPermanentDelete(m.deletedAt, TRASH_RETENTION_MS));
  }, Infinity);
  const expiryDays = Number.isFinite(nextExpiry) ? nextExpiry : 0;

  return (
    <div className="apg-scroll">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 14px 0',
          color: 'var(--apg-text-secondary)',
          fontSize: 13,
        }}
      >
        <span>
          Items are deleted permanently after 30 days. Oldest expires in ~{expiryDays} day
          {expiryDays === 1 ? '' : 's'}.
        </span>
        <button
          type="button"
          className="apg-btn"
          style={{ flexShrink: 0, padding: '4px 10px' }}
          onClick={openSecuritySettings}
        >
          <Icon name={lockHash ? 'lock' : 'unlock'} size={13} />
          {lockHash ? 'Locked' : 'Lock…'}
        </button>
      </div>
      <MediaGrid items={items} />
    </div>
  );
}
