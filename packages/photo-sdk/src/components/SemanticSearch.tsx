'use client';

import { useEffect } from 'react';

import { cosineSimilarity, type AIProvider } from '../ai/types';
import { useGallery, useGalleryStoreApi } from '../store/context';
import { liveMedia } from '../store/selectors';

const DEBOUNCE_MS = 350;
const MIN_QUERY_LEN = 2;
/** Cosine-similarity floor for a photo to count as a semantic match. CLIP ViT-B/16
 * scores strong matches ~0.25+, unrelated ~0.15 — 0.22 keeps it crisp. */
const MATCH_THRESHOLD = 0.22;
const MAX_RESULTS = 60;

/**
 * Headless worker: when the user types a query, embeds it with the provider's
 * text encoder (CLIP) and ranks every photo that has an image embedding by
 * cosine similarity, writing the ordered ids to the store. The selector blends
 * these "looks like" matches with the keyword results. Runs only if the provider
 * supports embedText; otherwise search stays purely keyword-based.
 */
export function SemanticSearch({ provider }: { provider: AIProvider }) {
  const api = useGalleryStoreApi();
  const query = useGallery((s) => s.searchQuery);

  useEffect(() => {
    if (!provider.embedText) return;
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) {
      api.getState().setSemanticResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const embedded = liveMedia(api.getState().media).filter((m) => (m.embedding?.length ?? 0) > 0);
      if (embedded.length === 0) {
        if (!cancelled) api.getState().setSemanticResults(null);
        return;
      }
      const qvec = await provider.embedText!(q).catch(() => [] as number[]);
      if (cancelled || qvec.length === 0) return;
      const ranked = embedded
        .map((m) => ({ id: m.id, score: cosineSimilarity(qvec, m.embedding!) }))
        .filter((r) => r.score >= MATCH_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RESULTS)
        .map((r) => r.id);
      if (!cancelled) api.getState().setSemanticResults(ranked);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, provider, api]);

  return null;
}
