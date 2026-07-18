'use client';

import { useEffect, useRef } from 'react';

import { useIsMobile } from '../hooks/useMediaQuery';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useGallery, useGalleryStoreApi } from '../store/context';
import { Sidebar } from './Sidebar';
import { SelectionBar } from './SelectionBar';
import { TopToolbar } from './TopToolbar';
import { ViewRouter } from './ViewRouter';

export function AppShell() {
  const api = useGalleryStoreApi();
  const sidebarOpen = useGallery((s) => s.sidebarOpen);
  const isMobile = useIsMobile();
  useKeyboardShortcuts();

  // Collapse the sidebar by default on phones; expand on larger screens.
  const lastMobile = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastMobile.current === isMobile) return;
    lastMobile.current = isMobile;
    api.getState().setSidebar(!isMobile);
  }, [isMobile, api]);

  return (
    <>
      <Sidebar />
      <div
        className={['apg-scrim', isMobile && sidebarOpen ? 'apg-scrim--show' : '']
          .filter(Boolean)
          .join(' ')}
        onClick={() => api.getState().setSidebar(false)}
      />
      <div className="apg-main">
        <TopToolbar />
        <div className="apg-viewport">
          <ViewRouter />
          <SelectionBar />
        </div>
      </div>
    </>
  );
}
