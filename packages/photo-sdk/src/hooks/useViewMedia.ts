'use client';

import { useMemo } from 'react';

import { useGallery } from '../store/context';
import { mediaForView } from '../store/selectors';
import type { GalleryState } from '../store/store';
import type { MediaItem } from '../types';

/** The media items for the active view (filters + search + object-focus applied). */
export function useViewMedia(): MediaItem[] {
  const media = useGallery((s) => s.media);
  const albums = useGallery((s) => s.albums);
  const view = useGallery((s) => s.view);
  const gridFilter = useGallery((s) => s.gridFilter);
  const searchQuery = useGallery((s) => s.searchQuery);
  const objectFocus = useGallery((s) => s.objectFocus);
  const tagFocus = useGallery((s) => s.tagFocus);
  const personFocus = useGallery((s) => s.personFocus);
  const searchPreset = useGallery((s) => s.searchPreset);
  const semanticResults = useGallery((s) => s.semanticResults);
  const recentlyViewed = useGallery((s) => s.recentlyViewed);

  return useMemo(
    () =>
      mediaForView({
        media,
        albums,
        view,
        gridFilter,
        searchQuery,
        objectFocus,
        tagFocus,
        personFocus,
        searchPreset,
        semanticResults,
        recentlyViewed,
      } as GalleryState),
    [media, albums, view, gridFilter, searchQuery, objectFocus, tagFocus, personFocus, searchPreset, semanticResults, recentlyViewed],
  );
}
