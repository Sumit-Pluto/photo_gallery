'use client';

import { downloadMedia, exportMetadata } from '../lib/download';
import { Icon } from '../icons';
import { useGallery, useGalleryStoreApi } from '../store/context';
import { addToAlbumPicker, confirmAction, openShareModal } from './modals';

export function SelectionBar() {
  const api = useGalleryStoreApi();
  const selection = useGallery((s) => s.selection);
  const view = useGallery((s) => s.view);
  const media = useGallery((s) => s.media);
  const features = useGallery((s) => s.config.features);

  const count = selection.size;
  if (count === 0) return null;

  const ids = [...selection];
  const inTrash = view === 'recently-deleted';

  const exportSelection = () => {
    const items = media.filter((m) => selection.has(m.id));
    items.forEach((m) => downloadMedia(m));
    exportMetadata(items);
  };

  return (
    <div className="apg-actionbar" role="toolbar" aria-label="Selection actions">
      <span className="apg-actionbar__count">
        {count} Selected
      </span>

      {inTrash ? (
        <>
          <button
            type="button"
            className="apg-iconbtn"
            aria-label="Restore"
            title="Restore"
            onClick={() => api.getState().restore(ids)}
          >
            <Icon name="rotate" />
          </button>
          <button
            type="button"
            className="apg-iconbtn"
            aria-label="Delete permanently"
            title="Delete Permanently"
            onClick={() =>
              confirmAction({
                title: `Delete ${count} item${count === 1 ? '' : 's'}?`,
                message: 'These items will be permanently deleted. This cannot be undone.',
                confirmLabel: 'Delete',
                danger: true,
                onConfirm: () => api.getState().deletePermanently(ids),
              })
            }
          >
            <Icon name="trash" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="apg-iconbtn"
            aria-label="Favourite"
            title="Favourite"
            onClick={() => api.getState().toggleFavorite(ids)}
          >
            <Icon name="heart" />
          </button>
          <button
            type="button"
            className="apg-iconbtn"
            aria-label="Add to album"
            title="Add to Album"
            onClick={() => addToAlbumPicker(ids)}
          >
            <Icon name="collections" />
          </button>
          {features.sharing ? (
            <button
              type="button"
              className="apg-iconbtn"
              aria-label="Share"
              title="Share"
              onClick={() => openShareModal(ids)}
            >
              <Icon name="share" />
            </button>
          ) : null}
          {features.export ? (
            <button
              type="button"
              className="apg-iconbtn"
              aria-label="Download"
              title="Download"
              onClick={exportSelection}
            >
              <Icon name="download" />
            </button>
          ) : null}
          <button
            type="button"
            className="apg-iconbtn"
            aria-label="Delete"
            title="Delete"
            onClick={() => api.getState().trash(ids)}
          >
            <Icon name="trash" />
          </button>
        </>
      )}

      <button
        type="button"
        className="apg-iconbtn"
        aria-label="Clear selection"
        title="Clear selection"
        onClick={() => api.getState().clearSelection()}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
