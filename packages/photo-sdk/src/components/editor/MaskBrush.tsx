'use client';

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

import { Icon } from '../../icons';

/**
 * Full-screen brush overlay for masked AI edits (Magic Eraser / Generative Fill).
 * The user paints over a region; on Apply we emit a binary ImageData mask where
 * painted pixels are WHITE (regenerate) and everything else is BLACK (keep) —
 * exactly what the inpaint backend expects (see maskToBase64 / rpInpaint).
 *
 * The paint canvas is sized to the image's aspect ratio (long side = BASE), then
 * scaled with CSS to fit the viewport, so the returned mask lines up with the
 * photo regardless of screen size.
 */
const BASE = 640;

export function MaskBrush({
  src,
  aspect,
  title,
  onCancel,
  onApply,
}: {
  src: string;
  aspect: number; // width / height
  title: string;
  onCancel: () => void;
  onApply: (mask: ImageData) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [brush, setBrush] = useState(48);
  const [dirty, setDirty] = useState(false);

  const cw = aspect >= 1 ? BASE : Math.round(BASE * aspect);
  const ch = aspect >= 1 ? Math.round(BASE / aspect) : BASE;

  // Escape cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;

  const toCanvas = (e: ReactPointerEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };

  const paintTo = (x: number, y: number) => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = 'rgba(255,60,60,0.55)';
    c.strokeStyle = 'rgba(255,60,60,0.55)';
    c.lineWidth = brush;
    c.lineCap = 'round';
    const last = lastRef.current;
    if (last) {
      c.beginPath();
      c.moveTo(last.x, last.y);
      c.lineTo(x, y);
      c.stroke();
    }
    c.beginPath();
    c.arc(x, y, brush / 2, 0, Math.PI * 2);
    c.fill();
    lastRef.current = { x, y };
  };

  const onDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    paintingRef.current = true;
    lastRef.current = null;
    const p = toCanvas(e);
    paintTo(p.x, p.y);
    setDirty(true);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!paintingRef.current) return;
    const p = toCanvas(e);
    paintTo(p.x, p.y);
  };
  const onUp = () => {
    paintingRef.current = false;
    lastRef.current = null;
  };

  const clear = () => {
    const c = ctx();
    if (c && canvasRef.current) c.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setDirty(false);
  };

  const apply = () => {
    const c = ctx();
    const canvas = canvasRef.current;
    if (!c || !canvas) return;
    const painted = c.getImageData(0, 0, canvas.width, canvas.height);
    // Binarize: any painted (alpha) pixel → opaque white, else opaque black.
    const out = new ImageData(canvas.width, canvas.height);
    for (let i = 0; i < painted.data.length; i += 4) {
      const on = painted.data[i + 3]! > 10;
      const v = on ? 255 : 0;
      out.data[i] = v;
      out.data[i + 1] = v;
      out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
    onApply(out);
  };

  return (
    <div className="apg-maskbrush" role="dialog" aria-label={title}>
      <div className="apg-maskbrush__title">{title}</div>
      <div className="apg-maskbrush__stage" style={{ aspectRatio: `${cw} / ${ch}` }}>
        <img className="apg-maskbrush__img" src={src} alt="" draggable={false} />
        <canvas
          ref={canvasRef}
          width={cw}
          height={ch}
          className="apg-maskbrush__canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        />
      </div>
      <div className="apg-maskbrush__bar">
        <label className="apg-maskbrush__brush">
          Brush
          <input
            type="range"
            min={12}
            max={120}
            step={2}
            value={brush}
            onChange={(e) => setBrush(Number(e.target.value))}
          />
        </label>
        <button type="button" className="apg-btn apg-btn--small" onClick={clear} disabled={!dirty}>
          <Icon name="trash" size={14} /> Clear
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" className="apg-btn apg-btn--small" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="apg-btn apg-btn--primary apg-btn--small"
          onClick={apply}
          disabled={!dirty}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
