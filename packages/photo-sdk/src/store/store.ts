import { nanoid } from 'nanoid';
import { createStore } from 'zustand/vanilla';

import type { StorageAdapter } from '../adapters/types';
import type { AIProvider } from '../ai/types';
import { DEFAULT_ZOOM_INDEX, GRID_ZOOM_STEPS, PET_LABELS, TRASH_RETENTION_MS } from '../constants';
import { clusterFaces } from '../lib/cluster';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { blobToDataUrl, mediaFromFile } from '../lib/media';
import { defaultSystemAlbums, objectSmartAlbums } from '../lib/smartAlbums';
import type {
  Album,
  AlbumId,
  EditState,
  LibraryScale,
  MapMode,
  MediaComment,
  MediaId,
  MediaItem,
  MediaVersion,
  Person,
  PersonId,
  ShareRecord,
  ResolvedTheme,
  ThemePreference,
  ViewId,
} from '../types';

export type GridFilter =
  | 'all'
  | 'favourites'
  | 'edited'
  | 'photos'
  | 'videos'
  | 'screenshots'
  | 'not-in-album';

export interface GalleryFeatures {
  editor: boolean;
  camera: boolean;
  ai: boolean;
  map: boolean;
  import: boolean;
  export: boolean;
  sharing: boolean;
}

export const DEFAULT_FEATURES: GalleryFeatures = {
  editor: true,
  camera: true,
  ai: true,
  map: true,
  import: true,
  export: true,
  sharing: true,
};

/**
 * Optional per-theme visual overrides. Any value may be a solid color, an rgba()
 * (for opacity), or a CSS gradient string. Light values apply in light + semi-dark
 * (content), dark values in dark mode (and the semi-dark sidebar).
 */
export interface ThemeTokens {
  /** Main app / content background. */
  bgLight?: string;
  bgDark?: string;
  /** Raised surfaces (cards, elevated panels). */
  elevatedLight?: string;
  elevatedDark?: string;
  /** Sidebar glass backdrop. */
  sidebarBgLight?: string;
  sidebarBgDark?: string;
  /** Primary text color. */
  textLight?: string;
  textDark?: string;
  /** Sidebar corner radius in px. */
  sidebarRadius?: number;
  /** Accent color (overrides `accentColor`). */
  accent?: string;
}

export interface GalleryConfig {
  features: GalleryFeatures;
  accentColor: string;
  /** Base corner radius in px (drives all rounded UI). */
  borderRadius: number;
  showWindowChrome: boolean;
  title: string;
  /** Optional theme-token overrides mapped to CSS variables at runtime. */
  themeTokens?: ThemeTokens;
}

export interface GalleryState {
  ready: boolean;
  config: GalleryConfig;

  media: MediaItem[];
  albums: Album[];
  people: Person[];
  /**
   * User's permanent object-tag renames. Key = canonical lowercased detector
   * label (e.g. "car"), value = the label the user renamed it to ("excavator").
   * Persisted, applied to future uploads, and resolved wherever labels are grouped.
   */
  labelAliases: Record<string, string>;
  /** Object/material tags the user deleted — stripped from photos + hidden from future detection. */
  deletedLabels: string[];

  // Navigation / view
  view: ViewId;
  libraryScale: LibraryScale;
  mapMode: MapMode;
  gridFilter: GridFilter;
  searchQuery: string;
  /** Recently opened media ids (most-recent first; in-memory, capped). */
  recentlyViewed: MediaId[];
  /** Active quick search preset (from the search dropdown). */
  searchPreset: 'viewed' | 'edited' | 'added' | null;
  /** Semantic (CLIP) ranking for the current query — media ids best-match first.
   * Computed async by the SemanticSearch worker; null = not computed / not applicable. */
  semanticResults: MediaId[] | null;

  // Appearance
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  sidebarOpen: boolean;
  zoomIndex: number;

  // Selection / overlays
  selection: Set<MediaId>;
  lastSelected: MediaId | null;
  lightboxId: MediaId | null;
  editorId: MediaId | null;
  /** When set, the grid filters to items containing this object label. */
  objectFocus: string | null;
  /** When set, the grid filters to items with this tag (shown date-grouped). */
  tagFocus: string | null;
  /** When set, the grid filters to items containing this person (from People). */
  personFocus: PersonId | null;
  /** When set, the Map view centers here. */
  mapFocus: { lat: number; lng: number } | null;

  // AI analysis status
  aiAvailable: boolean;
  aiStatus: { running: boolean; done: number; total: number };

  /** Whether the Info panel (metadata + mini-map) is open. */
  infoOpen: boolean;
  /** Whether the custom camera is open. */
  cameraOpen: boolean;

