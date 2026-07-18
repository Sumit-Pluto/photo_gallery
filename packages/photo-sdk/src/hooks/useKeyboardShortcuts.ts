'use client';

import { useEffect } from 'react';

import { useGalleryStoreApi } from '../store/context';
import { mediaForView } from '../store/selectors';

/** Wire Apple-Photos-style global keyboard shortcuts. */
export function useKeyboardShortcuts() {
  const api = useGalleryStoreApi();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Never hijack typing in inputs / editable fields.
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const state = api.getState();
      const selection = [...state.selection];
      const meta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+A — select all in the current view.
      if (meta && (e.key === 'a' || e.key === 'A')) {
        if (state.lightboxId || state.editorId) return;
        e.preventDefault();
        const ids = mediaForView(state).map((m) => m.id);
        state.selectMany(ids);
        return;
      }

      // Delete / Backspace — trash (or permanently delete in the bin).
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
        e.preventDefault();
        if (state.view === 'recently-deleted') state.deletePermanently(selection);
        else state.trash(selection);
        return;
      }

      // F — toggle favourite.
      if ((e.key === 'f' || e.key === 'F') && !meta && selection.length) {
        e.preventDefault();
        state.toggleFavorite(selection);
        return;
      }

      // Escape — clear selection / focus.
      if (e.key === 'Escape') {
        if (state.objectFocus) state.setObjectFocus(null);
        else if (state.selection.size) state.clearSelection();
      }

      // Enter / Space — open the (single) selection in the lightbox.
      if ((e.key === 'Enter' || e.key === ' ') && selection.length === 1 && !state.lightboxId) {
        e.preventDefault();
        state.openLightbox(selection[0]!);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api]);
}
