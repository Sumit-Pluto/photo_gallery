'use client';

import { type ReactNode, useEffect, useRef, useSyncExternalStore } from 'react';

import { useFocusTrap } from '../hooks/useFocusTrap';

// Module-level modal emitter (mirrors the context-menu host pattern).
let current: ReactNode | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openModal(node: ReactNode) {
  current = node;
  emit();
}
export function closeModal() {
  current = null;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function ModalHost() {
  const node = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, Boolean(node), closeModal);

  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [node]);

  if (!node) return null;
  return (
    <div
      ref={ref}
      className="apg-modal__backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      {node}
    </div>
  );
}
