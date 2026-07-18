'use client';

import { type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal focus management:
 *  - moves focus into the container when it opens,
 *  - traps Tab / Shift+Tab within it,
 *  - restores focus to the previously-focused element on close.
 * Optionally calls `onEscape` when Escape is pressed inside the container.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
      );

    // Move focus inside on open.
    const first = focusables()[0];
    if (first) first.focus();
    else {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscapeRef.current) {
        e.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0]!;
      const lastEl = list[list.length - 1]!;
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstEl || activeEl === container) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    container.addEventListener('keydown', onKey);
    return () => {
      container.removeEventListener('keydown', onKey);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
    // ref / onEscapeRef are stable; only re-run when open state flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
