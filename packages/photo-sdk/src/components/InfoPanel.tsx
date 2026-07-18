'use client';

import { useEffect, useRef, useState } from 'react';

import { sourceLabel } from '../lib/classify';
import { editFilterCss, editTransformCss } from '../lib/edits';
import { formatBytes, formatDate, formatDuration, formatTime } from '../lib/format';
import { blobToWavBase64, startRecording, wavBase64ToBlob, type Recorder } from '../lib/audioCapture';
import { Icon } from '../icons';
import { useAIProvider } from './aiContext';
import { useGallery, useGalleryStoreApi } from '../store/context';
import type { MediaItem } from '../types';

export function InfoPanel() {
  const api = useGalleryStoreApi();
  const open = useGallery((s) => s.infoOpen);
  const media = useGallery((s) => s.media);
  const lightboxId = useGallery((s) => s.lightboxId);
  const selection = useGallery((s) => s.selection);

  if (!open) return null;

  // Target: the lightbox item, else the single selected item.
  const targetId = lightboxId ?? (selection.size === 1 ? [...selection][0] : undefined);
  const item = targetId ? (media.find((m) => m.id === targetId) ?? null) : null;

  const ext = item?.name.includes('.') ? item.name.split('.').pop()!.toUpperCase() : '—';
  const mp = item ? ((item.width * item.height) / 1_000_000).toFixed(1) : '0';

  return (
    <aside className="apg-info" aria-label="Info">
      <div className="apg-info__head">
        <span style={{ fontWeight: 700, fontSize: 15 }}>Info</span>
        <button
          type="button"
          className="apg-iconbtn"
          aria-label="Close info"
          onClick={() => api.getState().setInfoOpen(false)}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {!item ? (
        <div className="apg-info__empty">Select a single photo to see its details.</div>
      ) : (
        <div className="apg-info__body">
          <img className="apg-info__thumb" src={item.thumbnail ?? item.src} alt={item.name} />
          <div className="apg-info__name">{item.name}</div>
          <div className="apg-info__sub">
            {formatDate(item.takenAt)} · {formatTime(item.takenAt)}
          </div>

          <Row label="Kind" value={item.kind === 'video' ? 'Video' : 'Photo'} />
          <Row label="Source" value={sourceLabel(item.source)} />
          <Row label="Format" value={`${item.mime} (${ext})`} />
          <Row label="Dimensions" value={`${item.width} × ${item.height} · ${mp} MP`} />
          <Row label="Size" value={formatBytes(item.bytes)} />
          {item.duration ? <Row label="Duration" value={formatDuration(item.duration)} /> : null}
          {item.exif?.Make || item.exif?.Model ? (
            <Row label="Camera" value={`${item.exif.Make ?? ''} ${item.exif.Model ?? ''}`.trim()} />
          ) : null}
          {item.exif?.FNumber ? (
            <Row
              label="Exposure"
              value={[
                item.exif.FNumber ? `ƒ${item.exif.FNumber}` : '',
                item.exif.ISO ? `ISO ${item.exif.ISO}` : '',
                item.exif.FocalLength ? `${item.exif.FocalLength}mm` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ) : null}
          {item.exif?.LensModel ? <Row label="Lens" value={String(item.exif.LensModel)} /> : null}
          {item.exif?.Orientation ? (
            <Row label="Orientation" value={orientationLabel(item.exif.Orientation)} />
          ) : null}

          {item.objectLabels.length ? (
            <Chips
              label="Objects"
              items={item.objectLabels}
              onClick={(o) => {
                const s = api.getState();
                s.setObjectFocus(o);
                s.closeLightbox();
                s.setInfoOpen(false);
              }}
            />
          ) : null}
          {item.tags.length ? (
            <Chips
              label="Tags"
              items={item.tags}
              onClick={(t) => {
                const s = api.getState();
                s.setTagFocus(t);
                s.closeLightbox();
                s.setInfoOpen(false);
              }}
            />
          ) : null}

          {item.location ? (
            <>
              <Row
                label="Location"
                value={
                  item.location.place ??
                  `${item.location.lat.toFixed(4)}, ${item.location.lng.toFixed(4)}`
                }
              />
              <div className="apg-info__coords">
                {item.location.lat.toFixed(5)}, {item.location.lng.toFixed(5)}
              </div>
              <MiniMap
                lat={item.location.lat}
                lng={item.location.lng}
                onOpen={() => api.getState().focusMap({ lat: item.location!.lat, lng: item.location!.lng })}
              />
              <AddressLookup
                lat={item.location.lat}
                lng={item.location.lng}
                onOpenMap={() => api.getState().focusMap({ lat: item.location!.lat, lng: item.location!.lng })}
              />
              <div style={{ fontSize: 11, color: 'var(--apg-text-tertiary)', marginTop: 4 }}>
                Click the map or address to open it in full.
              </div>
            </>
          ) : null}

          <Versions item={item} />
          <Comments item={item} />
        </div>
      )}
    </aside>
  );
}

/** Version history + audit log for a photo/video (v1 = original). */
function Versions({ item }: { item: MediaItem }) {
  const api = useGalleryStoreApi();
  const [openId, setOpenId] = useState<string | null>(null);
  const versions = item.versions ?? [];
  // Newest first; the last entry is the current one.
  const ordered = [...versions].reverse();
  const currentId = versions.length ? versions[versions.length - 1]!.id : null;

  return (
    <div className="apg-info__section">
      <div className="apg-info__section-head">
        <Icon name="clock" size={15} />
        <span>Version history</span>
        <span className="apg-info__count">{versions.length || 1}</span>
      </div>
      {versions.length === 0 ? (
        <div className="apg-info__hint">
          Only the original exists. Edits create new versions — the original is never overwritten.
        </div>
      ) : (
        <ol className="apg-versions">
          {ordered.map((v) => {
            const isOpen = openId === v.id;
            const isCurrent = v.id === currentId;
            const isOriginal = v.version === 1;
            return (
              <li key={v.id} className="apg-version">
                <button
                  type="button"
                  className={`apg-version__row${isCurrent ? ' is-current' : ''}`}
                  onClick={() => setOpenId(isOpen ? null : v.id)}
                  aria-expanded={isOpen}
                >
                  <span className="apg-version__thumb-wrap">
                    <img
                      className="apg-version__thumb"
                      src={v.thumbnail ?? v.src ?? item.thumbnail ?? item.src}
                      alt=""
                      style={{
                        filter: editFilterCss(v.edits) || undefined,
                        transform: editTransformCss(v.edits) || undefined,
                      }}
                    />
                  </span>
                  <span className="apg-version__meta">
                    <span className="apg-version__title">
                      {isOriginal ? 'Original' : `Version ${v.version}`}
                      {isCurrent ? <span className="apg-version__badge">Current</span> : null}
                    </span>
                    <span className="apg-version__time">
                      {formatDate(v.createdAt)} · {formatTime(v.createdAt)}
                    </span>
                  </span>
                  <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={14} />
                </button>
                {isOpen ? (
                  <div className="apg-version__detail">
                    <div className="apg-version__changes-label">What changed</div>
                    <ul className="apg-version__changes">
                      {v.changes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                    {!isCurrent ? (
                      <button
                        type="button"
                        className="apg-btn apg-btn--small"
                        onClick={() => api.getState().restoreVersion(item.id, v.id)}
                      >
                        Restore this version
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Threaded comments on a photo/video. */
function Comments({ item }: { item: MediaItem }) {
  const api = useGalleryStoreApi();
  const comments = item.comments ?? [];
  const [text, setText] = useState('');
  const [author, setAuthor] = useState(() => {
    if (typeof window === 'undefined') return 'You';
    return window.localStorage.getItem('apg:comment-author') || 'You';
  });

  const provider = useAIProvider();
  const canVoice = Boolean(provider?.transcribeAudio);
  const canDenoise = Boolean(provider?.denoiseAudio);
  const [recording, setRecording] = useState(false);
  const [denoise, setDenoise] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const recorderRef = useRef<Recorder | null>(null);

  const startVoice = async () => {
    setVoiceStatus(null);
    try {
      recorderRef.current = await startRecording();
      setRecording(true);
    } catch (e) {
      setVoiceStatus(e instanceof Error ? e.message : 'Microphone unavailable.');
    }
  };

  const stopVoice = async () => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (!rec || !provider?.transcribeAudio) return;
    try {
      const blob = await rec.stop();
      let wav16: string;
      if (denoise && provider.denoiseAudio) {
        setVoiceStatus('Reducing noise…');
        const wav48 = await blobToWavBase64(blob, 48000);
        const cleaned = await provider.denoiseAudio(wav48);
        wav16 = await blobToWavBase64(wavBase64ToBlob(cleaned), 16000);
      } else {
        wav16 = await blobToWavBase64(blob, 16000);
      }
      setVoiceStatus('Transcribing…');
      const spoken = (await provider.transcribeAudio(wav16)).trim();
      if (spoken) setText((prev) => (prev ? `${prev} ${spoken}` : spoken));
      setVoiceStatus(null);
    } catch (e) {
      setVoiceStatus(e instanceof Error ? e.message : 'Could not transcribe audio.');
    }
  };

  const post = () => {
    const t = text.trim();
    if (!t) return;
    const name = author.trim() || 'You';
    try {
      window.localStorage.setItem('apg:comment-author', name);
    } catch {
      /* ignore */
    }
    api.getState().addComment(item.id, t, name);
    setText('');
  };

  return (
    <div className="apg-info__section">
      <div className="apg-info__section-head">
        <Icon name="chat" size={15} />
        <span>Comments</span>
        <span className="apg-info__count">{comments.length}</span>
      </div>

      {comments.length === 0 ? (
        <div className="apg-info__hint">No comments yet. Start the conversation below.</div>
      ) : (
        <ul className="apg-comments">
          {comments.map((c) => (
            <li key={c.id} className="apg-comment">
              <div className="apg-comment__avatar" aria-hidden>
                {(c.author ?? 'You').slice(0, 1).toUpperCase()}
              </div>
              <div className="apg-comment__body">
                <div className="apg-comment__meta">
                  <span className="apg-comment__author">{c.author ?? 'You'}</span>
                  <span className="apg-comment__time">
                    {formatDate(c.createdAt)} · {formatTime(c.createdAt)}
                  </span>
                </div>
                <div className="apg-comment__text">{c.text}</div>
              </div>
              <button
                type="button"
                className="apg-comment__delete"
                aria-label="Delete comment"
                onClick={() => api.getState().deleteComment(item.id, c.id)}
              >
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="apg-comment-form">
        <input
          className="apg-comment-form__author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          maxLength={40}
        />
        <textarea
          className="apg-comment-form__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post();
          }}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          rows={2}
          maxLength={2000}
        />
        {canVoice ? (
          <div className="apg-voice">
            <button
              type="button"
              className={`apg-btn apg-btn--small apg-voice__mic${recording ? ' apg-voice__mic--rec' : ''}`}
              onClick={recording ? stopVoice : startVoice}
              aria-label={recording ? 'Stop recording' : 'Record a voice comment'}
              title={recording ? 'Stop & transcribe' : 'Speak your comment'}
            >
              <Icon name={recording ? 'check' : 'mic'} size={14} />
              {recording ? 'Stop' : 'Speak'}
            </button>
            {canDenoise ? (
              <label
                className="apg-voice__denoise"
                title="Clean up background noise before transcribing"
              >
                <input
                  type="checkbox"
                  checked={denoise}
                  onChange={(e) => setDenoise(e.target.checked)}
                />
                Reduce noise
              </label>
            ) : null}
            <span className="apg-voice__status" aria-live="polite">
              {recording ? '● Listening…' : (voiceStatus ?? '')}
            </span>
          </div>
        ) : null}
        <button
          type="button"
          className="apg-btn apg-btn--small apg-comment-form__post"
          onClick={post}
          disabled={!text.trim()}
        >
          Post
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="apg-info__row">
      <span className="apg-info__row-label">{label}</span>
      <span className="apg-info__row-value">{value}</span>
    </div>
  );
}

// EXIF Orientation codes 1–8 → human text (construction shots are often sideways).
const ORIENTATION_LABELS: Record<number, string> = {
  1: 'Normal',
  2: 'Mirrored horizontal',
  3: 'Rotated 180°',
  4: 'Mirrored vertical',
  5: 'Mirrored + 90° CCW',
  6: 'Rotated 90° CW',
  7: 'Mirrored + 90° CW',
  8: 'Rotated 90° CCW',
};
function orientationLabel(v: string | number): string {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return ORIENTATION_LABELS[n] ?? String(v);
}

function Chips({
  label,
  items,
  onClick,
}: {
  label: string;
  items: string[];
  onClick?: (item: string) => void;
}) {
  return (
    <div className="apg-info__chips">
      <span className="apg-info__row-label">{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {items.map((t) => (
          <button
            key={t}
            type="button"
            className="apg-chip"
            onClick={onClick ? () => onClick(t) : undefined}
            style={{ cursor: onClick ? 'pointer' : 'default', textTransform: 'capitalize' }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "Show address" button → reverse-geocodes the GPS coords to a human-readable
 * address (free OpenStreetMap Nominatim). Clicking the resolved address opens the
 * full Map at that location.
 */
function AddressLookup({ lat, lng, onOpenMap }: { lat: number; lng: number; onOpenMap: () => void }) {
  const [address, setAddress] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  const lookup = async () => {
    setState('loading');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
        { headers: { Accept: 'application/json' } },
      );
      const data = (await res.json()) as { display_name?: string };
      if (data?.display_name) {
        setAddress(data.display_name);
        setState('idle');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  if (address) {
    return (
      <button
        type="button"
        onClick={onOpenMap}
        title="Open in Map"
        style={{
          display: 'block',
          textAlign: 'left',
          width: '100%',
          marginTop: 6,
          padding: '6px 8px',
          background: 'var(--apg-bg-elevated)',
          border: '1px solid var(--apg-glass-border, rgba(255,255,255,0.1))',
          borderRadius: 8,
          color: 'var(--apg-text)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        📍 {address}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="apg-btn apg-btn--small"
      onClick={() => void lookup()}
      disabled={state === 'loading'}
      style={{ marginTop: 6 }}
    >
      {state === 'loading' ? 'Looking up…' : state === 'error' ? 'Retry address' : 'Show address'}
    </button>
  );
}

/** Small non-interactive Leaflet map for the location preview (click to open full Map). */
function MiniMap({ lat, lng, onOpen }: { lat: number; lng: number; onOpen?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((mod) => {
      const L = (mod as any).default ?? mod;
      if (cancelled || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
      }).setView([lat, lng], 11);
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.circleMarker([lat, lng], {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#0a84ff',
        fillOpacity: 1,
      }).addTo(map);
    });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} className="apg-info__map" />
      {onOpen ? (
        <button
          type="button"
          aria-label="Open in Map"
          onClick={onOpen}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            zIndex: 500,
          }}
        />
      ) : null}
    </div>
  );
}
