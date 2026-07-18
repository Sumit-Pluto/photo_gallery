'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { nanoid } from 'nanoid';
import { useEffect, useRef, useState } from 'react';

import type { GenerativeEditOp } from '../../ai/types';
import { FILTER_PRESETS, ZERO_ADJUSTMENTS } from '../../constants';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { editFilterCss, editTransformCss } from '../../lib/edits';
import { summarizeEdits } from '../../lib/versions';
import { Icon, type IconName } from '../../icons';
import { useGallery, useGalleryStoreApi } from '../../store/context';
import type { Annotation, EditAdjustments, EditState, MediaId, MediaItem } from '../../types';
import { bakeEdits, hasGeometry } from '../../lib/bake';
import { addToAlbumPicker, confirmAction } from '../modals';
import { useAIProvider } from '../aiContext';
import { Annotations, type AnnotationTool } from './Annotations';
import { CropBox, type CropRect } from './CropBox';
import { MaskBrush } from './MaskBrush';

const RATIOS: Array<{ label: string; value: number | null }> = [
  { label: 'Free', value: null },
  { label: 'Square', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

function centeredCrop(ratio: number | null, imgAspect: number): CropRect {
  if (ratio == null) return { x: 0, y: 0, width: 1, height: 1 };
  let w = 1;
  let h = imgAspect / ratio;
  if (h > 1) {
    h = 1;
    w = ratio / imgAspect;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h };
}

type Tab = 'adjust' | 'filters' | 'crop' | 'markup' | 'ai';

const ANN_TOOLS: Array<{ tool: AnnotationTool; label: string; icon: IconName }> = [
  { tool: 'select', label: 'Select', icon: 'check' },
  { tool: 'rect', label: 'Rectangle', icon: 'aspect' },
  { tool: 'ellipse', label: 'Oval', icon: 'filters' },
  { tool: 'line', label: 'Line', icon: 'minus' },
  { tool: 'arrow', label: 'Arrow', icon: 'chevron-right' },
  { tool: 'double-arrow', label: 'Measure', icon: 'crop' },
  { tool: 'text', label: 'Text', icon: 'tag' },
  { tool: 'freehand', label: 'Draw', icon: 'wand' },
];

const ANN_COLORS = ['#ff3b30', '#ff9f0a', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2', '#ffffff', '#000000'];

const ADJUST_FIELDS: Array<{ key: keyof EditAdjustments; label: string }> = [
  { key: 'exposure', label: 'Exposure' },
  { key: 'brilliance', label: 'Brilliance' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'shadows', label: 'Shadows' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'brightness', label: 'Brightness' },
  { key: 'blackPoint', label: 'Black Point' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'vibrance', label: 'Vibrance' },
  { key: 'warmth', label: 'Warmth' },
  { key: 'tint', label: 'Tint' },
  { key: 'sharpness', label: 'Sharpness' },
  { key: 'definition', label: 'Definition' },
  { key: 'vignette', label: 'Vignette' },
];

const AI_OPS: Array<{ label: string; op: GenerativeEditOp; icon: 'wand' | 'image' | 'crop' }> = [
  { label: 'Remove Background', op: { type: 'remove-background' }, icon: 'wand' },
  { label: 'Restore & Enhance', op: { type: 'restore' }, icon: 'wand' },
  { label: 'Colorize', op: { type: 'colorize' }, icon: 'wand' },
  { label: 'Replace Sky', op: { type: 'replace-sky' }, icon: 'image' },
];

/** Ops whose result varies with the "edit strength" slider (the backend maps it per model). */
const STRENGTH_OPS = new Set<GenerativeEditOp['type']>([
  'prompt',
  'replace-sky',
  'magic-eraser',
  'generative-fill',
]);

export function PhotoEditor() {
  const api = useGalleryStoreApi();
  const editorId = useGallery((s) => s.editorId);
  const media = useGallery((s) => s.media);
  const provider = useAIProvider();
  const aiAvailable = Boolean(provider?.generativeEdit);
  const item = media.find((m) => m.id === editorId) ?? null;

  const [tab, setTab] = useState<Tab>('adjust');
  const [edits, setEdits] = useState<EditState>({ adjustments: {} });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResultUrl, setAiResultUrl] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStrength, setAiStrength] = useState(0.5);
  const [maskMode, setMaskMode] = useState<'magic-eraser' | 'generative-fill' | null>(null);
  const [tiltBusy, setTiltBusy] = useState(false);
  const [tiltError, setTiltError] = useState<string | null>(null);
  const [annTool, setAnnTool] = useState<AnnotationTool>('rect');
  const [annColor, setAnnColor] = useState<string>('#ff3b30');
  const [cropRatio, setCropRatio] = useState<number | null>(null);
  const [baking, setBaking] = useState(false);
  const aiBlobRef = useRef<Blob | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Escape routes through the same dirty-check as the Cancel button (assigned below).
  const cancelRef = useRef<() => void>(() => api.getState().closeEditor());
  useFocusTrap(dialogRef, Boolean(item), () => cancelRef.current());

  // Reset state when the editor opens on a new item.
  useEffect(() => {
    if (item) {
      setEdits(item.edits ?? { adjustments: {} });
      setTab('adjust');
      setAiError(null);
      setAiPrompt('');
      setCropRatio(null);
      aiBlobRef.current = null;
      setAiResultUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Videos are handled by the dedicated VideoEditor.
  if (!item || item.kind === 'video') return null;

  const adj = { ...ZERO_ADJUSTMENTS, ...edits.adjustments };
  const setAdj = (key: keyof EditAdjustments, value: number) =>
    setEdits((e) => ({ ...e, adjustments: { ...e.adjustments, [key]: value } }));

  const annotations = edits.annotations ?? [];
  const setAnnotations = (next: Annotation[]) => setEdits((e) => ({ ...e, annotations: next }));

  const imgAspect = item.width / Math.max(1, item.height);
  const cropRect: CropRect = edits.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const setCrop = (r: CropRect) => setEdits((e) => ({ ...e, crop: r }));
  const pickRatio = (value: number | null) => {
    setCropRatio(value);
    setCrop(centeredCrop(value, imgAspect));
  };

  const filterCss = aiResultUrl ? undefined : editFilterCss(edits);
  // Apply rotate / straighten (tilt) / flip live in ALL tabs (incl. Crop) so the
  // user sees them immediately; the crop box overlays the transformed frame.
  const transformCss = aiResultUrl ? undefined : editTransformCss(edits);

  const runAI = async (op: GenerativeEditOp) => {
    if (!provider?.generativeEdit) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const img = await loadCrossOriginImage(item.src);
      // Attach the current "edit strength" to ops that support it.
      const opToRun = STRENGTH_OPS.has(op.type)
        ? ({ ...op, strength: aiStrength } as GenerativeEditOp)
        : op;
      const blob = await provider.generativeEdit(item, img, opToRun);
      aiBlobRef.current = blob;
      setAiResultUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI edit failed. Please try again.');
    } finally {
      setAiBusy(false);
    }
  };

  const autoStraighten = async () => {
    if (!provider?.estimateTilt) return;
    setTiltBusy(true);
    setTiltError(null);
    try {
      const img = await loadCrossOriginImage(item.src);
      const t = await provider.estimateTilt(item, img);
      const roll = Math.max(-45, Math.min(45, Math.round(t.rollDegrees)));
      setEdits((e) => ({ ...e, straighten: roll }));
    } catch (err) {
      setTiltError(err instanceof Error ? err.message : 'Could not estimate tilt.');
    } finally {
      setTiltBusy(false);
    }
  };

  const clearAI = () => {
    aiBlobRef.current = null;
    setAiError(null);
    setAiResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  /** True when there are unsaved changes worth confirming before discard. */
  const isDirty = () =>
    aiBlobRef.current !== null ||
    !!edits.filter ||
    hasGeometry(edits) ||
    (edits.annotations?.length ?? 0) > 0 ||
    Object.keys(edits.adjustments ?? {}).length > 0;

  /**
   * Build the result patch for a target id. Uploads a new blob (AI / baked
   * geometry) under that id when needed; returns the MediaItem patch to apply.
   */
  const buildPatch = async (targetId: MediaId): Promise<Partial<MediaItem>> => {
    if (aiBlobRef.current) {
      const uploaded = await api.getState().uploadBlob(targetId, aiBlobRef.current);
      const src = uploaded ?? (await blobToDataUrl(aiBlobRef.current));
      return { src, thumbnail: undefined, edits: undefined, editedAt: Date.now(), analyzedAt: undefined };
    }
    if (hasGeometry(edits)) {
      const img = await loadCrossOriginImage(item.src);
      const { blob, width, height, annotations: remapped } = await bakeEdits(img, edits);
      const uploaded = await api.getState().uploadBlob(targetId, blob);
      const src = uploaded ?? (await blobToDataUrl(blob));
      return {
        src,
        thumbnail: undefined,
        width,
        height,
        edits: remapped.length ? { adjustments: {}, annotations: remapped } : undefined,
        editedAt: Date.now(),
        analyzedAt: undefined,
      };
    }
    // Non-destructive (filter/adjust/markup only): keep the same src, store edits.
    return { edits, editedAt: Date.now() };
  };

  const save = async (asCopy: boolean) => {
    setBaking(true);
    // Human-readable audit log for this edit (same for copy + overwrite).
    const changes = aiBlobRef.current
      ? ['AI edit', ...summarizeEdits(edits).filter((c) => c !== 'Edited')]
      : summarizeEdits(edits);
    try {
      if (asCopy) {
        // Upload (if any) under a fresh id, create the copy, then let the user file it.
        const copyId = nanoid(10) as MediaId;
        const patch = await buildPatch(copyId);
        const newId = api.getState().duplicateWithEdits(item.id, { ...patch, id: copyId }, changes);
        api.getState().closeEditor();
        addToAlbumPicker([newId]);
      } else {
        const patch = await buildPatch(item.id);
        // Non-destructive save: preserve the original as v1 and append a new
        // version with an audit log of what changed instead of overwriting.
        api.getState().addVersion(item.id, patch, changes);
        api.getState().closeEditor();
      }
    } catch {
      // Bake/upload failed (e.g. cross-origin) — still record a version so history
      // is never lost. Copies still get their own 2-entry history via the fallback.
      if (asCopy) {
        const copyId = nanoid(10) as MediaId;
        const newId = api
          .getState()
          .duplicateWithEdits(item.id, { id: copyId, edits, editedAt: Date.now() }, changes);
        api.getState().closeEditor();
        addToAlbumPicker([newId]);
      } else {
        api.getState().addVersion(item.id, { edits, editedAt: Date.now() }, changes);
        api.getState().closeEditor();
      }
    } finally {
      setBaking(false);
    }
  };

  const cancel = () => {
    if (!isDirty()) {
      api.getState().closeEditor();
      return;
    }
    confirmAction({
      title: 'Discard changes?',
      message: 'Your edits to this photo have not been saved.',
      confirmLabel: 'Discard',
      danger: true,
      onConfirm: () => api.getState().closeEditor(),
    });
  };
  cancelRef.current = cancel;

  const revert = () => {
    clearAI();
    setEdits({ adjustments: {} });
  };

  const tabs: Tab[] = aiAvailable
    ? ['adjust', 'filters', 'crop', 'markup', 'ai']
    : ['adjust', 'filters', 'crop', 'markup'];
  const tabLabel = (t: Tab) =>
    t === 'adjust' ? 'Adjust' : t === 'filters' ? 'Filters' : t === 'crop' ? 'Crop' : t === 'markup' ? 'Markup' : 'AI';
  const previewSrc = aiResultUrl ?? item.src;

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
          <button
            type="button"
            className="apg-iconbtn"
            aria-label="Cancel"
            onClick={cancel}
          >
            <Icon name="close" />
          </button>
          <div style={{ fontWeight: 600 }}>Edit · {item.name}</div>
          <div style={{ flex: 1 }} />
          <button type="button" className="apg-btn" onClick={revert} disabled={baking}>
            Revert
          </button>
          <button
            type="button"
            className="apg-btn"
            onClick={() => void save(true)}
            disabled={baking || aiBusy}
            title="Save the result as a new photo (you choose the album)"
          >
            Save as Copy
          </button>
          <button
            type="button"
            className="apg-btn apg-btn--primary"
            onClick={() => void save(false)}
            disabled={baking || aiBusy}
            title="Overwrite this photo with your edits"
          >
            {baking ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="apg-editor__body">
          <div className="apg-editor__canvaswrap">
            <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
              <img
                src={previewSrc}
                alt={item.name}
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  maxHeight: '78vh',
                  borderRadius: 4,
                  filter: filterCss,
                  transform: transformCss,
                  transition: 'filter 0.08s linear',
                  // Checkerboard shows through transparent (background-removed) results.
                  background: aiResultUrl
                    ? 'repeating-conic-gradient(#3a3a3c 0% 25%, #2a2a2c 0% 50%) 50% / 20px 20px'
                    : undefined,
                }}
              />
              {tab !== 'crop' ? (
                <Annotations
                  annotations={annotations}
                  editable={tab === 'markup'}
                  tool={annTool}
                  color={annColor}
                  onChange={setAnnotations}
                />
              ) : null}
              {tab === 'crop' ? (
                <CropBox rect={cropRect} ratio={cropRatio} onChange={setCrop} />
              ) : null}
              {!aiResultUrl && tab !== 'crop' && adj.vignette > 0 ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    borderRadius: 4,
                    boxShadow: `inset 0 0 ${60 + adj.vignette * 140}px rgba(0,0,0,${(
                      adj.vignette * 0.8
                    ).toFixed(2)})`,
                  }}
                />
              ) : null}
              {aiBusy ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(0,0,0,0.45)',
                    borderRadius: 4,
                    color: '#fff',
                    gap: 10,
                    flexDirection: 'column',
                  }}
                >
                  <span className="apg-ai-spinner" style={{ width: 26, height: 26 }} />
                  <span style={{ fontSize: 13 }}>Generating…</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="apg-editor__panel">
            <div className="apg-editor__tabs">
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={['apg-editor__tab', tab === t ? 'apg-editor__tab--active' : ''].join(' ')}
                  onClick={() => setTab(t)}
                >
                  {tabLabel(t)}
                </button>
              ))}
            </div>

            {tab === 'adjust' ? (
              <div>
                {ADJUST_FIELDS.map((f) => (
                  <div className="apg-slider-row" key={f.key}>
                    <div className="apg-slider-row__head">
                      <span>{f.label}</span>
                      <span>{Math.round((adj[f.key] ?? 0) * 100)}</span>
                    </div>
                    <input
                      className="apg-slider"
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={adj[f.key] ?? 0}
                      onChange={(e) => setAdj(f.key, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {tab === 'filters' ? (
              <div className="apg-editor__filters">
                {Object.entries(FILTER_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    className={[
                      'apg-editor__filter',
                      edits.filter === key || (!edits.filter && key === 'original')
                        ? 'apg-editor__filter--active'
                        : '',
                    ].join(' ')}
                    onClick={() =>
                      setEdits((e) => ({ ...e, filter: key === 'original' ? undefined : key }))
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            ) : null}

            {tab === 'crop' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ color: '#9b9ba1', fontSize: 12, margin: 0 }}>
                  Drag the box to crop. Pick a ratio to lock the shape (a square stays square). Applied
                  when you press Save.
                </p>
                <div style={{ fontSize: 12, color: '#9b9ba1' }}>Aspect ratio</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {RATIOS.map((r) => (
                    <button
                      key={r.label}
                      type="button"
                      className={['apg-editor__tab', cropRatio === r.value ? 'apg-editor__tab--active' : ''].join(' ')}
                      onClick={() => pickRatio(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={['apg-editor__tab', cropRatio === imgAspect ? 'apg-editor__tab--active' : ''].join(' ')}
                    onClick={() => pickRatio(imgAspect)}
                  >
                    Original
                  </button>
                </div>
                {edits.crop ? (
                  <button
                    type="button"
                    className="apg-editor__tab"
                    onClick={() => {
                      setCropRatio(null);
                      setEdits((e) => ({ ...e, crop: undefined }));
                    }}
                  >
                    Reset Crop
                  </button>
                ) : null}
                <button
                  type="button"
                  className="apg-editor__tab"
                  onClick={() => setEdits((e) => ({ ...e, rotation: ((e.rotation ?? 0) + 90) % 360 }))}
                >
                  <Icon name="rotate" size={16} /> Rotate 90°
                </button>
                <button
                  type="button"
                  className="apg-editor__tab"
                  onClick={() => setEdits((e) => ({ ...e, flipH: !e.flipH }))}
                >
                  Flip Horizontal
                </button>
                <button
                  type="button"
                  className="apg-editor__tab"
                  onClick={() => setEdits((e) => ({ ...e, flipV: !e.flipV }))}
                >
                  Flip Vertical
                </button>
                <div className="apg-slider-row" style={{ marginTop: 8 }}>
                  <div className="apg-slider-row__head">
                    <span>Straighten</span>
                    <span>{Math.round(edits.straighten ?? 0)}°</span>
                  </div>
                  <input
                    className="apg-slider"
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={edits.straighten ?? 0}
                    onChange={(e) => setEdits((prev) => ({ ...prev, straighten: Number(e.target.value) }))}
                  />
                </div>
                {(edits.straighten ?? 0) !== 0 ? (
                  <button
                    type="button"
                    className="apg-editor__tab"
                    onClick={() => setEdits((e) => ({ ...e, straighten: 0 }))}
                  >
                    Reset Straighten
                  </button>
                ) : null}
                {provider?.estimateTilt ? (
                  <button
                    type="button"
                    className="apg-editor__tab"
                    disabled={tiltBusy}
                    onClick={() => void autoStraighten()}
                  >
                    <Icon name="wand" size={15} />{' '}
                    {tiltBusy ? 'Analyzing tilt…' : 'Auto-straighten (fix camera tilt)'}
                  </button>
                ) : null}
                {tiltError ? (
                  <p style={{ color: '#ff6b6b', fontSize: 12, margin: 0 }}>{tiltError}</p>
                ) : null}
              </div>
            ) : null}

            {tab === 'markup' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: '#9b9ba1', fontSize: 12, margin: 0 }}>
                  Draw shapes, arrows and measurements. Use <strong>Measure</strong> for a double‑arrow
                  with a centered label (e.g. “12 cm”). Pick a tool, then drag on the photo.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {ANN_TOOLS.map((t) => (
                    <button
                      key={t.tool}
                      type="button"
                      className={['apg-editor__tab', annTool === t.tool ? 'apg-editor__tab--active' : ''].join(' ')}
                      onClick={() => setAnnTool(t.tool)}
                    >
                      <Icon name={t.icon} size={15} /> {t.label}
                    </button>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#9b9ba1', marginBottom: 6 }}>Color</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {ANN_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Color ${c}`}
                        onClick={() => setAnnColor(c)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: c,
                          border: annColor === c ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
                          outline: annColor === c ? '2px solid var(--apg-accent)' : 'none',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="apg-editor__tab"
                    style={{ flex: 1 }}
                    disabled={annotations.length === 0}
                    onClick={() => setAnnotations(annotations.slice(0, -1))}
                  >
                    <Icon name="rotate" size={15} /> Undo
                  </button>
                  <button
                    type="button"
                    className="apg-editor__tab"
                    style={{ flex: 1 }}
                    disabled={annotations.length === 0}
                    onClick={() => setAnnotations([])}
                  >
                    <Icon name="trash" size={15} /> Clear
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#9b9ba1' }}>{annotations.length} annotation(s)</div>
              </div>
            ) : null}

            {tab === 'ai' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ color: '#9b9ba1', fontSize: 12, margin: '0 0 4px' }}>
                  Generative edits run through your configured AI backend. Results replace the photo when you press Save.
                </p>
                {AI_OPS.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className="apg-editor__tab"
                    disabled={aiBusy}
                    onClick={() => void runAI(a.op)}
                  >
                    <Icon name={a.icon} size={16} /> {a.label}
                  </button>
                ))}

                <div className="apg-slider-row" style={{ marginTop: 6 }}>
                  <div className="apg-slider-row__head">
                    <span>Edit strength</span>
                    <span>{Math.round(aiStrength * 100)}%</span>
                  </div>
                  <input
                    className="apg-slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={aiStrength}
                    disabled={aiBusy}
                    onChange={(e) => setAiStrength(Number(e.target.value))}
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      color: '#9b9ba1',
                      marginTop: 2,
                    }}
                  >
                    <span>Subtle</span>
                    <span>Strong</span>
                  </div>
                </div>

                <div style={{ marginTop: 6 }}>
                  <input
                    className="apg-modal__input"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.08)', color: '#fff', borderColor: 'rgba(255,255,255,0.15)' }}
                    placeholder="Describe an edit, e.g. 'make it golden hour'"
                    value={aiPrompt}
                    disabled={aiBusy}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && aiPrompt.trim()) void runAI({ type: 'prompt', prompt: aiPrompt.trim() });
                    }}
                  />
                  <button
                    type="button"
                    className="apg-btn apg-btn--primary"
                    style={{ width: '100%', marginTop: 8 }}
                    disabled={aiBusy || !aiPrompt.trim()}
                    onClick={() => void runAI({ type: 'prompt', prompt: aiPrompt.trim() })}
                  >
                    Apply Prompt
                  </button>
                </div>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                <p style={{ color: '#9b9ba1', fontSize: 12, margin: 0 }}>
                  Brush &amp; expand tools — inpaint / outpaint.
                </p>
                <button
                  type="button"
                  className="apg-editor__tab"
                  disabled={aiBusy}
                  onClick={() => setMaskMode('magic-eraser')}
                >
                  <Icon name="wand" size={16} /> Magic Eraser (remove an object)
                </button>
                <button
                  type="button"
                  className="apg-editor__tab"
                  disabled={aiBusy}
                  title="Paint an area, then it fills it — type a prompt above to control what appears (optional)"
                  onClick={() => setMaskMode('generative-fill')}
                >
                  <Icon name="image" size={16} /> Generative Fill (paint + prompt)
                </button>
                <button
                  type="button"
                  className="apg-editor__tab"
                  disabled={aiBusy}
                  onClick={() => void runAI({ type: 'outpaint', prompt: aiPrompt.trim() || undefined })}
                >
                  <Icon name="crop" size={16} /> Expand Image (Outpaint)
                </button>

                {aiResultUrl ? (
                  <button type="button" className="apg-editor__tab" onClick={clearAI} disabled={aiBusy}>
                    Discard AI result
                  </button>
                ) : null}
                {aiError ? (
                  <p style={{ color: '#ff6b6b', fontSize: 12 }}>{aiError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {maskMode ? (
          <MaskBrush
            src={item.src}
            aspect={imgAspect}
            title={
              maskMode === 'magic-eraser'
                ? 'Paint over what to remove'
                : 'Paint the area to replace (uses your prompt)'
            }
            onCancel={() => setMaskMode(null)}
            onApply={(mask) => {
              const m = maskMode;
              setMaskMode(null);
              if (m === 'generative-fill') {
                void runAI({ type: 'generative-fill', prompt: aiPrompt.trim() || 'fill naturally', mask });
              } else {
                void runAI({ type: 'magic-eraser', mask });
              }
            }}
          />
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}

function loadCrossOriginImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the image for editing.'));
    img.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read edited image.'));
    reader.readAsDataURL(blob);
  });
}
