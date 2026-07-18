'use client';

import { useEffect, useRef, useState } from 'react';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'move';

/**
 * Interactive crop overlay. Geometry is normalized (0..1) relative to the image
 * box. When `ratio` is set (pixel w:h), resizing keeps that aspect — so a 1:1
 * box stays square even as you drag. `ratio = null` is free-form.
 */
export function CropBox({
  rect,
  ratio,
  onChange,
}: {
  rect: CropRect;
  ratio: number | null;
  onChange: (r: CropRect) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const drag = useRef<{ handle: Handle; startRect: CropRect; startX: number; startY: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Normalized aspect (width:height in 0..1 space) for the target pixel ratio.
  const normAspect = ratio && box.w && box.h ? ratio * (box.h / box.w) : null;

  const pointer = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };

  const onDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pointer(e);
    drag.current = { handle, startRect: rect, startX: p.x, startY: p.y };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = pointer(e);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;

    if (d.handle === 'move') {
      const nx = clamp(d.startRect.x + dx, 0, 1 - d.startRect.width);
      const ny = clamp(d.startRect.y + dy, 0, 1 - d.startRect.height);
      onChange({ ...d.startRect, x: nx, y: ny });
      return;
    }

    // Corner resize: the opposite corner stays anchored.
    const s = d.startRect;
    const anchor = {
      x: d.handle === 'nw' || d.handle === 'sw' ? s.x + s.width : s.x,
      y: d.handle === 'nw' || d.handle === 'ne' ? s.y + s.height : s.y,
    };
    let cx = clamp01(p.x);
    let cy = clamp01(p.y);
    let w = Math.abs(cx - anchor.x);
    let h = Math.abs(cy - anchor.y);
    if (normAspect) {
      // Enforce aspect: derive the dimension pair from the dominant drag axis.
      if (w / (normAspect || 1) > h) h = w / normAspect;
      else w = h * normAspect;
      // Re-clamp so the box stays inside [0,1] without breaking aspect.
      const dirX = cx >= anchor.x ? 1 : -1;
      const dirY = cy >= anchor.y ? 1 : -1;
      const maxW = dirX > 0 ? 1 - anchor.x : anchor.x;
      const maxH = dirY > 0 ? 1 - anchor.y : anchor.y;
      if (w > maxW) {
        w = maxW;
        h = w / normAspect;
      }
      if (h > maxH) {
        h = maxH;
        w = h * normAspect;
      }
      cx = anchor.x + dirX * w;
      cy = anchor.y + dirY * h;
    }
    const x = Math.min(cx, anchor.x);
    const y = Math.min(cy, anchor.y);
    if (w < 0.04 || h < 0.04) return; // ignore degenerate boxes
    onChange({ x, y, width: w, height: h });
  };

  const onUp = () => {
    drag.current = null;
  };

  const pct = (v: number) => `${v * 100}%`;

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {/* Darken outside the crop region (4 masks). */}
      <div style={maskStyle({ left: 0, top: 0, width: '100%', height: pct(rect.y) })} />
      <div style={maskStyle({ left: 0, top: pct(rect.y + rect.height), width: '100%', bottom: 0 })} />
      <div style={maskStyle({ left: 0, top: pct(rect.y), width: pct(rect.x), height: pct(rect.height) })} />
      <div style={maskStyle({ left: pct(rect.x + rect.width), top: pct(rect.y), right: 0, height: pct(rect.height) })} />

      {/* Crop rectangle */}
      <div
        onPointerDown={onDown('move')}
        style={{
          position: 'absolute',
          left: pct(rect.x),
          top: pct(rect.y),
          width: pct(rect.width),
          height: pct(rect.height),
          border: '1px solid rgba(255,255,255,0.9)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
          cursor: 'move',
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)',
          backgroundSize: '33.33% 33.33%',
        }}
      >
        {(['nw', 'ne', 'sw', 'se'] as Handle[]).map((h) => (
          <div key={h} onPointerDown={onDown(h)} style={handleStyle(h)} />
        ))}
      </div>
    </div>
  );
}

function maskStyle(pos: Record<string, string | number>): React.CSSProperties {
  return { position: 'absolute', background: 'rgba(0,0,0,0.55)', pointerEvents: 'none', ...pos };
}

function handleStyle(h: Handle): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 16,
    height: 16,
    background: '#fff',
    borderRadius: '50%',
    boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
  };
  const off = -8;
  if (h === 'nw') return { ...base, left: off, top: off, cursor: 'nwse-resize' };
  if (h === 'ne') return { ...base, right: off, top: off, cursor: 'nesw-resize' };
  if (h === 'sw') return { ...base, left: off, bottom: off, cursor: 'nesw-resize' };
  return { ...base, right: off, bottom: off, cursor: 'nwse-resize' };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
