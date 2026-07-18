'use client';

import { useState } from 'react';

import { GRID_ZOOM_STEPS } from '../constants';
import { useGallery, useGalleryStoreApi } from '../store/context';
import { mediaForView } from '../store/selectors';
import type { GridFilter } from '../store/store';
import type { AlbumId, LibraryScale, MapMode, ViewId } from '../types';
import { confirmAction, openSecuritySettings, openShareModal } from './modals';
import { openUploadModal } from './UploadModal';
import { openContextMenu } from './ContextMenu';
import { Icon } from '../icons';

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="apg-segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={['apg-segmented__item', value === o.value ? 'apg-segmented__item--active' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const GRID_VIEWS = new Set<string>([
  'library',
  'favourites',
  'recently-saved',
  'videos',
  'screenshots',
  'recently-deleted',
  'duplicates',
  'search',
]);

const FILTER_OPTIONS: Array<{ value: GridFilter; label: string }> = [
  { value: 'all', label: 'All Items' },
  { value: 'favourites', label: 'Favourites' },
  { value: 'edited', label: 'Edited' },
  { value: 'photos', label: 'Photos' },
  { value: 'videos', label: 'Videos' },
  { value: 'screenshots', label: 'Screenshots' },
  { value: 'not-in-album', label: 'Not in an Album' },
];

