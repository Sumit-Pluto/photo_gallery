'use client';

import { useState } from 'react';

import { downloadMedia } from '../lib/download';
import { Icon } from '../icons';
import { useGallery, useGalleryStoreApi } from '../store/context';
import type { AlbumId, MediaId, ShareRecord, ViewId } from '../types';
import { closeModal, openModal } from './Modal';

/* ----------------------------- Rename / name prompt ----------------------------- */

function NamePrompt({
  title,
  initial,
  confirmLabel,
  placeholder,
  onConfirm,
}: {
  title: string;
  initial: string;
  confirmLabel: string;
  placeholder?: string;
  onConfirm: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
    closeModal();
  };
  return (
    <div className="apg-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="apg-modal__title">{title}</div>
      <input
        className="apg-modal__input"
        autoFocus
        value={value}
        maxLength={120}
        placeholder={placeholder ?? 'Album name'}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <div className="apg-modal__actions">
        <button type="button" className="apg-btn" onClick={closeModal}>
          Cancel
        </button>
        <button type="button" className="apg-btn apg-btn--primary" onClick={submit}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function promptAlbumName(
  title: string,
  initial: string,
  onConfirm: (name: string) => void,
  opts?: { placeholder?: string; confirmLabel?: string },
) {
  const confirmLabel =
    opts?.confirmLabel ?? (title.toLowerCase().includes('rename') ? 'Rename' : 'Create');
  openModal(
    <NamePrompt
      title={title}
      initial={initial}
      confirmLabel={confirmLabel}
      placeholder={opts?.placeholder}
      onConfirm={onConfirm}
    />,
  );
}

/* ----------------------------- Album picker ----------------------------- */

function AlbumPickerModal({
  ids,
  mode = 'copy',
  fromAlbumId,
}: {
  ids: MediaId[];
  mode?: 'copy' | 'move';
  fromAlbumId?: string;
}) {
  const api = useGalleryStoreApi();
  const albums = useGallery((s) =>
    s.albums.filter((a) => (a.kind === 'user' || a.kind === 'folder') && a.id !== fromAlbumId),
  );
  const moving = mode === 'move' && !!fromAlbumId;

  const place = (albumId: string) => {
    if (moving) api.getState().moveToAlbum(fromAlbumId!, albumId, ids);
    else api.getState().addToAlbum(albumId, ids);
    closeModal();
  };

  const createAndPlace = () => {
    closeModal();
    promptAlbumName('New Album', '', (name) => {
      const id = api.getState().createAlbum(name);
      if (moving) api.getState().moveToAlbum(fromAlbumId!, id, ids);
      else api.getState().addToAlbum(id, ids);
      api.getState().setView(`album:${id}` as ViewId);
    });
  };

  return (
    <div className="apg-modal" role="dialog" aria-modal="true" aria-label={moving ? 'Move to album' : 'Add to album'}>
      <div className="apg-modal__title">
        {moving ? 'Move' : 'Add'} {ids.length} item{ids.length === 1 ? '' : 's'} to…
      </div>
      <div className="apg-modal__list">
        <button type="button" className="apg-modal__list-item" onClick={createAndPlace}>
          ＋ New Album…
        </button>
        {albums.map((a) => (
          <button key={a.id} type="button" className="apg-modal__list-item" onClick={() => place(a.id)}>
            {a.name}
          </button>
        ))}
        {albums.length === 0 ? (
          <div className="apg-empty-card__text" style={{ padding: '8px 10px' }}>
            No albums yet — create one above.
          </div>
        ) : null}
      </div>
      <div className="apg-modal__actions">
        <button type="button" className="apg-btn" onClick={closeModal}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function addToAlbumPicker(ids: MediaId[]) {
  if (!ids.length) return;
  openModal(<AlbumPickerModal ids={ids} />);
}

/** Move items out of `fromAlbumId` into a chosen album. */
export function moveToAlbumPicker(fromAlbumId: string, ids: MediaId[]) {
  if (!ids.length) return;
  openModal(<AlbumPickerModal ids={ids} mode="move" fromAlbumId={fromAlbumId} />);
}

/* ----------------------------- Confirm dialog ----------------------------- */

export function confirmAction(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  openModal(
    <div className="apg-modal" role="alertdialog" aria-modal="true" aria-label={opts.title}>
      <div className="apg-modal__title">{opts.title}</div>
      <div className="apg-empty-card__text">{opts.message}</div>
      <div className="apg-modal__actions">
        <button type="button" className="apg-btn" onClick={closeModal}>
          Cancel
        </button>
        <button
          type="button"
          className={['apg-btn', opts.danger ? '' : 'apg-btn--primary'].join(' ')}
          style={opts.danger ? { background: 'var(--apg-danger)', color: '#fff' } : undefined}
          onClick={() => {
            closeModal();
            opts.onConfirm();
          }}
        >
          {opts.confirmLabel ?? 'Confirm'}
        </button>
      </div>
    </div>,
  );
}

/* ----------------------------- Security (lock) settings ----------------------------- */

function SecuritySettingsModal() {
  const api = useGalleryStoreApi();
  const hasPw = useGallery((s) => s.lock.hash !== null);
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (p1.trim().length < 4) return setErr('Use at least 4 characters.');
    if (p1 !== p2) return setErr('Passwords do not match.');
    await api.getState().setLockPassword(p1.trim());
    closeModal();
  };
  const remove = () => {
    api.getState().removeLockPassword();
    closeModal();
  };

  return (
    <div className="apg-modal" role="dialog" aria-modal="true" aria-label="Recently Deleted lock">
      <div className="apg-modal__title">
        {hasPw ? 'Recently Deleted is Locked' : 'Lock Recently Deleted'}
      </div>
      <div className="apg-empty-card__text" style={{ marginBottom: 4 }}>
        {hasPw
          ? 'Set a new password, or remove the lock. The password is stored only on this device.'
          : 'Protect Recently Deleted with a password. It is stored only on this device (not uploaded).'}
      </div>
      <input
        className="apg-modal__input"
        type="password"
        autoFocus
        placeholder={hasPw ? 'New password' : 'Password'}
        value={p1}
        onChange={(e) => {
          setP1(e.target.value);
          setErr(null);
        }}
      />
      <input
        className="apg-modal__input"
        type="password"
        placeholder="Confirm password"
        value={p2}
        onChange={(e) => {
          setP2(e.target.value);
          setErr(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
        }}
      />
      {err ? <div style={{ color: 'var(--apg-danger)', fontSize: 13 }}>{err}</div> : null}
      <div className="apg-modal__actions">
        {hasPw ? (
          <button
            type="button"
            className="apg-btn"
            style={{ marginRight: 'auto', color: 'var(--apg-danger)' }}
            onClick={remove}
          >
            Remove Lock
          </button>
        ) : null}
        <button type="button" className="apg-btn" onClick={closeModal}>
          Cancel
        </button>
        <button type="button" className="apg-btn apg-btn--primary" onClick={() => void save()}>
          {hasPw ? 'Change' : 'Set Password'}
        </button>
      </div>
    </div>
  );
}

export function openSecuritySettings() {
  openModal(<SecuritySettingsModal />);
}

/* ----------------------------- Share ----------------------------- */

function ShareModal({ selectionIds, albumId }: { selectionIds: MediaId[]; albumId?: AlbumId }) {
  const api = useGalleryStoreApi();
  const albums = useGallery((s) => s.albums.filter((a) => a.kind === 'user' || a.kind === 'folder'));
  const media = useGallery((s) => s.media);
  const [picked, setPicked] = useState<Set<AlbumId>>(new Set(albumId ? [albumId] : []));
  const [created, setCreated] = useState<ShareRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const albumMediaIds = (id: AlbumId) =>
    media.filter((m) => !m.deletedAt && m.albumIds.includes(id)).map((m) => m.id);

  const finish = (share: ShareRecord) => {
    setCreated(share);
    void navigator.clipboard
      ?.writeText(share.url)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  const sharePhotos = () => {
    finish(api.getState().createShare(selectionIds.length === 1 ? 'photo' : 'photos', selectionIds));
  };
  const shareAlbums = () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    const union = [...new Set(ids.flatMap(albumMediaIds))];
    finish(api.getState().createShare('album', union, ids.length === 1 ? ids[0] : undefined));
  };
  const togglePick = (id: AlbumId) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const download = () => {
    const ids = created?.mediaIds ?? [];
    for (const id of ids) {
      const m = media.find((x) => x.id === id);
      if (m) downloadMedia(m);
    }
  };

  if (created) {
    return (
      <div className="apg-modal" role="dialog" aria-modal="true" aria-label="Share link">
        <div className="apg-modal__title">Link Ready</div>
        <div className="apg-empty-card__text">
          “{created.title}” — anyone with this link can view {created.mediaIds.length} item
          {created.mediaIds.length === 1 ? '' : 's'}.
        </div>
        <input className="apg-modal__input" readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} />
        <div className="apg-modal__actions">
          <button type="button" className="apg-btn" onClick={download}>
            <Icon name="download" size={14} /> Download
          </button>
          <button
            type="button"
            className="apg-btn apg-btn--primary"
            onClick={() => {
              void navigator.clipboard?.writeText(created.url).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied ✓' : 'Copy Link'}
          </button>
          <button type="button" className="apg-btn" onClick={closeModal}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="apg-modal" role="dialog" aria-modal="true" aria-label="Share">
      <div className="apg-modal__title">Share</div>
      {selectionIds.length > 0 ? (
        <button type="button" className="apg-modal__list-item" onClick={sharePhotos}>
          <Icon name="image" size={15} />{' '}
          {selectionIds.length === 1 ? 'This photo' : `${selectionIds.length} selected photos`}
        </button>
      ) : null}
      <div className="apg-empty-card__text" style={{ margin: '10px 2px 4px' }}>
        Or share album{albums.length === 1 ? '' : 's'} (tick one or more):
      </div>
      <div className="apg-modal__list" style={{ maxHeight: 200 }}>
        {albums.map((a) => (
          <button
            key={a.id}
            type="button"
            className="apg-modal__list-item"
            onClick={() => togglePick(a.id)}
            style={picked.has(a.id) ? { background: 'var(--apg-accent)', color: 'var(--apg-accent-contrast)' } : undefined}
          >
            <Icon name={picked.has(a.id) ? 'check' : 'collections'} size={15} /> {a.name}
          </button>
        ))}
        {albums.length === 0 ? (
          <div className="apg-empty-card__text" style={{ padding: '8px 10px' }}>No albums yet.</div>
        ) : null}
      </div>
      <div className="apg-modal__actions">
        <button type="button" className="apg-btn" onClick={closeModal}>
          Cancel
        </button>
        <button
          type="button"
          className="apg-btn apg-btn--primary"
          disabled={picked.size === 0}
          onClick={shareAlbums}
        >
          Share {picked.size > 0 ? `${picked.size} album${picked.size === 1 ? '' : 's'}` : 'Album'}
        </button>
      </div>
    </div>
  );
}

/** Open the Share modal. Pass selected media ids and/or the current album id. */
export function openShareModal(selectionIds: MediaId[] = [], albumId?: AlbumId) {
  openModal(<ShareModal selectionIds={selectionIds} albumId={albumId} />);
}
