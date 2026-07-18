'use client';

import { useRef, useState } from 'react';

import { Icon } from '../icons';
import { isAcceptedMediaFile } from '../lib/media';
import { useGallery, useGalleryStoreApi } from '../store/context';
import type { AlbumId } from '../types';
import { closeModal, openModal } from './Modal';

/** Use the SAME allow-list the import pipeline enforces (mediaFromFile), so the
 * "N files ready" count matches what will actually be accepted — no silent skips. */
const acceptFile = (f: File) => isAcceptedMediaFile(f);

function UploadModal({ defaultAlbumId }: { defaultAlbumId?: AlbumId }) {
  const api = useGalleryStoreApi();
  const albums = useGallery((s) => s.albums.filter((a) => a.kind === 'user' || a.kind === 'folder'));
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState(0);
  const [album, setAlbum] = useState<string>(defaultAlbumId ?? '');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const all = Array.from(list);
    const ok = all.filter(acceptFile);
    setRejected((r) => r + (all.length - ok.length));
    if (ok.length) setFiles((prev) => [...prev, ...ok]);
  };

  // Open the native OS file picker. A real, explicit control triggering input.click()
  // is the most reliable cross-browser way to open the file dialog.
  const browse = () => inputRef.current?.click();

  const upload = async () => {
    if (!files.length) return;
    setBusy(true);
    try {
      await api.getState().importFiles(files, album || undefined);
      closeModal();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="apg-modal" role="dialog" aria-modal="true" aria-label="Add photos and videos" style={{ minWidth: 400 }}>
      <div className="apg-modal__title">Add Photos &amp; Videos</div>

      <button
        type="button"
        className={['apg-upload__drop', drag ? 'apg-upload__drop--over' : ''].join(' ')}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        onClick={browse}
      >
        <Icon name="download" size={28} />
        <div style={{ fontWeight: 600 }}>Drag &amp; drop here, or click to browse</div>
        <div style={{ fontSize: 12, color: 'var(--apg-text-secondary)' }}>
          Images &amp; videos only · multiple allowed
        </div>
        {files.length ? (
          <div style={{ fontSize: 13, marginTop: 6, color: 'var(--apg-accent)' }}>
            {files.length} file{files.length === 1 ? '' : 's'} ready
          </div>
        ) : null}
        {rejected ? (
          <div style={{ fontSize: 12, marginTop: 2, color: 'var(--apg-danger)' }}>
            {rejected} unsupported file{rejected === 1 ? '' : 's'} skipped
          </div>
        ) : null}
      </button>

      {/* Explicit, always-visible browse control (the dropzone click can be flaky on
          some setups; a real button reliably opens the OS file dialog). */}
      <button
        type="button"
        className="apg-btn"
        style={{ width: '100%', marginTop: 8, cursor: 'pointer' }}
        onClick={browse}
      >
        Choose files…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        // visually hidden (not the `hidden` attribute — some browsers refuse a
        // programmatic .click() on a display:none file input).
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        tabIndex={-1}
        onChange={(e) => {
          add(e.target.files);
          // Reset so choosing the SAME file again still fires onChange.
          e.target.value = '';
        }}
      />

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, fontSize: 12 }}>
        <span style={{ color: 'var(--apg-text-secondary)' }}>Add to album</span>
        <select className="apg-modal__input" value={album} onChange={(e) => setAlbum(e.target.value)}>
          <option value="">Library only</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <div className="apg-modal__actions">
        <button type="button" className="apg-btn" onClick={closeModal} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="apg-btn apg-btn--primary"
          onClick={() => void upload()}
          disabled={busy || files.length === 0}
        >
          {busy ? 'Uploading…' : `Upload${files.length ? ` ${files.length}` : ''}`}
        </button>
      </div>
    </div>
  );
}

/** Open the upload modal, defaulting the album to the currently-open one. */
export function openUploadModal(defaultAlbumId?: AlbumId) {
  openModal(<UploadModal defaultAlbumId={defaultAlbumId} />);
}