export function TopToolbar() {
  const api = useGalleryStoreApi();
  const view = useGallery((s) => s.view);
  const libraryScale = useGallery((s) => s.libraryScale);
  const mapMode = useGallery((s) => s.mapMode);
  const gridFilter = useGallery((s) => s.gridFilter);
  const searchQuery = useGallery((s) => s.searchQuery);
  const zoomIndex = useGallery((s) => s.zoomIndex);
  const features = useGallery((s) => s.config.features);
  const theme = useGallery((s) => s.theme);
  const aiStatus = useGallery((s) => s.aiStatus);
  const infoOpen = useGallery((s) => s.infoOpen);
  const selectionCount = useGallery((s) => s.selection.size);

  const [searchExpanded, setSearchExpanded] = useState(false);

  const isGrid = GRID_VIEWS.has(view) || view.startsWith('album:');
  const isAlbumish = view !== 'library' && view !== 'collections';
  // Uploads default into the album you're viewing (else Library).
  const currentAlbumId = view.startsWith('album:') ? (view as unknown as AlbumId) : undefined;

  const openFilterMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openContextMenu(
      r.left,
      r.bottom + 4,
      FILTER_OPTIONS.map((o) => ({
        label: o.label,
        checked: gridFilter === o.value,
        onClick: () => api.getState().setGridFilter(o.value),
      })),
    );
  };

  const openMoreMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const state = api.getState();
    const viewIds = mediaForView(state).map((m) => m.id);
    const allSelected = viewIds.length > 0 && viewIds.every((id) => state.selection.has(id));
    openContextMenu(r.left - 150, r.bottom + 4, [
      allSelected
        ? {
            label: 'Unselect All',
            icon: 'close',
            onClick: () => state.clearSelection(),
          }
        : {
            label: 'Select All',
            icon: 'check',
            onClick: () => state.selectMany(viewIds),
          },
      ...(features.import
        ? [{ label: 'Import…', icon: 'download' as const, onClick: () => openUploadModal(currentAlbumId) }]
        : []),
      { type: 'separator' as const },
      { type: 'label' as const, label: 'Appearance' },
      { label: 'Light', icon: 'adjust' as const, checked: theme === 'light', onClick: () => state.setTheme('light') },
      { label: 'Dark', icon: 'adjust' as const, checked: theme === 'dark', onClick: () => state.setTheme('dark') },
      {
        label: 'Semi-Dark (Glass)',
        icon: 'adjust' as const,
        checked: theme === 'semi-dark',
        onClick: () => state.setTheme('semi-dark'),
      },
      { label: 'System', icon: 'adjust' as const, checked: theme === 'system', onClick: () => state.setTheme('system') },
      { type: 'separator' as const },
      {
        label: state.lock.hash ? 'Recently Deleted Lock…' : 'Lock Recently Deleted…',
        icon: state.lock.hash ? 'lock' : 'unlock',
        onClick: () => openSecuritySettings(),
      },
      ...(view === 'recently-deleted'
        ? [
            { type: 'separator' as const },
            {
              label: 'Delete All',
              icon: 'trash' as const,
              danger: true,
              onClick: () =>
                confirmAction({
                  title: 'Delete All Items?',
                  message: 'These items will be permanently deleted. This cannot be undone.',
                  confirmLabel: 'Delete All',
                  danger: true,
                  onConfirm: () => api.getState().emptyTrash(),
                }),
            },
          ]
        : []),
    ]);
  };

  return (
    <div className="apg-toolbar">
      <button
        type="button"
        className="apg-iconbtn"
        aria-label="Toggle sidebar"
        onClick={() => api.getState().toggleSidebar()}
      >
        <Icon name="sidebar" />
      </button>
      <button
        type="button"
        className="apg-iconbtn apg-iconbtn--circle"
        aria-label="Back"
        disabled={!isAlbumish}
        onClick={() => api.getState().setView('library')}
      >
        <Icon name="chevron-left" size={18} />
      </button>

      {features.import ? (
        <button
          type="button"
          className="apg-iconbtn"
          aria-label="Add photos"
          onClick={() => openUploadModal(currentAlbumId)}
        >
          <Icon name="plus" />
        </button>
      ) : null}
      {features.camera ? (
        <button
          type="button"
          className="apg-iconbtn"
          aria-label="Open camera"
          onClick={() => api.getState().openCamera()}
        >
          <Icon name="camera" />
        </button>
      ) : null}

      {/* Center segmented control (context dependent). */}
      <div className="apg-toolbar__center">
        {view === 'library' || view === 'search' ? (
          <Segmented<LibraryScale>
            value={libraryScale}
            onChange={(v) => api.getState().setLibraryScale(v)}
            options={[
              { value: 'years', label: 'Years' },
              { value: 'months', label: 'Months' },
              { value: 'all', label: 'All Photos' },
            ]}
          />
        ) : view === 'map' ? (
          <Segmented<MapMode>
            value={mapMode}
            onChange={(v) => api.getState().setMapMode(v)}
            options={[
              { value: 'map', label: 'Map' },
              { value: 'satellite', label: 'Satellite' },
              { value: 'grid', label: 'Grid' },
            ]}
          />
        ) : null}
      </div>

      <div className="apg-toolbar__spacer" />

      {isGrid ? (
        <>
          <button
            type="button"
            className="apg-iconbtn"
            aria-label="Zoom out"
            disabled={zoomIndex === 0}
            onClick={() => api.getState().zoomOut()}
          >
            <Icon name="minus" />
          </button>
          <button
            type="button"
            className="apg-iconbtn"
            aria-label="Zoom in"
            disabled={zoomIndex === GRID_ZOOM_STEPS.length - 1}
            onClick={() => api.getState().zoomIn()}
          >
            <Icon name="plus" />
          </button>
          <button type="button" className="apg-iconbtn" aria-label="Filter" onClick={openFilterMenu}>
            <Icon name="filter" />
          </button>
        </>
      ) : null}

      {features.sharing && (selectionCount > 0 || view.startsWith('album:')) ? (
        <button
          type="button"
          className="apg-iconbtn"
          aria-label="Share"
          onClick={() =>
            openShareModal(
              [...api.getState().selection],
              view.startsWith('album:') ? view : undefined,
            )
          }
        >
          <Icon name="share" />
        </button>
      ) : null}

      <button type="button" className="apg-iconbtn" aria-label="More" onClick={openMoreMenu}>
        <Icon name="ellipsis" />
      </button>
      <button
        type="button"
        className={['apg-iconbtn', infoOpen ? 'apg-iconbtn--on' : ''].join(' ')}
        aria-label="Info"
        aria-pressed={infoOpen}
        onClick={() => api.getState().toggleInfo()}
      >
        <Icon name="info" />
      </button>

      {aiStatus.running ? (
        <span
          className="apg-ai-status"
          title="Analyzing your library with AI"
          aria-live="polite"
        >
          <span className="apg-ai-spinner" aria-hidden="true" />
          {aiStatus.done}/{aiStatus.total}
        </span>
      ) : null}

      <div
        className={['apg-search', searchExpanded ? 'apg-search--expanded' : ''].join(' ')}
        onClick={() => setSearchExpanded(true)}
      >
        <Icon name="search" size={16} />
        <input
          aria-label="Search"
          placeholder="Search"
          value={searchQuery}
          onFocus={() => setSearchExpanded(true)}
          onChange={(e) => {
            const q = e.target.value;
            api.getState().setSearch(q);
            api.getState().setView((q ? 'search' : 'library') as ViewId);
          }}
          onBlur={() => setTimeout(() => setSearchExpanded(false), 120)}
        />
        {searchExpanded && !searchQuery ? (
          <div className="apg-search__recents" role="listbox">
            <div className="apg-menu__label">Recents</div>
            {(
              [
                ['viewed', 'Recently Viewed'],
                ['edited', 'Recently Edited'],
                ['added', 'Recently Added'],
              ] as Array<['viewed' | 'edited' | 'added', string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="apg-menu__item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  api.getState().setSearchPreset(key);
                  setSearchExpanded(false);
                }}
              >
                <span className="apg-menu__icon">
                  <Icon name="clock" size={15} />
                </span>
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