  /** Client-side lock for the Recently Deleted view (hash persisted in localStorage). */
  lock: { hash: string | null };
  /** Whether the lock has been opened this session (in-memory, never persisted). */
  lockUnlocked: boolean;
  /** Share records created on this device (persisted in localStorage). */
  shares: ShareRecord[];

  // ---- actions ----
  init: (adapter: StorageAdapter, ai: AIProvider | null) => Promise<void>;
  addMedia: (items: MediaItem[]) => void;
  /** Import File objects: builds MediaItems, uploads blobs to the adapter if it supports it. */
  importFiles: (files: FileList | File[], albumId?: AlbumId) => Promise<MediaId[]>;
  /** Upload a blob via the adapter (e.g. camera capture). Returns a durable URL or null. */
  uploadBlob: (id: MediaId, blob: Blob) => Promise<string | null>;
  updateMedia: (id: MediaId, patch: Partial<MediaItem>) => void;
  trash: (ids: MediaId[]) => void;
  restore: (ids: MediaId[]) => void;
  deletePermanently: (ids: MediaId[]) => void;
  emptyTrash: () => void;
  toggleFavorite: (ids: MediaId[]) => void;
  setHidden: (ids: MediaId[], hidden: boolean) => void;

  createAlbum: (name: string, kind?: Album['kind'], parentId?: AlbumId) => AlbumId;
  renameAlbum: (id: AlbumId, name: string) => void;
  deleteAlbum: (id: AlbumId) => void;
  addToAlbum: (albumId: AlbumId, ids: MediaId[]) => void;
  removeFromAlbum: (albumId: AlbumId, ids: MediaId[]) => void;
  moveToAlbum: (fromAlbumId: AlbumId, toAlbumId: AlbumId, ids: MediaId[]) => void;
  duplicateAlbum: (id: AlbumId) => void;
  setAlbumCover: (albumId: AlbumId, mediaId: MediaId) => void;

  applyEdit: (id: MediaId, edits: EditState) => void;
  /** Create a NEW media item cloned from `sourceId` with `patch` applied (used by
   * the editor's "Save as Copy"). Returns the new id. Pass `patch.id` to control it. */
  duplicateWithEdits: (sourceId: MediaId, patch: Partial<MediaItem>, changes?: string[]) => MediaId;
  /** Append a new version (preserving the original as v1) instead of overwriting. */
  addVersion: (id: MediaId, patch: Partial<MediaItem>, changes: string[]) => void;
  /** Make an earlier version the current one (records a "Restored" audit entry). */
  restoreVersion: (id: MediaId, versionId: string) => void;
  /** Add / remove a comment on a photo or video. */
  addComment: (id: MediaId, text: string, author?: string) => void;
  deleteComment: (id: MediaId, commentId: string) => void;

  setView: (view: ViewId) => void;
  setLibraryScale: (scale: LibraryScale) => void;
  setMapMode: (mode: MapMode) => void;
  setGridFilter: (filter: GridFilter) => void;
  setSearch: (q: string) => void;
  setSearchPreset: (preset: 'viewed' | 'edited' | 'added' | null) => void;
  setSemanticResults: (ids: MediaId[] | null) => void;
  setObjectFocus: (label: string | null) => void;
  setTagFocus: (tag: string | null) => void;
  setPersonFocus: (id: PersonId | null) => void;
  /** Re-cluster all detected faces into People + group pets (called after AI analysis). */
  rebuildPeople: () => void;
  /** Regenerate the auto "one smart album per detected object" set from current labels. */
  syncObjectAlbums: () => void;
  /** Rename a person/pet group (empty name clears it back to unnamed). */
  renamePerson: (id: PersonId, name: string) => void;
  /**
   * Permanently rename a detected object tag (e.g. "car" → "excavator"). Records a
   * persisted alias, backfills existing items' objectLabels, and rebuilds object
   * albums so the rename applies to past photos and every future upload.
   */
  renameLabel: (from: string, to: string) => void;
  /** Permanently delete an object/material tag (removes it from photos + future detections). */
  deleteLabel: (label: string) => void;

  // Recently Deleted lock
  setLockPassword: (password: string) => Promise<void>;
  removeLockPassword: () => void;
  unlockLock: (password: string) => Promise<boolean>;
  relock: () => void;

  // Sharing
  createShare: (scope: ShareRecord['scope'], mediaIds: MediaId[], albumId?: AlbumId) => ShareRecord;
  revokeShare: (id: string) => void;
  focusMap: (loc: { lat: number; lng: number } | null) => void;
  setAiStatus: (patch: Partial<GalleryState['aiStatus']>) => void;
  toggleInfo: () => void;
  setInfoOpen: (open: boolean) => void;
  openCamera: () => void;
  closeCamera: () => void;

