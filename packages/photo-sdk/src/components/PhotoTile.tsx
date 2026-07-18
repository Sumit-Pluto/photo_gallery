'use client';

import { memo } from 'react';

import { downloadMedia } from '../lib/download';
import { editFilterCss, editTransformCss } from '../lib/edits';
import { formatDuration } from '../lib/format';
import { Icon } from '../icons';
import { useGallery, useGalleryStoreApi } from '../store/context';
import type { MediaId, MediaItem } from '../types';
import { openContextMenu } from './ContextMenu';
import { addToAlbumPicker, confirmAction, moveToAlbumPicker, openShareModal } from './modals';

interface PhotoTileProps {
  item: MediaItem;
  orderedIds: MediaId[];
}

function PhotoTileImpl({ item, orderedIds }: PhotoTileProps) {
  const api = useGalleryStoreApi();
  const selected = useGallery((s) => s.selection.has(item.id));
  const view = useGallery((s) => s.view);
  const features = useGallery((s) => s.config.features);
  const inTrash = view === 'recently-deleted';

  const targetIds = () => {
    const sel = api.getState().selection;
    return sel.has(item.id) && sel.size > 1 ? [...sel] : [item.id];
  };

  const onClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      api.getState().select(item.id, { range: true, orderedIds });
    } else if (e.metaKey || e.ctrlKey) {
      api.getState().select(item.id, { additive: true });
    } else if (api.getState().selection.size > 0) {
      // In selection mode a plain click extends/toggles the selection.
      api.getState().select(item.id, { additive: true });
    } else {
      // Otherwise a plain click opens the photo (macOS-style); use the checkmark
      // or right-click → Select to enter selection mode.
      api.getState().openLightbox(item.id);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Right-click shows the menu WITHOUT changing the selection; actions target
    // the current selection if this item is part of it, else just this item.
    const sel = api.getState().selection;
    const selected = sel.has(item.id);
    const ids = targetIds();

    if (inTrash) {
      openContextMenu(e.clientX, e.clientY, [
        { label: 'Restore', icon: 'rotate', onClick: () => api.getState().restore(ids) },
        {
          label: 'Delete Permanently',
          icon: 'trash',
          danger: true,
          onClick: () =>
            confirmAction({
              title: `Delete ${ids.length} item${ids.length === 1 ? '' : 's'}?`,
              message: 'This cannot be undone.',
              confirmLabel: 'Delete',
              danger: true,
              onConfirm: () => api.getState().deletePermanently(ids),
            }),
        },
      ]);
      return;
    }

    openContextMenu(e.clientX, e.clientY, [
      { label: 'Open', icon: 'image', onClick: () => api.getState().openLightbox(item.id) },
      {
        label: selected ? 'Deselect' : 'Select',
        icon: selected ? 'close' : 'check',
        onClick: () => api.getState().select(item.id, { additive: true }),
      },
      ...(features.editor
        ? [{ label: 'Edit', icon: 'adjust' as const, onClick: () => api.getState().openEditor(item.id) }]
        : []),
      {
        label: item.favorite ? 'Unfavourite' : 'Favourite',
        icon: 'heart',
        onClick: () => api.getState().toggleFavorite(ids),
      },
      ...(features.sharing
        ? [{ label: 'Share…', icon: 'share' as const, onClick: () => openShareModal(ids) }]
        : []),
      { label: 'Copy to Album…', icon: 'collections', onClick: () => addToAlbumPicker(ids) },
      ...(view.startsWith('album:')
        ? [
            {
              label: 'Move to Album…',
              icon: 'collections' as const,
              onClick: () => moveToAlbumPicker(view, ids),
            },
            {
              label: 'Remove from Album',
              icon: 'close' as const,
              onClick: () => api.getState().removeFromAlbum(view, ids),
            },
          ]
        : []),
      { type: 'separator' },
      ...(item.objectLabels.length
        ? [
            {
              label: `Find similar: ${item.objectLabels[0]}`,
              icon: 'search' as const,
              onClick: () => api.getState().setObjectFocus(item.objectLabels[0]!),
            },
          ]
        : []),
      ...(features.export
        ? [{ label: 'Download', icon: 'download' as const, onClick: () => downloadMedia(item) }]
        : []),
      { type: 'separator' },
      {
        label: ids.length > 1 ? `Delete ${ids.length} Items` : 'Delete',
        icon: 'trash',
        danger: true,
        onClick: () => api.getState().trash(ids),
      },
    ]);
  };

  const toggleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    api.getState().select(item.id, { additive: true });
  };

  return (
    <div
      className={['apg-tile', selected ? 'apg-tile--selected' : ''].join(' ')}
      onClick={onClick}
      onDoubleClick={() => api.getState().openLightbox(item.id)}
      onContextMenu={onContextMenu}
      role="button"
      aria-label={item.name}
      aria-pressed={selected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') api.getState().openLightbox(item.id);
      }}
    >
      {item.kind === 'video' ? (
        <video
          src={item.src}
          poster={item.poster}
          muted
          preload="metadata"
          playsInline
          style={{ filter: editFilterCss(item.edits), transform: editTransformCss(item.edits) }}
        />
      ) : (
        <img
          src={item.thumbnail ?? item.src}
          alt={item.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ filter: editFilterCss(item.edits), transform: editTransformCss(item.edits) }}
        />
      )}

      {item.kind === 'video' ? (
        <span className="apg-tile__badge">
          <Icon name="play" size={12} />
          {formatDuration(item.duration)}
        </span>
      ) : null}

      {item.favorite ? (
        <span className="apg-tile__fav">
          <Icon name="heart-fill" size={14} />
        </span>
      ) : null}

      <button
        type="button"
        className="apg-tile__check"
        aria-label={selected ? 'Deselect' : 'Select'}
        onClick={toggleCheck}
      >
        {selected ? <Icon name="check" size={13} /> : null}
      </button>
    </div>
  );
}

export const PhotoTile = memo(PhotoTileImpl);
