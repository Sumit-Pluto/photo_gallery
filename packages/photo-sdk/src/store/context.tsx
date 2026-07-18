'use client';

import { createContext, useContext } from 'react';
import { useStore } from 'zustand';

import type { GalleryState, GalleryStore } from './store';

export const GalleryStoreContext = createContext<GalleryStore | null>(null);

/** Access the raw store API (for imperative reads / subscriptions). */
export function useGalleryStoreApi(): GalleryStore {
  const store = useContext(GalleryStoreContext);
  if (!store) {
    throw new Error('useGallery must be used within a <PhotoGallery /> (GalleryProvider).');
  }
  return store;
}

/** Subscribe to a slice of gallery state. */
export function useGallery<T>(selector: (state: GalleryState) => T): T {
  const store = useGalleryStoreApi();
  return useStore(store, selector);
}
