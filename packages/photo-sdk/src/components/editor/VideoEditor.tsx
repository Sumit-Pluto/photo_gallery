'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { nanoid } from 'nanoid';
import { useEffect, useRef, useState } from 'react';

import { FILTER_PRESETS } from '../../constants';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { editFilterCss } from '../../lib/edits';
import { summarizeEdits } from '../../lib/versions';
import { bakeVideo } from '../../lib/videoBake';
import { blobToWavBase64, wavBase64ToBlob } from '../../lib/audioCapture';
import { useAIProvider } from '../aiContext';
import { VoiceButton } from './VoiceButton';
import {
  normalizeSegments,
  outputDuration,
  sampleOverlay,
  sourceToOutputTime,
} from '../../lib/videoTimeline';
import { Icon, type IconName } from '../../icons';
import { useGallery, useGalleryStoreApi } from '../../store/context';
import type { EditState, MediaId, MediaItem, VideoOverlay, VideoSegment } from '../../types';
import { Annotations, type AnnotationTool } from './Annotations';
import { addToAlbumPicker, confirmAction } from '../modals';

type Tab = 'trim' | 'crop' | 'overlay' | 'filters' | 'adjust' | 'markup' | 'audio' | 'export';
const TABS: Tab[] = ['trim', 'crop', 'overlay', 'filters', 'adjust', 'markup', 'audio', 'export'];
const TAB_LABEL: Record<Tab, string> = {
  trim: 'Trim & Split',
  crop: 'Crop & Rotate',
  overlay: 'Overlays & Text',
  filters: 'Filters',
  adjust: 'Adjust',
  markup: 'Markup',
  audio: 'Audio',
  export: 'Export',
};

const ANN_TOOLS: Array<{ tool: AnnotationTool; icon: IconName; label: string }> = [
  { tool: 'rect', icon: 'crop', label: 'Rectangle' },
  { tool: 'ellipse', icon: 'info', label: 'Oval' },
  { tool: 'arrow', icon: 'chevron-right', label: 'Arrow' },
  { tool: 'double-arrow', icon: 'aspect', label: 'Measure' },
  { tool: 'text', icon: 'tag', label: 'Text' },
  { tool: 'freehand', icon: 'adjust', label: 'Draw' },
];
const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#000000'];
const CROP_PRESETS: Array<{ label: string; ratio: number | null }> = [
  { label: 'Original', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '4:3', ratio: 4 / 3 },
];
const QUALITIES: Array<{ label: string; maxDim: number }> = [
  { label: '480p', maxDim: 854 },
  { label: '720p', maxDim: 1280 },
  { label: '1080p', maxDim: 1920 },
];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}
const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;

/** Centered crop rect for an aspect ratio within a WxH frame (fractions 0..1). */
function centeredCrop(ratio: number | null, aspect: number) {
  if (ratio == null) return { x: 0, y: 0, width: 1, height: 1 };
  if (ratio > aspect) {
    const h = aspect / ratio;
    return { x: 0, y: (1 - h) / 2, width: 1, height: h };
  }
  const w = ratio / aspect;
  return { x: (1 - w) / 2, y: 0, width: w, height: 1 };
}

