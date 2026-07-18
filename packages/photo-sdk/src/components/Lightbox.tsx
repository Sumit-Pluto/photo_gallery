'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef } from 'react';

import { downloadMedia } from '../lib/download';
import { editFilterCss, editTransformCss } from '../lib/edits';
import { formatDate, formatTime } from '../lib/format';
import { Icon } from '../icons';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useViewMedia } from '../hooks/useViewMedia';
import { useGallery, useGalleryStoreApi } from '../store/context';
import { Annotations } from './editor/Annotations';
import { openShareModal } from './modals';
import { VideoPlayer } from './VideoPlayer';

export function Lightbox() {
  const api = useGalleryStoreApi();
  const lightboxId = useGallery((s) => s.lightboxId);
  const media = useGallery((s) => s.media);
  const features = useGallery((s) => s.config.features);
  const ordered = useViewMedia();

  const item = media.find((m) => m.id === lightboxId) ?? null;
  const index = ordered.findIndex((m) => m.id === lightboxId);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Escape is handled by the window listener below; trap only manages Tab + focus.
  useFocusTrap(dialogRef, Boolean(item));

  const go = useCallback(
    (dir: -1 | 1) => {
      if (index === -1) return;
      const next = ordered[index + dir];
      if (next) api.getState().openLightbox(next.id);
    },
    [api, index, ordered],
  );

  useEffect(() => {
    if (!lightboxId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') api.getState().closeLightbox();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxId, api, go]);

  return (
    <AnimatePresence>
      {item ? (
        <motion.div
          ref={dialogRef}
          className="apg-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo: ${item.name}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="apg-lightbox__bar">
            <button
              type="button"
              className="apg-iconbtn"
              aria-label="Close"
              onClick={() => api.getState().closeLightbox()}
            >
              <Icon name="chevron-left" />
            </button>
            <div>
              <div className="apg-lightbox__title">{item.name}</div>
              <div className="apg-lightbox__sub">
                {formatDate(item.takenAt)} · {formatTime(item.takenAt)}
                {item.location?.place ? ` · ${item.location.place}` : ''}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="apg-iconbtn"
              aria-label="Info"
              onClick={() => api.getState().toggleInfo()}
            >
              <Icon name="info" />
            </button>
            <button
              type="button"
              className="apg-iconbtn"
              aria-label={item.favorite ? 'Unfavourite' : 'Favourite'}
              aria-pressed={item.favorite}
              style={item.favorite ? { color: '#ff3b30' } : undefined}
              onClick={() => api.getState().toggleFavorite([item.id])}
            >
              <Icon name={item.favorite ? 'heart-fill' : 'heart'} />
            </button>
            {features.editor ? (
              <button
                type="button"
                className="apg-iconbtn"
                aria-label="Edit"
                onClick={() => api.getState().openEditor(item.id)}
              >
                <Icon name="adjust" />
              </button>
            ) : null}
            {features.sharing ? (
              <button
                type="button"
                className="apg-iconbtn"
                aria-label="Share"
                onClick={() => openShareModal([item.id])}
              >
                <Icon name="share" />
              </button>
            ) : null}
            {features.export ? (
              <button
                type="button"
                className="apg-iconbtn"
                aria-label="Download"
                onClick={() => downloadMedia(item)}
              >
                <Icon name="download" />
              </button>
            ) : null}
            <button
              type="button"
              className="apg-iconbtn"
              aria-label="Delete"
              onClick={() => {
                api.getState().trash([item.id]);
                api.getState().closeLightbox();
              }}
            >
              <Icon name="trash" />
            </button>
          </div>

          <div className="apg-lightbox__stage">
            {index > 0 ? (
              <button
                type="button"
                className="apg-lightbox__nav apg-lightbox__nav--prev"
                aria-label="Previous"
                onClick={() => go(-1)}
              >
                <Icon name="chevron-left" />
              </button>
            ) : null}

            <motion.div
              key={item.id}
              initial={{ opacity: 0.4, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.16 }}
              style={{ maxWidth: '100%', maxHeight: '100%', display: 'flex' }}
            >
              {item.kind === 'video' ? (
                <VideoPlayer src={item.src} poster={item.poster} filter={editFilterCss(item.edits)} />
              ) : (
                <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', maxHeight: '100%' }}>
                  <img
                    src={item.src}
                    alt={item.name}
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      filter: editFilterCss(item.edits),
                      transform: editTransformCss(item.edits),
                    }}
                  />
                  {item.edits?.annotations?.length ? (
                    <Annotations annotations={item.edits.annotations} editable={false} />
                  ) : null}
                </div>
              )}
            </motion.div>

            {index < ordered.length - 1 && index !== -1 ? (
              <button
                type="button"
                className="apg-lightbox__nav apg-lightbox__nav--next"
                aria-label="Next"
                onClick={() => go(1)}
              >
                <Icon name="chevron-right" />
              </button>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
