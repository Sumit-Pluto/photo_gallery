'use client';

import { nanoid } from 'nanoid';
import { useEffect, useRef, useState } from 'react';

import type { Annotation, AnnotationShape } from '../../types';

export type AnnotationTool = AnnotationShape | 'select';

interface AnnotationsProps {
  annotations: Annotation[];
  editable?: boolean;
  tool?: AnnotationTool;
  color?: string;
  strokeWidth?: number;
  onChange?: (next: Annotation[]) => void;
}

/**
 * SVG markup overlay. Renders (and, when editable, lets you draw) rectangles,
 * ellipses, lines, arrows, double-arrows with a centered measurement label,
 * text and freehand strokes. Geometry is stored normalized (0..1) so it scales
 * with the image. Read-only mode (editable=false) ignores pointer events.
 */
export function Annotations({
  annotations,
  editable = false,
  tool = 'select',
  color = '#ff3b30',
  strokeWidth = 3,
  onChange,
}: AnnotationsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const norm = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  };

  const commit = (next: Annotation[]) => onChange?.(next);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable || tool === 'select') return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = norm(e);
    drawing.current = true;
    const base: Annotation = {
      id: nanoid(8),
      shape: tool,
      color,
      strokeWidth,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
    };
    if (tool === 'freehand') base.points = [{ x: p.x, y: p.y }];
    if (tool === 'text') {
      // Place immediately and open the inline editor.
      base.text = '';
      commit([...annotations, base]);
      setEditingId(base.id);
      drawing.current = false;
      return;
    }
    setDraft(base);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !draft) return;
    const p = norm(e);
    setDraft((d) =>
      d
        ? {
            ...d,
            x2: p.x,
            y2: p.y,
            points: d.shape === 'freehand' ? [...(d.points ?? []), { x: p.x, y: p.y }] : d.points,
          }
        : d,
    );
  };

  const onPointerUp = () => {
    if (!drawing.current || !draft) return;
    drawing.current = false;
    const moved = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 0.01 || draft.shape === 'freehand';
    if (moved) {
      commit([...annotations, draft]);
      if (draft.shape === 'double-arrow') {
        draft.text = '';
        setEditingId(draft.id);
      }
    }
    setDraft(null);
  };

  const updateText = (id: string, text: string) =>
    commit(annotations.map((a) => (a.id === id ? { ...a, text } : a)));

  const finishEditing = (id: string) => {
    const a = annotations.find((x) => x.id === id);
    if (a && a.shape === 'text' && !a.text?.trim()) commit(annotations.filter((x) => x.id !== id));
    setEditingId(null);
  };

  const all = draft ? [...annotations, draft] : annotations;
  const editingAnn = editingId ? annotations.find((a) => a.id === editingId) : null;

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        cursor: editable && tool !== 'select' ? 'crosshair' : 'default',
        pointerEvents: editable ? 'auto' : 'none',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {size.w > 0 ? (
        <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0 }}>
          {all.map((a) => (
            <Shape key={a.id} a={a} w={size.w} h={size.h} />
          ))}
        </svg>
      ) : null}

      {editable && editingAnn ? (
        <input
          autoFocus
          value={editingAnn.text ?? ''}
          onChange={(e) => updateText(editingAnn.id, e.target.value)}
          onBlur={() => finishEditing(editingAnn.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') finishEditing(editingAnn.id);
          }}
          placeholder={editingAnn.shape === 'double-arrow' ? 'e.g. 12 cm' : 'Text'}
          style={{
            position: 'absolute',
            left: `${((editingAnn.x1 + (editingAnn.shape === 'double-arrow' ? editingAnn.x2 : editingAnn.x1)) / 2) * 100}%`,
            top: `${((editingAnn.y1 + (editingAnn.shape === 'double-arrow' ? editingAnn.y2 : editingAnn.y1)) / 2) * 100}%`,
            transform: 'translate(-50%, -50%)',
            font: '600 14px system-ui, sans-serif',
            color: editingAnn.color,
            background: 'rgba(255,255,255,0.95)',
            border: `2px solid ${editingAnn.color}`,
            borderRadius: 6,
            padding: '2px 6px',
            minWidth: 60,
            outline: 'none',
            zIndex: 2,
          }}
        />
      ) : null}
    </div>
  );
}

function Shape({ a, w, h }: { a: Annotation; w: number; h: number }) {
  const x1 = a.x1 * w;
  const y1 = a.y1 * h;
  const x2 = a.x2 * w;
  const y2 = a.y2 * h;
  const common = { stroke: a.color, strokeWidth: a.strokeWidth, fill: 'none' as const };
  const headSize = 9 + a.strokeWidth * 2;

  switch (a.shape) {
    case 'rect':
      return (
        <rect
          x={Math.min(x1, x2)}
          y={Math.min(y1, y2)}
          width={Math.abs(x2 - x1)}
          height={Math.abs(y2 - y1)}
          rx={4}
          {...common}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          cx={(x1 + x2) / 2}
          cy={(y1 + y2) / 2}
          rx={Math.abs(x2 - x1) / 2}
          ry={Math.abs(y2 - y1) / 2}
          {...common}
        />
      );
    case 'line':
      return <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} strokeLinecap="round" />;
    case 'arrow':
      return (
        <g>
          <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} strokeLinecap="round" />
          <polygon points={arrowHead(x1, y1, x2, y2, headSize)} fill={a.color} />
        </g>
      );
    case 'double-arrow':
      return (
        <g>
          <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} strokeLinecap="round" />
          <polygon points={arrowHead(x2, y2, x1, y1, headSize)} fill={a.color} />
          <polygon points={arrowHead(x1, y1, x2, y2, headSize)} fill={a.color} />
          {a.text ? (
            <text
              x={(x1 + x2) / 2}
              y={(y1 + y2) / 2 - 6}
              fill={a.color}
              stroke="#fff"
              strokeWidth={3}
              paintOrder="stroke"
              textAnchor="middle"
              style={{ font: '700 15px system-ui, sans-serif' }}
            >
              {a.text}
            </text>
          ) : null}
        </g>
      );
    case 'text':
      return a.text ? (
        <text
          x={x1}
          y={y1}
          fill={a.color}
          stroke="#fff"
          strokeWidth={3}
          paintOrder="stroke"
          dominantBaseline="middle"
          style={{ font: '700 16px system-ui, sans-serif' }}
        >
          {a.text}
        </text>
      ) : null;
    case 'freehand':
      return (
        <polyline
          points={(a.points ?? []).map((p) => `${p.x * w},${p.y * h}`).join(' ')}
          {...common}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    default:
      return null;
  }
}

/** Triangle polygon for an arrowhead pointing from (fx,fy) toward (tx,ty). */
function arrowHead(fx: number, fy: number, tx: number, ty: number, size: number): string {
  const ang = Math.atan2(ty - fy, tx - fx);
  const a1 = ang + Math.PI - 0.45;
  const a2 = ang + Math.PI + 0.45;
  const p1 = `${tx},${ty}`;
  const p2 = `${tx + size * Math.cos(a1)},${ty + size * Math.sin(a1)}`;
  const p3 = `${tx + size * Math.cos(a2)},${ty + size * Math.sin(a2)}`;
  return `${p1} ${p2} ${p3}`;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