export function VideoEditor() {
  const api = useGalleryStoreApi();
  const editorId = useGallery((s) => s.editorId);
  const media = useGallery((s) => s.media);
  const item = media.find((m) => m.id === editorId) ?? null;

  const [tab, setTab] = useState<Tab>('trim');
  const [edits, setEdits] = useState<EditState>({ adjustments: {} });
  const [annTool, setAnnTool] = useState<AnnotationTool>('rect');
  const [annColor, setAnnColor] = useState('#ff3b30');
  const [duration, setDuration] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [selOverlay, setSelOverlay] = useState<string | null>(null);
  const provider = useAIProvider();
  const [denoiseBusy, setDenoiseBusy] = useState(false);
  const [denoiseErr, setDenoiseErr] = useState<string | null>(null);
  const [previewH, setPreviewH] = useState(360);
  const [baking, setBaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const annoWrapRef = useRef<HTMLDivElement>(null);
  const overlayFileRef = useRef<HTMLInputElement>(null);
  const watermarkFileRef = useRef<HTMLInputElement>(null);
  const musicFileRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<() => void>(() => api.getState().closeEditor());
  useFocusTrap(dialogRef, Boolean(item) && item?.kind === 'video', () => cancelRef.current());

  // Reset when a different video opens.
  useEffect(() => {
    setEdits(item?.edits ? { ...item.edits } : { adjustments: {} });
    setTab('trim');
    setProgress(0);
    setPlayhead(0);
    setSelOverlay(null);
    setExportError(null);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track the preview box height (drives text-overlay font sizing).
  useEffect(() => {
    const el = annoWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPreviewH(el.clientHeight || 360));
    ro.observe(el);
    return () => ro.disconnect();
  }, [item?.id]);

  // Keep preview playback within the first→last segment span; track the playhead.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setPlayhead(v.currentTime);
      const segs = edits.segments && edits.segments.length ? edits.segments : null;
      const lo = segs ? segs[0]!.start : (edits.trim?.start ?? 0);
      const hi = segs ? segs[segs.length - 1]!.end : (edits.trim?.end ?? (duration || v.duration));
      if (v.currentTime >= hi) v.currentTime = lo;
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [edits.trim, edits.segments, duration]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = !!edits.audio?.muted;
  }, [edits.audio?.muted]);

  if (!item || item.kind !== 'video') return null;

  const update = (patch: Partial<EditState>) => setEdits((e) => ({ ...e, ...patch }));
  const setAdj = (key: string, val: number) =>
    update({ adjustments: { ...edits.adjustments, [key]: val } });

  // ---- segments ----
  const segments: VideoSegment[] =
    edits.segments && edits.segments.length
      ? edits.segments
      : duration
        ? [{ id: 'seg0', start: 0, end: duration, speed: 1 }]
        : [];
  const setSegments = (segs: VideoSegment[]) => update({ segments: segs, trim: undefined });
  const splitAtPlayhead = () => {
    const t = playhead;
    const next: VideoSegment[] = [];
    for (const s of segments) {
      if (t > s.start + 0.1 && t < s.end - 0.1) {
        next.push({ ...s, end: t }, { id: nanoid(6), start: t, end: s.end, speed: s.speed });
      } else next.push(s);
    }
    setSegments(next);
  };
  const outDur = outputDuration(normalizeSegments(edits, duration || 0));

  // ---- overlays ----
  const overlays: VideoOverlay[] = edits.overlays ?? [];
  const setOverlays = (list: VideoOverlay[]) => update({ overlays: list });
  const outputTime = sourceToOutputTime(normalizeSegments(edits, duration || 0), playhead);
  const addOverlay = (o: VideoOverlay) => {
    setOverlays([...overlays, o]);
    setSelOverlay(o.id);
  };
  const patchOverlay = (id: string, patch: Partial<VideoOverlay>) =>
    setOverlays(overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const addImageOverlay = (file?: File, watermark = false) => {
    if (!file) return;
    void blobToDataUrl(file).then((src) =>
      addOverlay({
        id: nanoid(6),
        kind: 'image',
        src,
        x: 0.05,
        y: 0.05,
        scale: watermark ? 0.22 : 0.3,
        opacity: watermark ? 0.85 : 1,
        rotation: 0,
        watermark,
      }),
    );
  };
  const addTextOverlay = () =>
    addOverlay({
      id: nanoid(6),
      kind: 'text',
      text: 'Your text',
      color: '#ffffff',
      fontSize: 0.09,
      bold: true,
      x: 0.1,
      y: 0.8,
      scale: 0.3,
      opacity: 1,
      rotation: 0,
    });
  const runVideoDenoise = async () => {
    if (!provider?.denoiseAudio) return;
    setDenoiseBusy(true);
    setDenoiseErr(null);
    try {
      const resp = await fetch(item.src);
      const blob = await resp.blob();
      // Decode the video's audio track → 48 kHz mono WAV → RunPod denoise → clean WAV.
      const wav48 = await blobToWavBase64(blob, 48000);
      const cleaned = await provider.denoiseAudio(wav48);
      const url = URL.createObjectURL(wavBase64ToBlob(cleaned));
      update({ audio: { ...edits.audio, denoisedSrc: url } });
    } catch (e) {
      setDenoiseErr(
        e instanceof Error ? e.message : 'Could not clean the audio (keep clips under ~30s).',
      );
    } finally {
      setDenoiseBusy(false);
    }
  };
  const addKeyframe = (id: string) => {
    const o = overlays.find((x) => x.id === id);
    if (!o) return;
    const s = sampleOverlay(o, outputTime);
    const kf = {
      t: Math.round(outputTime * 100) / 100,
      x: s.x,
      y: s.y,
      scale: s.scale,
      rotation: s.rotation,
      opacity: s.opacity,
    };
    const rest = (o.keyframes ?? []).filter((k) => Math.abs(k.t - kf.t) > 0.05);
    patchOverlay(id, { keyframes: [...rest, kf].sort((a, b) => a.t - b.t) });
  };

  const isDirty = () =>
    !!edits.filter ||
    (edits.annotations?.length ?? 0) > 0 ||
    Object.keys(edits.adjustments ?? {}).length > 0 ||
    !!edits.trim ||
    !!edits.segments ||
    !!edits.overlay ||
    (edits.overlays?.length ?? 0) > 0 ||
    !!edits.crop ||
    !!edits.rotation ||
    !!edits.flipH ||
    !!edits.flipV ||
    !!edits.audio;

  const cancel = () => {
    if (!isDirty()) return api.getState().closeEditor();
    confirmAction({
      title: 'Discard changes?',
      message: 'Your edits to this video have not been saved.',
      confirmLabel: 'Discard',
      danger: true,
      onConfirm: () => api.getState().closeEditor(),
    });
  };
  cancelRef.current = cancel;

  const pickMusic = (file?: File) => {
    if (!file) return;
    void blobToDataUrl(file).then((src) =>
      update({
        audio: { ...edits.audio, musicSrc: src, musicVolume: edits.audio?.musicVolume ?? 0.8 },
      }),
    );
  };

  const save = async (asCopy: boolean) => {
    setBaking(true);
    setProgress(0);
    setExportError(null);
    const changes = summarizeEdits(edits);
    try {
      const svg = annoWrapRef.current?.querySelector('svg') as SVGSVGElement | null;
      const { blob, durationSec, poster } = await bakeVideo(item.src, edits, {
        annotationsSvg: edits.annotations?.length ? svg : null,
        onProgress: setProgress,
      });
      const targetId = asCopy ? (nanoid(10) as MediaId) : item.id;
      const uploaded = await api.getState().uploadBlob(targetId, blob);
      const src = uploaded ?? (await blobToDataUrl(blob));
      const patch: Partial<MediaItem> = {
        src,
        thumbnail: undefined,
        poster,
        duration: durationSec,
        mime: blob.type,
        edits: undefined,
        editedAt: Date.now(),
        analyzedAt: undefined,
      };
      if (asCopy) {
        const newId = api.getState().duplicateWithEdits(item.id, { ...patch, id: targetId }, changes);
        api.getState().closeEditor();
        addToAlbumPicker([newId]);
      } else {
        api.getState().addVersion(item.id, patch, changes);
        api.getState().closeEditor();
      }
    } catch (err) {
      // Surface the failure instead of silently pretending success.
      // eslint-disable-next-line no-console
      console.error('[VideoEditor] export failed:', err);
      setExportError(
        err instanceof Error && /cross-origin|tainted|secur/i.test(err.message)
          ? "This video can't be exported in-browser (cross-origin source without CORS). Re-import it, or host it with CORS enabled."
          : 'Export failed. Your edits were saved as a new version so nothing is lost.',
      );
      // Preserve the edit intent as a version so history is never lost.
      if (asCopy) {
        const copyId = nanoid(10) as MediaId;
        api.getState().duplicateWithEdits(item.id, { id: copyId, edits, editedAt: Date.now() }, changes);
      } else {
        api.getState().addVersion(item.id, { edits, editedAt: Date.now() }, changes);
      }
    } finally {
      setBaking(false);
    }
  };

  const filterCss = editFilterCss(edits);
  const sel = overlays.find((o) => o.id === selOverlay) ?? null;

  return (
    <AnimatePresence>
      <motion.div
        ref={dialogRef}
        className="apg-editor"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${item.name}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
      >
        <div className="apg-editor__bar">
          <button type="button" className="apg-iconbtn" aria-label="Cancel" onClick={cancel}>
            <Icon name="close" />
          </button>
          <div style={{ fontWeight: 600 }}>Edit Video · {item.name}</div>
          <div style={{ flex: 1 }} />
          {baking ? (
            <span style={{ fontSize: 13, color: 'var(--apg-text-secondary)' }}>
              Exporting… {Math.round(progress * 100)}%
            </span>
          ) : null}
          <button type="button" className="apg-btn" onClick={() => setEdits({ adjustments: {} })} disabled={baking}>
            Revert
          </button>
          <button type="button" className="apg-btn" onClick={() => void save(true)} disabled={baking} title="Export as a new video">
            Save as Copy
          </button>
          <button type="button" className="apg-btn apg-btn--primary" onClick={() => void save(false)} disabled={baking}>
            {baking ? 'Exporting…' : 'Save'}
          </button>
        </div>

        <div className="apg-editor__body">
          <div className="apg-editor__canvaswrap">
            <div ref={annoWrapRef} style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
              <video
                ref={videoRef}
                src={item.src}
                controls
                playsInline
                crossOrigin="anonymous"
                style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', filter: filterCss || undefined }}
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration || 0;
                  setDuration(d);
                  setPreviewH(annoWrapRef.current?.clientHeight || 360);
                  e.currentTarget.currentTime = segments[0]?.start ?? 0;
                }}
              />
              {/* Live overlay preview (keyframe-interpolated at the current output time). */}
              {overlays.map((o) => {
                const s = sampleOverlay(o, outputTime);
                if (!s.visible) return null;
                const selectedRing = o.id === selOverlay ? '0 0 0 2px var(--apg-accent)' : undefined;
                if (o.kind === 'image') {
                  return (
                    <img
                      key={o.id}
                      src={o.src}
                      alt=""
                      onClick={() => setSelOverlay(o.id)}
                      style={{
                        position: 'absolute',
                        left: `${s.x * 100}%`,
                        top: `${s.y * 100}%`,
                        width: `${s.scale * 100}%`,
                        opacity: s.opacity,
                        transform: `rotate(${s.rotation}deg)`,
                        transformOrigin: 'top left',
                        boxShadow: selectedRing,
                        cursor: 'pointer',
                      }}
                    />
                  );
                }
                return (
                  <div
                    key={o.id}
                    onClick={() => setSelOverlay(o.id)}
                    style={{
                      position: 'absolute',
                      left: `${s.x * 100}%`,
                      top: `${s.y * 100}%`,
                      opacity: s.opacity,
                      transform: `rotate(${s.rotation}deg)`,
                      transformOrigin: 'top left',
                      color: o.color ?? '#fff',
                      fontSize: `${(o.fontSize ?? 0.08) * previewH}px`,
                      fontWeight: o.bold ? 700 : 500,
                      lineHeight: 1,
                      whiteSpace: 'pre',
                      textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                      outline: o.id === selOverlay ? '2px solid var(--apg-accent)' : undefined,
                      cursor: 'pointer',
                    }}
                  >
                    {o.text}
                  </div>
                );
              })}
              <Annotations
                annotations={edits.annotations ?? []}
                editable={tab === 'markup'}
                tool={annTool}
                color={annColor}
                onChange={(annotations) => update({ annotations })}
              />
            </div>
          </div>

          <div className="apg-editor__panel apg-scroll">
            <div className="apg-editor__tabs">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={['apg-editor__tab', tab === t ? 'apg-editor__tab--active' : ''].join(' ')}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>

            {exportError ? (
              <div className="apg-editor__error" role="alert">
                {exportError}
              </div>
            ) : null}

            {/* ---------- TRIM & SPLIT (multi-segment) ---------- */}
            {tab === 'trim' ? (
              <div className="apg-vedit__panel">
                <div className="apg-vedit__hint">
                  Keep multiple parts at different speeds. Split at the playhead, then trim or delete
                  each segment. Output length: <strong>{fmt(outDur)}</strong>.
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <button type="button" className="apg-btn apg-btn--primary apg-btn--small" onClick={splitAtPlayhead}>
                    <Icon name="crop" size={13} /> Split at {fmt(playhead)}
                  </button>
                  <button
                    type="button"
                    className="apg-btn apg-btn--small"
                    onClick={() =>
                      setSegments([
                        ...segments,
                        { id: nanoid(6), start: 0, end: Math.min(duration, 3), speed: 1 },
                      ])
                    }
                  >
                    <Icon name="plus" size={13} /> Add
                  </button>
                </div>
                {segments.map((s, i) => (
                  <div key={s.id} className="apg-vedit__seg">
                    <div className="apg-vedit__seg-head">
                      <strong>Segment {i + 1}</strong>
                      <span className="apg-vedit__seg-dur">{fmt(Math.max(0, s.end - s.start))}</span>
                      {segments.length > 1 ? (
                        <button
                          type="button"
                          className="apg-iconbtn apg-iconbtn--sm"
                          aria-label="Delete segment"
                          onClick={() => setSegments(segments.filter((x) => x.id !== s.id))}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      ) : null}
                    </div>
                    <label className="apg-vedit__row">
                      <span>Start {fmt(s.start)}</span>
                      <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={s.start}
                        onChange={(e) => {
                          const start = Math.min(Number(e.target.value), s.end - 0.2);
                          setSegments(segments.map((x) => (x.id === s.id ? { ...x, start } : x)));
                          if (videoRef.current) videoRef.current.currentTime = start;
                        }}
                      />
                    </label>
                    <label className="apg-vedit__row">
                      <span>End {fmt(s.end)}</span>
                      <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={s.end}
                        onChange={(e) => {
                          const end = Math.max(Number(e.target.value), s.start + 0.2);
                          setSegments(segments.map((x) => (x.id === s.id ? { ...x, end } : x)));
                        }}
                      />
                    </label>
                    <label className="apg-vedit__row">
                      <span>Speed {(s.speed ?? 1).toFixed(2)}×</span>
                      <input
                        type="range"
                        min={0.25}
                        max={3}
                        step={0.05}
                        value={s.speed ?? 1}
                        onChange={(e) =>
                          setSegments(
                            segments.map((x) => (x.id === s.id ? { ...x, speed: Number(e.target.value) } : x)),
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            ) : null}

            {/* ---------- CROP & ROTATE ---------- */}
            {tab === 'crop' ? (
              <div className="apg-vedit__panel">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="apg-btn apg-btn--small"
                    onClick={() => update({ rotation: (((edits.rotation ?? 0) + 90) % 360) })}
                  >
                    <Icon name="rotate" size={14} /> Rotate 90°
                  </button>
                  <button
                    type="button"
                    className={['apg-btn apg-btn--small', edits.flipH ? 'apg-btn--primary' : ''].join(' ')}
                    onClick={() => update({ flipH: !edits.flipH })}
                  >
                    Flip H
                  </button>
                  <button
                    type="button"
                    className={['apg-btn apg-btn--small', edits.flipV ? 'apg-btn--primary' : ''].join(' ')}
                    onClick={() => update({ flipV: !edits.flipV })}
                  >
                    Flip V
                  </button>
                </div>
                <div className="apg-vedit__hint" style={{ marginTop: 10 }}>Crop aspect</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CROP_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="apg-btn apg-btn--small"
                      onClick={() => {
                        const aspect = (item.width || 16) / (item.height || 9);
                        update({ crop: p.ratio == null ? undefined : centeredCrop(p.ratio, aspect) });
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="apg-vedit__hint" style={{ marginTop: 8 }}>
                  Crop + rotation + flips are baked into the exported video.
                </div>
              </div>
            ) : null}

            {/* ---------- OVERLAYS & TEXT (with keyframe animation) ---------- */}
            {tab === 'overlay' ? (
              <div className="apg-vedit__panel">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="apg-btn apg-btn--small apg-btn--primary" onClick={() => overlayFileRef.current?.click()}>
                    <Icon name="image" size={13} /> Image
                  </button>
                  <button type="button" className="apg-btn apg-btn--small" onClick={addTextOverlay}>
                    <Icon name="tag" size={13} /> Text
                  </button>
                  <button type="button" className="apg-btn apg-btn--small" onClick={() => watermarkFileRef.current?.click()}>
                    <Icon name="image" size={13} /> Watermark
                  </button>
                </div>
                <input ref={overlayFileRef} type="file" accept="image/*" hidden onChange={(e) => { addImageOverlay(e.target.files?.[0] ?? undefined, false); e.target.value = ''; }} />
                <input ref={watermarkFileRef} type="file" accept="image/*" hidden onChange={(e) => { addImageOverlay(e.target.files?.[0] ?? undefined, true); e.target.value = ''; }} />

                {overlays.length === 0 ? (
                  <div className="apg-vedit__hint">
                    Add a logo, sticker, watermark, or animated title. Select one to animate it with
                    keyframes (move / fade / scale over time).
                  </div>
                ) : (
                  <div className="apg-vedit__ovlist">
                    {overlays.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={['apg-vedit__ovitem', o.id === selOverlay ? 'is-sel' : ''].join(' ')}
                        onClick={() => setSelOverlay(o.id)}
                      >
                        <Icon name={o.kind === 'text' ? 'tag' : 'image'} size={13} />
                        <span className="apg-vedit__ovlabel">
                          {o.kind === 'text' ? o.text || 'Text' : o.watermark ? 'Watermark' : 'Image'}
                        </span>
                        {o.keyframes?.length ? <span className="apg-vedit__kfbadge">{o.keyframes.length}◆</span> : null}
                        <span
                          className="apg-iconbtn apg-iconbtn--sm"
                          role="button"
                          aria-label="Delete overlay"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOverlays(overlays.filter((x) => x.id !== o.id));
                            if (selOverlay === o.id) setSelOverlay(null);
                          }}
                        >
                          <Icon name="trash" size={13} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {sel ? (
                  <div className="apg-vedit__ovedit">
                    {sel.kind === 'text' ? (
                      <>
                        <label className="apg-vedit__row">
                          <span>Text</span>
                          <input
                            className="apg-modal__input"
                            value={sel.text ?? ''}
                            onChange={(e) => patchOverlay(sel.id, { text: e.target.value })}
                          />
                        </label>
                        <VoiceButton
                          label="Speak → text"
                          onText={(t) => {
                            const cur = sel.text && sel.text !== 'Your text' ? sel.text : '';
                            patchOverlay(sel.id, { text: cur ? `${cur} ${t}` : t });
                          }}
                        />
                        <div style={{ display: 'flex', gap: 6, margin: '4px 0' }}>
                          {COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={`Color ${c}`}
                              onClick={() => patchOverlay(sel.id, { color: c })}
                              style={{
                                width: 22, height: 22, borderRadius: '50%', background: c,
                                border: sel.color === c ? '2px solid var(--apg-accent)' : '1px solid var(--apg-separator)',
                                cursor: 'pointer',
                              }}
                            />
                          ))}
                        </div>
                        <label className="apg-vedit__row">
                          <span>Size {Math.round((sel.fontSize ?? 0.09) * 100)}</span>
                          <input type="range" min={0.03} max={0.3} step={0.005} value={sel.fontSize ?? 0.09}
                            onChange={(e) => patchOverlay(sel.id, { fontSize: Number(e.target.value) })} />
                        </label>
                      </>
                    ) : null}
                    {(['x', 'y', 'scale', 'opacity'] as const).map((k) => (
                      <label key={k} className="apg-vedit__row">
                        <span style={{ textTransform: 'capitalize' }}>{k} {(sel[k] ?? (k === 'opacity' ? 1 : 0)).toFixed(2)}</span>
                        <input
                          type="range"
                          min={k === 'scale' ? 0.05 : 0}
                          max={1}
                          step={0.01}
                          value={sel[k] ?? (k === 'opacity' ? 1 : 0)}
                          onChange={(e) => patchOverlay(sel.id, { [k]: Number(e.target.value) } as Partial<VideoOverlay>)}
                        />
                      </label>
                    ))}
                    <label className="apg-vedit__row">
                      <span>Rotation {Math.round(sel.rotation ?? 0)}°</span>
                      <input type="range" min={-180} max={180} step={1} value={sel.rotation ?? 0}
                        onChange={(e) => patchOverlay(sel.id, { rotation: Number(e.target.value) })} />
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <label className="apg-vedit__row" style={{ flex: 1 }}>
                        <span>Appear {fmt(sel.in ?? 0)}</span>
                        <input type="range" min={0} max={outDur} step={0.1} value={sel.in ?? 0}
                          onChange={(e) => patchOverlay(sel.id, { in: Number(e.target.value) })} />
                      </label>
                      <label className="apg-vedit__row" style={{ flex: 1 }}>
                        <span>Hide {fmt(sel.out ?? outDur)}</span>
                        <input type="range" min={0} max={outDur} step={0.1} value={sel.out ?? outDur}
                          onChange={(e) => patchOverlay(sel.id, { out: Number(e.target.value) })} />
                      </label>
                    </div>
                    <div className="apg-vedit__hint" style={{ marginTop: 6 }}>
                      Keyframes (animate over time) — position the playhead, set the transform, then
                      Add keyframe. Two+ keyframes animate between them.
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="button" className="apg-btn apg-btn--small apg-btn--primary" onClick={() => addKeyframe(sel.id)}>
                        ◆ Add keyframe @ {fmt(outputTime)}
                      </button>
                      {(sel.keyframes ?? []).map((k, i) => (
                        <span key={i} className="apg-vedit__kf">
                          {fmt(k.t)}
                          <button
                            type="button"
                            aria-label="Delete keyframe"
                            onClick={() =>
                              patchOverlay(sel.id, { keyframes: (sel.keyframes ?? []).filter((_, j) => j !== i) })
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* ---------- FILTERS ---------- */}
            {tab === 'filters' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 12 }}>
                {Object.entries(FILTER_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    className={['apg-btn', edits.filter === key || (key === 'original' && !edits.filter) ? 'apg-btn--primary' : ''].join(' ')}
                    onClick={() => update({ filter: key === 'original' ? undefined : key })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            ) : null}

            {/* ---------- ADJUST ---------- */}
            {tab === 'adjust' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12 }}>
                {(['brightness', 'contrast', 'saturation', 'warmth'] as const).map((k) => (
                  <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    <span style={{ textTransform: 'capitalize', color: 'var(--apg-text-secondary)' }}>{k}</span>
                    <input type="range" min={-1} max={1} step={0.01} value={edits.adjustments[k] ?? 0}
                      onChange={(e) => setAdj(k, Number(e.target.value))} />
                  </label>
                ))}
              </div>
            ) : null}

            {/* ---------- MARKUP ---------- */}
            {tab === 'markup' ? (
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {ANN_TOOLS.map((t) => (
                    <button key={t.tool} type="button"
                      className={['apg-btn', annTool === t.tool ? 'apg-btn--primary' : ''].join(' ')}
                      style={{ padding: '6px 8px' }} title={t.label} onClick={() => setAnnTool(t.tool)}>
                      <Icon name={t.icon} size={15} />
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {COLORS.map((c) => (
                    <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setAnnColor(c)}
                      style={{ width: 24, height: 24, borderRadius: '50%', background: c,
                        border: annColor === c ? '2px solid var(--apg-accent)' : '1px solid var(--apg-separator)', cursor: 'pointer' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="apg-btn" onClick={() => update({ annotations: (edits.annotations ?? []).slice(0, -1) })}>Undo</button>
                  <button type="button" className="apg-btn" onClick={() => update({ annotations: [] })}>Clear</button>
                </div>
              </div>
            ) : null}

            {/* ---------- AUDIO ---------- */}
            {tab === 'audio' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, fontSize: 13 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={!!edits.audio?.muted}
                    onChange={(e) => update({ audio: { ...edits.audio, muted: e.target.checked } })} />
                  Mute original audio
                </label>
                {provider?.denoiseAudio ? (
                  edits.audio?.denoisedSrc ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ color: '#34c759' }}>✓ Background noise reduced (AI)</span>
                      <button
                        type="button"
                        className="apg-btn apg-btn--small"
                        onClick={() => update({ audio: { ...edits.audio, denoisedSrc: undefined } })}
                      >
                        Undo
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="apg-btn apg-btn--primary"
                      disabled={denoiseBusy}
                      onClick={() => void runVideoDenoise()}
                    >
                      <Icon name="wand" size={14} />{' '}
                      {denoiseBusy ? 'Cleaning audio…' : 'Reduce background noise (AI)'}
                    </button>
                  )
                ) : null}
                {denoiseErr ? (
                  <p style={{ color: '#ff6b6b', fontSize: 12, margin: 0 }}>{denoiseErr}</p>
                ) : null}
                {!edits.audio?.muted ? (
                  <label className="apg-vedit__row">
                    <span>Original volume {Math.round((edits.audio?.originalVolume ?? 1) * 100)}%</span>
                    <input type="range" min={0} max={1} step={0.05} value={edits.audio?.originalVolume ?? 1}
                      onChange={(e) => update({ audio: { ...edits.audio, originalVolume: Number(e.target.value) } })} />
                  </label>
                ) : null}
                <div style={{ display: 'flex', gap: 8 }}>
                  <label className="apg-vedit__row" style={{ flex: 1 }}>
                    <span>Fade in {(edits.audio?.fadeIn ?? 0).toFixed(1)}s</span>
                    <input type="range" min={0} max={5} step={0.1} value={edits.audio?.fadeIn ?? 0}
                      onChange={(e) => update({ audio: { ...edits.audio, fadeIn: Number(e.target.value) } })} />
                  </label>
                  <label className="apg-vedit__row" style={{ flex: 1 }}>
                    <span>Fade out {(edits.audio?.fadeOut ?? 0).toFixed(1)}s</span>
                    <input type="range" min={0} max={5} step={0.1} value={edits.audio?.fadeOut ?? 0}
                      onChange={(e) => update({ audio: { ...edits.audio, fadeOut: Number(e.target.value) } })} />
                  </label>
                </div>
                <button type="button" className="apg-btn apg-btn--primary" onClick={() => musicFileRef.current?.click()}>
                  <Icon name="play" size={14} /> {edits.audio?.musicSrc ? 'Replace Music' : 'Add Music'}
                </button>
                <input ref={musicFileRef} type="file" accept="audio/*" hidden
                  onChange={(e) => { pickMusic(e.target.files?.[0] ?? undefined); e.target.value = ''; }} />
                {edits.audio?.musicSrc ? (
                  <>
                    <label className="apg-vedit__row">
                      <span>Music volume {Math.round((edits.audio.musicVolume ?? 0.8) * 100)}%</span>
                      <input type="range" min={0} max={1} step={0.05} value={edits.audio.musicVolume ?? 0.8}
                        onChange={(e) => update({ audio: { ...edits.audio, musicVolume: Number(e.target.value) } })} />
                    </label>
                    <button type="button" className="apg-btn" onClick={() => update({ audio: { ...edits.audio, musicSrc: undefined } })}>Remove Music</button>
                  </>
                ) : null}
              </div>
            ) : null}

            {/* ---------- EXPORT (quality + poster) ---------- */}
            {tab === 'export' ? (
              <div className="apg-vedit__panel">
                <div className="apg-vedit__hint">Resolution (longest side)</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {QUALITIES.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      className={['apg-btn apg-btn--small', (edits.export?.maxDim ?? 1280) === q.maxDim ? 'apg-btn--primary' : ''].join(' ')}
                      onClick={() => update({ export: { ...edits.export, maxDim: q.maxDim } })}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <label className="apg-vedit__row" style={{ marginTop: 10 }}>
                  <span>Frame rate {edits.export?.fps ?? 30} fps</span>
                  <input type="range" min={15} max={60} step={1} value={edits.export?.fps ?? 30}
                    onChange={(e) => update({ export: { ...edits.export, fps: Number(e.target.value) } })} />
                </label>
                <div className="apg-vedit__hint" style={{ marginTop: 10 }}>Poster / thumbnail</div>
                <button type="button" className="apg-btn apg-btn--small" onClick={() => update({ posterTime: outputTime })}>
                  <Icon name="image" size={13} /> Use current frame ({fmt(outputTime)})
                </button>
                {edits.posterTime != null ? (
                  <div className="apg-vedit__hint">Poster set at {fmt(edits.posterTime)}.</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