  setTheme: (theme: ThemePreference) => void;
  setResolvedTheme: (t: ResolvedTheme) => void;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (index: number) => void;

  select: (id: MediaId, opts?: { additive?: boolean; range?: boolean; orderedIds?: MediaId[] }) => void;
  selectOnly: (id: MediaId) => void;
  selectMany: (ids: MediaId[]) => void;
  clearSelection: () => void;

  openLightbox: (id: MediaId) => void;
  closeLightbox: () => void;
  openEditor: (id: MediaId) => void;
  closeEditor: () => void;
}

export type GalleryStore = ReturnType<typeof createGalleryStore>;

export interface CreateStoreOptions {
  config: GalleryConfig;
  initialMedia?: MediaItem[];
  initialAlbums?: Album[];
  initialPeople?: Person[];
}

/** localStorage keys for small client-only settings (lock hash + share records).
 * These are intentionally device-local, not pushed to the shared backend. */
const LOCK_KEY = 'apg:lock-hash';
const SHARES_KEY = 'apg:shares';

function lsGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — non-fatal */
  }
}
function readShares(): ShareRecord[] {
  const raw = lsGet(SHARES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ShareRecord[]) : [];
  } catch {
    return [];
  }
}

export function createGalleryStore(options: CreateStoreOptions) {
  // Non-reactive references kept out of state.
  let adapter: StorageAdapter | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const store = createStore<GalleryState>((set, get) => {
    const persist = () => {
      if (!adapter) return;
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        const { media, albums, people, labelAliases, deletedLabels } = get();
        // Only persist user-owned albums; smart/system albums are regenerated.
        const userAlbums = albums.filter((a) => !a.system);
        void adapter!.save({ media, albums: userAlbums, people, labelAliases, deletedLabels, version: 1 });
      }, 400);
    };

    const now = Date.now();

    return {
      ready: false,
      config: options.config,
      media: options.initialMedia ?? [],
      albums: [...defaultSystemAlbums(now), ...(options.initialAlbums ?? [])],
      people: options.initialPeople ?? [],
      labelAliases: {},
      deletedLabels: [],

      view: 'library',
      libraryScale: 'all',
      mapMode: 'satellite',
      gridFilter: 'all',
      searchQuery: '',
      recentlyViewed: [],
      searchPreset: null,
      semanticResults: null,

      theme: 'system',
      resolvedTheme: 'light',
      sidebarOpen: true,
      zoomIndex: DEFAULT_ZOOM_INDEX,

      selection: new Set<MediaId>(),
      lastSelected: null,
      lightboxId: null,
      editorId: null,
      objectFocus: null,
      tagFocus: null,
      personFocus: null,
      mapFocus: null,

      aiAvailable: false,
      aiStatus: { running: false, done: 0, total: 0 },
      infoOpen: false,
      cameraOpen: false,
      lock: { hash: lsGet(LOCK_KEY) },
      lockUnlocked: false,
      shares: readShares(),

      async init(a, ai) {
        adapter = a;
        const loaded = await a.load();
        const ts = Date.now();
        if (loaded) {
          // Backend is the SINGLE SOURCE OF TRUTH: show exactly what it returns
          // (fixes "some images missing / stale on refresh"). The only exception is
          // a genuinely-empty backend on first run, which we seed once from the
          // demo `initialMedia` so a fresh install isn't blank.
          const seed = get().media;
          const seedEmptyBackend = loaded.media.length === 0 && seed.length > 0;
          set({
            media: seedEmptyBackend ? seed : loaded.media,
            albums: [...defaultSystemAlbums(ts), ...loaded.albums.filter((al) => !al.system)],
            people: loaded.people ?? [],
            labelAliases: loaded.labelAliases ?? {},
            deletedLabels: loaded.deletedLabels ?? [],
            ready: true,
            aiAvailable: Boolean(ai),
          });
          if (seedEmptyBackend) persist(); // write the seed into the empty backend once
        } else {
          set({ ready: true, aiAvailable: Boolean(ai) });
          persist();
        }
        // Recycle-bin retention: permanently remove items trashed > 30 days ago.
        const cutoff = Date.now() - TRASH_RETENTION_MS;
        const expired = get()
          .media.filter((m) => m.deletedAt && m.deletedAt < cutoff)
          .map((m) => m.id);
        if (expired.length) get().deletePermanently(expired);
        // Build object smart albums for an already-analyzed library (works even when
        // AI is disabled — labels persisted from a prior session still group).
        get().syncObjectAlbums();
      },

      addMedia(items) {
        if (!items.length) return;
        set((s) => ({ media: [...items, ...s.media] }));
        // Auto-file captures/imports into source albums (created on first use).
        const categories: Array<[string, string]> = [
          ['Camera', 'camera'],
          ['Screenshots', 'screenshot'],
        ];
        for (const [name, src] of categories) {
          const ids = items.filter((i) => i.source === src).map((i) => i.id);
          if (!ids.length) continue;
          const existing = get().albums.find((a) => a.kind === 'user' && a.name === name);
          const albumId = existing ? existing.id : get().createAlbum(name);
          get().addToAlbum(albumId, ids);
        }
        persist();
      },

      async importFiles(files, albumId) {
        const arr = Array.from(files as ArrayLike<File>);
        const items: MediaItem[] = [];
        for (const f of arr) {
          // mediaFromFile validates the type (image/video allow-list) and returns
          // null for anything else — the backend validation for uploads.
          const item = await mediaFromFile(f);
          if (!item) continue;
          const objectUrl = item.src; // blob: URL from mediaFromFile (dies on reload)
          // Upload to the backend (if the adapter supports blobs) for a durable URL.
          if (adapter?.putBlob) {
            try {
              const url = await adapter.putBlob(item.id, f);
              if (url) {
                item.src = url;
                item.thumbnail = undefined;
              }
            } catch {
              /* fall through to the data-URL fallback below */
            }
          }
          // Never PERSIST a bare blob: URL — it's invalid after a page reload. If we
          // didn't get a durable backend URL (no adapter, upload failed, or the adapter
          // itself returns a blob: URL), inline the bytes as a durable data: URL so the
          // imported media survives a reload. (Supabase returns a short https URL here.)
          if (item.src.startsWith('blob:')) {
            try {
              item.src = await blobToDataUrl(f);
              item.thumbnail = undefined;
              if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
            } catch {
              /* keep the object URL as an absolute last resort */
            }
          }
          items.push(item);
        }
        if (items.length) {
          // addMedia auto-files by source (Camera / Screenshots); AIAnalyzer then
          // tags objects/faces/OCR/embeddings in the background.
          get().addMedia(items);
          if (albumId) get().addToAlbum(albumId, items.map((i) => i.id));
          // Surface the just-uploaded photo with its Info panel open, so the user
          // watches the analysis run + sees its results without hunting for it.
          set({ infoOpen: true, selection: new Set([items[0]!.id]) });
        }
        return items.map((i) => i.id);
      },

      async uploadBlob(id, blob) {
        if (adapter?.putBlob) {
          try {
            return await adapter.putBlob(id, blob);
          } catch {
            return null;
          }
        }
        return null;
      },

      updateMedia(id, patch) {
        set((s) => ({ media: s.media.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
        persist();
      },

      trash(ids) {
        const set_ = new Set(ids);
        const ts = Date.now();
        set((s) => ({
          media: s.media.map((m) => (set_.has(m.id) ? { ...m, deletedAt: ts } : m)),
          selection: new Set(),
        }));
        persist();
      },

      restore(ids) {
        const set_ = new Set(ids);
        set((s) => ({
          media: s.media.map((m) =>
            set_.has(m.id) ? { ...m, deletedAt: undefined } : m,
          ),
          selection: new Set(),
        }));
        persist();
      },

      deletePermanently(ids) {
        const set_ = new Set(ids);
        set((s) => ({
          media: s.media.filter((m) => !set_.has(m.id)),
          albums: s.albums.map((a) => ({
            ...a,
            mediaIds: a.mediaIds.filter((mid) => !set_.has(mid)),
          })),
          selection: new Set(),
        }));
        persist();
      },

      emptyTrash() {
        set((s) => ({ media: s.media.filter((m) => !m.deletedAt), selection: new Set() }));
        persist();
      },

      toggleFavorite(ids) {
        const set_ = new Set(ids);
        // If any selected item is not a favourite, favourite all; else unfavourite.
        const anyOff = get().media.some((m) => set_.has(m.id) && !m.favorite);
        set((s) => ({
          media: s.media.map((m) => (set_.has(m.id) ? { ...m, favorite: anyOff } : m)),
        }));
        persist();
      },

      setHidden(ids, hidden) {
        const set_ = new Set(ids);
        set((s) => ({ media: s.media.map((m) => (set_.has(m.id) ? { ...m, hidden } : m)) }));
        persist();
      },

      createAlbum(name, kind = 'user', parentId) {
        const id = `album:${nanoid(8)}`;
        const album: Album = {
          id,
          name: name.trim() || 'Untitled Album',
          kind,
          parentId,
          mediaIds: [],
          createdAt: Date.now(),
        };
        set((s) => ({ albums: [...s.albums, album] }));
        persist();
        return id;
      },

      addVersion(id, patch, changes) {
        const now = Date.now();
        set((s) => ({
          media: s.media.map((m) => {
            if (m.id !== id) return m;
            // Seed v1 = the ORIGINAL (the current pre-edit snapshot) on first edit.
            const base: MediaVersion[] =
              m.versions && m.versions.length
                ? m.versions
                : [
                    {
                      id: nanoid(8),
                      version: 1,
                      createdAt: m.importedAt ?? now,
                      src: m.src,
                      thumbnail: m.thumbnail,
                      width: m.width,
                      height: m.height,
                      edits: m.edits,
                      changes: ['Original'],
                    },
                  ];
            const nextNum = base[base.length - 1]!.version + 1;
            const newVersion: MediaVersion = {
              id: nanoid(8),
              version: nextNum,
              createdAt: now,
              src: patch.src ?? m.src,
              thumbnail: patch.thumbnail,
              width: patch.width ?? m.width,
              height: patch.height ?? m.height,
              edits: patch.edits,
              changes: changes.length ? changes : ['Edited'],
            };
            return { ...m, ...patch, versions: [...base, newVersion], editedAt: now };
          }),
        }));
        persist();
      },

      restoreVersion(id, versionId) {
        const now = Date.now();
        set((s) => ({
          media: s.media.map((m) => {
            if (m.id !== id || !m.versions) return m;
            const target = m.versions.find((v) => v.id === versionId);
            if (!target) return m;
            const nextNum = m.versions[m.versions.length - 1]!.version + 1;
            const restored: MediaVersion = {
              id: nanoid(8),
              version: nextNum,
              createdAt: now,
              src: target.src,
              thumbnail: target.thumbnail,
              width: target.width,
              height: target.height,
              edits: target.edits,
              changes: [`Restored version ${target.version}`],
            };
            return {
              ...m,
              src: target.src,
              thumbnail: target.thumbnail,
              width: target.width ?? m.width,
              height: target.height ?? m.height,
              edits: target.edits,
              editedAt: now,
              versions: [...m.versions, restored],
            };
          }),
        }));
        persist();
      },

      addComment(id, text, author) {
        const trimmed = text.trim();
        if (!trimmed) return;
        const comment: MediaComment = { id: nanoid(8), author, text: trimmed, createdAt: Date.now() };
        set((s) => ({
          media: s.media.map((m) =>
            m.id === id ? { ...m, comments: [...(m.comments ?? []), comment] } : m,
          ),
        }));
        persist();
      },
      deleteComment(id, commentId) {
        set((s) => ({
          media: s.media.map((m) =>
            m.id === id ? { ...m, comments: (m.comments ?? []).filter((c) => c.id !== commentId) } : m,
          ),
        }));
        persist();
      },

      renameAlbum(id, name) {
        set((s) => ({
          albums: s.albums.map((a) =>
            a.id === id && !a.system ? { ...a, name: name.trim() || a.name } : a,
          ),
        }));
        persist();
      },

      deleteAlbum(id) {
        set((s) => ({ albums: s.albums.filter((a) => a.id !== id || a.system) }));
        persist();
      },

      addToAlbum(albumId, ids) {
        set((s) => ({
          albums: s.albums.map((a) =>
            a.id === albumId
              ? { ...a, mediaIds: [...new Set([...a.mediaIds, ...ids])] }
              : a,
          ),
          media: s.media.map((m) =>
            ids.includes(m.id) ? { ...m, albumIds: [...new Set([...m.albumIds, albumId])] } : m,
          ),
        }));
        persist();
      },

      removeFromAlbum(albumId, ids) {
        const set_ = new Set(ids);
        set((s) => ({
          albums: s.albums.map((a) =>
            a.id === albumId ? { ...a, mediaIds: a.mediaIds.filter((m) => !set_.has(m)) } : a,
          ),
          media: s.media.map((m) =>
            set_.has(m.id) ? { ...m, albumIds: m.albumIds.filter((aid) => aid !== albumId) } : m,
          ),
        }));
        persist();
      },

      moveToAlbum(fromAlbumId, toAlbumId, ids) {
        get().removeFromAlbum(fromAlbumId, ids);
        get().addToAlbum(toAlbumId, ids);
      },

      duplicateAlbum(id) {
        const album = get().albums.find((a) => a.id === id);
        if (!album) return;
        const copy: Album = {
          ...album,
          id: `album:${nanoid(8)}`,
          name: `${album.name} copy`,
          system: false,
          kind: 'user',
          createdAt: Date.now(),
        };
        set((s) => ({ albums: [...s.albums, copy] }));
        persist();
      },

      setAlbumCover(albumId, mediaId) {
        set((s) => ({
          albums: s.albums.map((a) => (a.id === albumId ? { ...a, coverId: mediaId } : a)),
        }));
        persist();
      },

      applyEdit(id, edits) {
        set((s) => ({
          media: s.media.map((m) =>
            m.id === id ? { ...m, edits, editedAt: Date.now() } : m,
          ),
        }));
        persist();
      },

      duplicateWithEdits(sourceId, patch, changes) {
        const src = get().media.find((m) => m.id === sourceId);
        const now = Date.now();
        const id = (patch.id as MediaId) ?? (nanoid(10) as MediaId);
        if (!src) return id;
        const dot = src.name.lastIndexOf('.');
        const base = dot > 0 ? src.name.slice(0, dot) : src.name;
        const ext = dot > 0 ? src.name.slice(dot) : '';
        // The copy gets its OWN fresh 2-entry history: v1 = the source as it was
        // (the original), v2 = this edit. Never inherit the parent's versions/comments.
        const original: MediaVersion = {
          id: nanoid(8),
          version: 1,
          createdAt: src.importedAt ?? now,
          src: src.src,
          thumbnail: src.thumbnail,
          width: src.width,
          height: src.height,
          edits: src.edits,
          changes: ['Original'],
        };
        const edited: MediaVersion = {
          id: nanoid(8),
          version: 2,
          createdAt: now,
          src: patch.src ?? src.src,
          thumbnail: patch.thumbnail,
          width: patch.width ?? src.width,
          height: patch.height ?? src.height,
          edits: patch.edits,
          changes: changes && changes.length ? changes : ['Edited'],
        };
        const copy: MediaItem = {
          ...src,
          ...patch,
          id,
          name: `${base} copy${ext}`,
          albumIds: [], // the user files the copy via the album picker
          favorite: false,
          deletedAt: undefined,
          importedAt: now,
          editedAt: now,
          personIds: [],
          versions: [original, edited],
          comments: [],
        };
        // addMedia prepends + auto-files by source; persist() runs inside it.
        get().addMedia([copy]);
        return id;
      },

      setView(view) {
        set({
          view,
          objectFocus: null,
          tagFocus: null,
          personFocus: null,
          searchPreset: null,
          selection: new Set(),
        });
      },
      setLibraryScale(scale) {
        set({ libraryScale: scale });
      },
      setMapMode(mode) {
        set({ mapMode: mode });
      },
      setGridFilter(filter) {
        set({ gridFilter: filter });
      },
      setSearch(q) {
        // Clear stale semantic ranking; the SemanticSearch worker recomputes it.
        set({ searchQuery: q, searchPreset: null, semanticResults: null });
      },
      setSemanticResults(ids) {
        set({ semanticResults: ids });
      },
      setSearchPreset(preset) {
        set({
          searchPreset: preset,
          view: preset ? 'search' : 'library',
          searchQuery: '',
          objectFocus: null,
          tagFocus: null,
          personFocus: null,
        });
      },
      setObjectFocus(label) {
        set({
          objectFocus: label,
          tagFocus: null,
          personFocus: null,
          view: label ? 'library' : get().view,
        });
      },
      setTagFocus(tag) {
        set((s) => ({
          tagFocus: tag,
          objectFocus: null,
          personFocus: null,
          view: tag ? 'library' : s.view,
          libraryScale: tag ? 'days' : s.libraryScale, // tag view is grouped date-wise
        }));
      },
      setPersonFocus(id) {
        set((s) => ({
          personFocus: id,
          objectFocus: null,
          tagFocus: null,
          view: id ? 'library' : s.view,
        }));
      },
      rebuildPeople() {
        const { media, people: prev } = get();
        const clusters = clusterFaces(media).filter((c) => c.mediaIds.length > 0);

        // Reuse an existing person's id/name when a new cluster overlaps it the
        // most — so user-assigned names survive re-clustering as the library grows.
        const usedPrev = new Set<PersonId>();
        const people: Person[] = clusters
          .map((c) => {
            let match: Person | undefined;
            let bestOverlap = 0;
            for (const p of prev) {
              if (usedPrev.has(p.id)) continue;
              const overlap = p.mediaIds.reduce(
                (n, mid) => (c.mediaIds.includes(mid) ? n + 1 : n),
                0,
              );
              if (overlap > bestOverlap) {
                bestOverlap = overlap;
                match = p;
              }
            }
            const reuse = match && bestOverlap > 0 ? match : undefined;
            if (reuse) usedPrev.add(reuse.id);
            return {
              id: reuse?.id ?? `person:${nanoid(8)}`,
              name: reuse?.name,
              isPet: false,
              coverId: c.coverId,
              mediaIds: c.mediaIds,
            } satisfies Person;
          })
          .sort((a, b) => b.mediaIds.length - a.mediaIds.length);

        // Pet groups: object detection can't tell individual animals apart, so we
        // group by detected animal type (Dogs/Cats/…). Stable id `pet:<label>` keeps
        // a user-assigned name across rebuilds.
        const live = media.filter((m) => !m.deletedAt && !m.hidden);
        const petGroups: Person[] = [];
        for (const label of PET_LABELS) {
          const items = live.filter((m) => m.objectLabels.includes(label));
          if (items.length === 0) continue;
          const id = `pet:${label}` as PersonId;
          const prevPet = prev.find((p) => p.id === id);
          petGroups.push({
            id,
            name: prevPet?.name ?? `${label[0]!.toUpperCase()}${label.slice(1)}s`,
            isPet: true,
            coverId: items[0]!.id,
            mediaIds: items.map((m) => m.id),
          });
        }

        const all = [...people, ...petGroups].sort((a, b) => b.mediaIds.length - a.mediaIds.length);

        // Denormalize person/pet membership back onto each item (powers person focus).
        const byMedia = new Map<MediaId, PersonId[]>();
        for (const p of all) {
          for (const mid of p.mediaIds) {
            const arr = byMedia.get(mid);
            if (arr) arr.push(p.id);
            else byMedia.set(mid, [p.id]);
          }
        }
        set((s) => ({
          people: all,
          media: s.media.map((m) => {
            const ids = byMedia.get(m.id) ?? [];
            if (ids.length === 0 && m.personIds.length === 0) return m;
            const same =
              ids.length === m.personIds.length && ids.every((id, i) => id === m.personIds[i]);
            return same ? m : { ...m, personIds: ids };
          }),
        }));
        persist();
      },
      syncObjectAlbums() {
        // Replace ONLY the sys:obj:* set; keep default system albums + user albums.
        // Membership stays live via resolveSmartAlbum, so no per-item bookkeeping and
        // no persist() needed (system albums are stripped on save + regenerated on load).
        const generated = objectSmartAlbums(get().media, Date.now(), get().labelAliases);
        set((s) => {
          const others = s.albums.filter((a) => !a.id.startsWith('sys:obj:'));
          // Skip the state write if the label SET is unchanged (avoids render churn).
          const prevIds = s.albums.filter((a) => a.id.startsWith('sys:obj:')).map((a) => a.id);
          const nextIds = generated.map((a) => a.id);
          const same =
            prevIds.length === nextIds.length && prevIds.every((id, i) => id === nextIds[i]);
          if (same) return {};
          return { albums: [...others, ...generated] };
        });
      },
      renamePerson(id, name) {
        const trimmed = name.trim();
        set((s) => ({
          people: s.people.map((p) => (p.id === id ? { ...p, name: trimmed || undefined } : p)),
        }));
        persist();
      },
      renameLabel(from, to) {
        const key = from.trim().toLowerCase();
        const value = to.trim().toLowerCase();
        if (!key) return;
        set((s) => {
          const labelAliases: Record<string, string> = { ...s.labelAliases };
          // Empty / unchanged name clears the alias (renames the tag back to itself).
          const clearing = !value || value === key;
          if (clearing) {
            delete labelAliases[key];
          } else {
            labelAliases[key] = value;
            // Re-point any earlier aliases that resolved to `key` so renaming an
            // already-renamed tag keeps mapping the original detector label(s).
            for (const k of Object.keys(labelAliases)) {
              if (k !== key && labelAliases[k] === key) labelAliases[k] = value;
            }
          }
          // Backfill existing items so past photos regroup under the new label and
          // stay searchable by it (search reads objectLabels directly).
          const target = clearing ? key : value;
          const media = s.media.map((m) => {
            if (!m.objectLabels.some((l) => l.trim().toLowerCase() === key)) return m;
            const mapped = [
              ...new Set(
                m.objectLabels.map((l) => (l.trim().toLowerCase() === key ? target : l)),
              ),
            ];
            return { ...m, objectLabels: mapped };
          });
          return { labelAliases, media };
        });
        // Rebuild the sys:obj:* albums so the sidebar/Objects re-title live.
        get().syncObjectAlbums();
        persist();
      },

      deleteLabel(label) {
        const key = label.trim().toLowerCase();
        if (!key) return;
        set((s) => {
          const deletedLabels = s.deletedLabels.includes(key)
            ? s.deletedLabels
            : [...s.deletedLabels, key];
          // Drop any aliases pointing at this label so it can't reappear via a rename.
          const labelAliases: Record<string, string> = { ...s.labelAliases };
          for (const k of Object.keys(labelAliases)) {
            if (k === key || labelAliases[k] === key) delete labelAliases[k];
          }
          // Strip the label from every photo so its album empties and it stops matching.
          const media = s.media.map((m) =>
            m.objectLabels.some((l) => l.trim().toLowerCase() === key)
              ? { ...m, objectLabels: m.objectLabels.filter((l) => l.trim().toLowerCase() !== key) }
              : m,
          );
          return { deletedLabels, labelAliases, media };
        });
        get().syncObjectAlbums();
        persist();
      },

      async setLockPassword(password) {
        const hash = await hashPassword(password);
        if (!hash) return;
        lsSet(LOCK_KEY, hash);
        set({ lock: { hash }, lockUnlocked: true });
      },
      removeLockPassword() {
        lsSet(LOCK_KEY, null);
        set({ lock: { hash: null }, lockUnlocked: false });
      },
      async unlockLock(password) {
        const ok = await verifyPassword(password, get().lock.hash);
        if (ok) set({ lockUnlocked: true });
        return ok;
      },
      relock() {
        set({ lockUnlocked: false });
      },

      createShare(scope, mediaIds, albumId) {
        const token = nanoid(10);
        const album = albumId ? get().albums.find((a) => a.id === albumId) : undefined;
        const title =
          scope === 'album'
            ? (album?.name ?? 'Shared Album')
            : mediaIds.length === 1
              ? (get().media.find((m) => m.id === mediaIds[0])?.name ?? 'Shared Photo')
              : `${mediaIds.length} Photos`;
        const origin =
          typeof location !== 'undefined' && location.origin ? location.origin : 'https://photos.app';
        const share: ShareRecord = {
          id: nanoid(12),
          token,
          scope,
          mediaIds,
          albumId,
          title,
          url: `${origin}/gallery?shared=${token}`,
          createdAt: Date.now(),
        };
        const next = [share, ...get().shares];
        lsSet(SHARES_KEY, JSON.stringify(next));
        set({ shares: next });
        return share;
      },
      revokeShare(id) {
        const next = get().shares.filter((s) => s.id !== id);
        lsSet(SHARES_KEY, JSON.stringify(next));
        set({ shares: next });
      },
      focusMap(loc) {
        set({ mapFocus: loc, view: 'map', infoOpen: false, lightboxId: null });
      },
      setAiStatus(patch) {
        set((s) => ({ aiStatus: { ...s.aiStatus, ...patch } }));
      },
      toggleInfo() {
        set((s) => ({ infoOpen: !s.infoOpen }));
      },
      setInfoOpen(open) {
        set({ infoOpen: open });
      },
      openCamera() {
        set({ cameraOpen: true });
      },
      closeCamera() {
        set({ cameraOpen: false });
      },

      setTheme(theme) {
        set({ theme });
      },
      setResolvedTheme(t) {
        set({ resolvedTheme: t });
      },
      toggleSidebar() {
        set((s) => ({ sidebarOpen: !s.sidebarOpen }));
      },
      setSidebar(open) {
        set({ sidebarOpen: open });
      },
      zoomIn() {
        // Larger tiles, fewer columns.
        set((s) => ({ zoomIndex: Math.min(GRID_ZOOM_STEPS.length - 1, s.zoomIndex + 1) }));
      },
      zoomOut() {
        // Smaller tiles, more columns.
        set((s) => ({ zoomIndex: Math.max(0, s.zoomIndex - 1) }));
      },
      setZoom(index) {
        set({ zoomIndex: Math.max(0, Math.min(GRID_ZOOM_STEPS.length - 1, index)) });
      },

      select(id, opts) {
        const { additive, range, orderedIds } = opts ?? {};
        set((s) => {
          const next = new Set(s.selection);
          if (range && s.lastSelected && orderedIds) {
            const a = orderedIds.indexOf(s.lastSelected);
            const b = orderedIds.indexOf(id);
            if (a !== -1 && b !== -1) {
              const [lo, hi] = a < b ? [a, b] : [b, a];
              // A plain shift-click replaces the prior selection with the fresh
              // contiguous range; shift+cmd unions the range onto it.
              const sel = additive ? next : new Set<MediaId>();
              for (let i = lo; i <= hi; i++) sel.add(orderedIds[i]!);
              return { selection: sel };
            }
          }
          if (additive) {
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { selection: next, lastSelected: id };
          }
          return { selection: new Set([id]), lastSelected: id };
        });
      },
      selectOnly(id) {
        set({ selection: new Set([id]), lastSelected: id });
      },
      selectMany(ids) {
        set({ selection: new Set(ids), lastSelected: ids[ids.length - 1] ?? null });
      },
      clearSelection() {
        set({ selection: new Set() });
      },

      openLightbox(id) {
        set((s) => ({
          lightboxId: id,
          recentlyViewed: [id, ...s.recentlyViewed.filter((x) => x !== id)].slice(0, 50),
        }));
      },
      closeLightbox() {
        set({ lightboxId: null });
      },
      openEditor(id) {
        set({ editorId: id, lightboxId: null });
      },
      closeEditor() {
        set({ editorId: null });
      },
    };
  });

  return store;
}
