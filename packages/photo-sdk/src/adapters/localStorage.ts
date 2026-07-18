import { STORAGE_KEY } from '../constants';
import { normalizeMediaItem } from '../lib/media';
import type { Album, MediaItem } from '../types';
import type { PersistedState, StorageAdapter } from './types';

const CURRENT_VERSION = 1;

/**
 * Default zero-config adapter. Persists library metadata to localStorage and
 * (optionally) binary blobs to IndexedDB so imported files survive reloads.
 *
 * Safe under SSR: all browser APIs are guarded with `typeof window` checks.
 */
export function createLocalStorageAdapter(key: string = STORAGE_KEY): StorageAdapter {
  const hasWindow = typeof window !== 'undefined';

  return {
    name: 'localStorage',

    async load(): Promise<PersistedState | null> {
      if (!hasWindow) return null;
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PersistedState;
        if (!parsed || typeof parsed !== 'object') return null;
        // Field-level validation — never trust persisted data blindly. Every media
        // item is re-normalized (URL scheme allow-list, string coercion) so a
        // tampered localStorage record cannot inject unsafe values into the UI.
        const media: MediaItem[] = Array.isArray(parsed.media)
          ? parsed.media
              .map((m) => normalizeMediaItem(m))
              .filter((m): m is MediaItem => m !== null)
          : [];
        const albums: Album[] = Array.isArray(parsed.albums)
          ? parsed.albums
              .filter((a): a is Album => Boolean(a) && typeof a === 'object')
              .map((a) => ({
                ...a,
                name: typeof a.name === 'string' ? a.name : 'Album',
                mediaIds: Array.isArray(a.mediaIds)
                  ? a.mediaIds.filter((id): id is string => typeof id === 'string')
                  : [],
              }))
          : [];
        return {
          media,
          albums,
          people: Array.isArray(parsed.people) ? parsed.people : [],
          version: typeof parsed.version === 'number' ? parsed.version : CURRENT_VERSION,
        };
      } catch {
        return null;
      }
    },

    async save(state: PersistedState): Promise<void> {
      if (!hasWindow) return;
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify({ ...state, version: CURRENT_VERSION }),
        );
      } catch {
        // Quota exceeded or storage disabled — fail silently, app still works in-memory.
      }
    },

    async putBlob(id: string, blob: Blob): Promise<string> {
      if (!hasWindow) return '';
      const db = await openBlobDb();
      if (!db) return URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return URL.createObjectURL(blob);
    },

    async clear(): Promise<void> {
      if (!hasWindow) return;
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* noop */
      }
    },
  };
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openBlobDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const req = indexedDB.open('photo-gallery-sdk-blobs', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}
