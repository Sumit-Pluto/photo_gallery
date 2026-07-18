'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { Icon, type IconName } from '../icons';

export interface MenuItem {
  type?: 'item';
  label: string;
  icon?: IconName;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
}
export interface MenuSeparator {
  type: 'separator';
}
export interface MenuLabel {
  type: 'label';
  label: string;
}
export type MenuEntry = MenuItem | MenuSeparator | MenuLabel;

interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

// Module-level emitter — typically one gallery is interactive at a time.
let current: MenuState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function openContextMenu(x: number, y: number, entries: MenuEntry[]) {
  current = { x, y, entries };
  emit();
}
export function closeContextMenu() {
  if (current) {
    current = null;
    emit();
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return current;
}

/** Renders the active context menu (mounted once near the gallery root). */
export function ContextMenuHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!state || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const pad = 8;
    const left = Math.min(state.x, window.innerWidth - rect.width - pad);
    const top = Math.min(state.y, window.innerHeight - rect.height - pad);
    setPos({ left: Math.max(pad, left), top: Math.max(pad, top) });
    // Move keyboard focus to the first actionable item when the menu opens.
    ref.current.querySelector<HTMLButtonElement>('button.apg-menu__item:not([disabled])')?.focus();
  }, [state]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>('button.apg-menu__item:not([disabled])') ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]!.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]!.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]!.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]!.focus();
    }
  };

  useEffect(() => {
    if (!state) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeContextMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    const onScroll = () => closeContextMenu();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [state]);

  if (!state) return null;

  return (
    <div
      ref={ref}
      className="apg-menu"
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onMenuKeyDown}
    >
      {state.entries.map((entry, i) => {
        if (entry.type === 'separator') return <div key={i} className="apg-menu__sep" />;
        if (entry.type === 'label')
          return (
            <div key={i} className="apg-menu__label">
              {entry.label}
            </div>
          );
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={['apg-menu__item', entry.danger ? 'apg-menu__item--danger' : '']
              .filter(Boolean)
              .join(' ')}
            disabled={entry.disabled}
            onClick={() => {
              closeContextMenu();
              entry.onClick();
            }}
          >
            {entry.icon ? (
              <span className="apg-menu__icon">
                <Icon name={entry.icon} size={16} />
              </span>
            ) : (
              <span className="apg-menu__icon" />
            )}
            <span>{entry.label}</span>
            {entry.checked ? (
              <span className="apg-menu__check">
                <Icon name="check" size={15} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
