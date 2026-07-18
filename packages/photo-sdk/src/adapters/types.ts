import type { Album, MediaItem, Person } from '../types';

export interface PersistedState {
  media: MediaItem[];
  albums: Album[];
  people: Person[];
  version: number;
}

/**
 * Storage adapter contract. Implement this to back the gallery with anything:
 * localStorage (default), IndexedDB, a REST/GraphQL API, S3, Postgres, etc.
 *
 * The default UI calls `load` once on mount and `save` (debounced) on change.
 * `putBlob` is optional and only used when importing local File objects that
 * need durable URLs.
 */
export interface StorageAdapter {
  readonly name: string;
  load(): Promise<PersistedState | null>;
  save(state: PersistedState): Promise<void>;
  /** Persist a binary blob and return a stable URL to it. */
  putBlob?(id: string, blob: Blob): Promise<string>;
  clear?(): Promise<void>;
}
