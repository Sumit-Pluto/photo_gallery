'use client';

import { useEffect, useRef } from 'react';

import type { AIProvider } from '../ai/types';
import { PET_LABELS } from '../constants';
import { resolveLabel } from '../lib/smartAlbums';
import { sanitizeOcrText } from '../lib/text';
import { useGallery, useGalleryStoreApi } from '../store/context';
import type { MediaItem } from '../types';

const CONCURRENCY = 2;
const CONFIDENCE = 0.15;
const START_DELAY_MS = 1200;

/**
 * Headless background worker: runs the configured AIProvider across un-analyzed
 * images and writes results back into the store — objects + objectLabels (powers
 * "click an object → find every photo with it" + the Objects browser), faces
 * (clustered into People), and OCR text (searchable + the Documents album).
 *
 * The SDK ships no ML dependency — the provider (TensorFlow.js / face-api /
 * tesseract.js) is supplied by the host app, so this stays tiny and tree-shakeable.
 */
export function AIAnalyzer({ provider }: { provider: AIProvider }) {
  const api = useGalleryStoreApi();
  const ready = useGallery((s) => s.ready);
  // Re-evaluate only when the library size changes (not on every metadata write).
  const mediaCount = useGallery((s) => s.media.length);
  const runningRef = useRef(false);

  useEffect(() => {
    const canDetect =
      provider.detectObjects || provider.detectFaces || provider.ocr || provider.embedImage;
    if (!ready || !canDetect || runningRef.current) return;

    // Analyze each image EXACTLY ONCE: every capability is gated on `!analyzedAt`,
    // so once an item has been analyzed (and analyzedAt persisted) it is never
    // re-processed on later reloads — even if an individual result field didn't
    // round-trip through storage. Fresh uploads (no analyzedAt) run everything.
    const needsObjects = (m: MediaItem) => !!provider.detectObjects && !m.analyzedAt;
    const needsFaces = (m: MediaItem) =>
      !!provider.detectFaces && !m.analyzedAt && m.faces === undefined;
    const needsOcr = (m: MediaItem) => !!provider.ocr && !m.analyzedAt && m.ocrText === undefined;
    const needsEmbedding = (m: MediaItem) =>
      !!provider.embedImage && !m.analyzedAt && m.embedding === undefined;
    // Collect items still needing analysis, NEWEST FIRST — so a freshly uploaded or
    // captured photo is tagged immediately instead of waiting behind the whole library.
    const collectPending = () =>
      api
        .getState()
        .media.filter(
          (m) =>
            m.kind === 'image' &&
            !m.deletedAt &&
            m.src &&
            (needsObjects(m) || needsFaces(m) || needsOcr(m) || needsEmbedding(m)),
        )
        .sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0));
    const pending = collectPending();
    if (pending.length === 0) {
      // Nothing to analyze, but faces may already exist (e.g. loaded from the
      // backend) while People is empty — cluster them once so People populates.
      const st = api.getState();
      const hasFaces = st.media.some((m) => (m.faces?.length ?? 0) > 0);
      const hasObjects = st.media.some((m) => m.objectLabels.length > 0);
      // Also (re)build if pets are present but not yet grouped — so libraries
      // analyzed before pet grouping existed pick them up on next load.
      const petsPresent = st.media.some((m) =>
        m.objectLabels.some((l) => (PET_LABELS as readonly string[]).includes(l)),
      );
      const hasPetGroups = st.people.some((p) => p.isPet);
      if ((st.people.length === 0 && (hasFaces || hasObjects)) || (petsPresent && !hasPetGroups)) {
        st.rebuildPeople();
      }
      // Ensure object smart albums exist for an already-analyzed library (e.g. loaded
      // from the backend), even when there's nothing new to analyze.
      if (hasObjects) st.syncObjectAlbums();
      return;
    }

    runningRef.current = true;
    let cancelled = false;
    let done = 0;

    const analyzeOne = async (item: MediaItem) => {
      try {
        const img = await loadImage(item.src);
        // The three capabilities are independent; only run what's missing for this item.
        const wantObjects = needsObjects(item);
        const wantFaces = needsFaces(item);
        const wantOcr = needsOcr(item);
        const wantEmbedding = needsEmbedding(item);
        const [objects, faces, ocrText, embedding] = await Promise.all([
          wantObjects ? (provider.detectObjects!(item, img) ?? []) : Promise.resolve(null),
          wantFaces ? (provider.detectFaces!(item, img) ?? []) : Promise.resolve(null),
          // OCR + embedding are the slowest/most failure-prone legs — isolate each
          // failure so one can't reject the whole Promise.all and abort the others.
          wantOcr ? provider.ocr!(item, img).catch(() => '') : Promise.resolve(null),
          wantEmbedding ? provider.embedImage!(item, img).catch(() => []) : Promise.resolve(null),
        ]);
        const patch: Partial<MediaItem> = { analyzedAt: Date.now() };
        if (objects) {
          patch.objects = objects;
          // Map each detected label through the user's rename map so future uploads
          // are stored/grouped under the renamed label instead of a fresh class.
          const aliases = api.getState().labelAliases;
          const deleted = api.getState().deletedLabels;
          patch.objectLabels = [
            ...new Set(
              objects
                .filter((o) => o.confidence >= CONFIDENCE)
                .map((o) => resolveLabel(o.label, aliases))
                .filter((l) => !deleted.includes(l)),
            ),
          ];
        }
        if (faces) patch.faces = faces;
        // Always patch ocrText/embedding (even '' / []) so their `=== undefined`
        // gates flip and the item isn't reprocessed forever.
        if (ocrText !== null) patch.ocrText = sanitizeOcrText(ocrText);
        if (embedding !== null) patch.embedding = embedding;
        api.getState().updateMedia(item.id, patch);
      } catch {
        // Mark analyzed (incl. faces + ocrText + embedding) on failure so a broken image isn't retried forever.
        api.getState().updateMedia(item.id, {
          analyzedAt: Date.now(),
          faces: item.faces ?? [],
          ocrText: item.ocrText ?? '',
          embedding: item.embedding ?? [],
        });
      } finally {
        done += 1;
        api.getState().setAiStatus({ done });
      }
    };

    const run = async () => {
      api.getState().setAiStatus({ running: true, done: 0, total: pending.length });
      // Drain in rounds: any items imported/captured WHILE a pass runs are picked up
      // by the next round, so uploads get analyzed exactly like captures (no starvation,
      // nothing left behind). Each round re-scans and prioritizes the newest items.
      while (!cancelled) {
        const round = collectPending();
        if (round.length === 0) break;
        api.getState().setAiStatus({ total: done + round.length });
        const queue = [...round];
        const worker = async () => {
          while (!cancelled && queue.length) {
            const item = queue.shift();
            if (item) await analyzeOne(item);
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      }
      runningRef.current = false;
      if (!cancelled) {
        api.getState().setAiStatus({ running: false });
        // Faces and/or objects detected this pass → (re)build People & Pets + object albums.
        if (provider.detectFaces || provider.detectObjects) {
          api.getState().rebuildPeople();
          api.getState().syncObjectAlbums();
        }
      }
    };
    const timer = setTimeout(() => void run(), START_DELAY_MS);

    return () => {
      cancelled = true;
      runningRef.current = false;
      clearTimeout(timer);
    };
  }, [ready, mediaCount, provider, api]);

  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Required so the model can read pixels from a cross-origin image.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
