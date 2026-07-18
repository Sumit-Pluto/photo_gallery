'use client';

import { PhotoGallery, type StorageAdapter } from '@photo-gallery/sdk';
import { useEffect, useMemo, useState } from 'react';

import { createDemoAIProvider } from '../lib/ai/createDemoAIProvider';
import { getGalleryConfigFromEnv } from '../lib/galleryConfig';
import { buildSeedPhotos } from '../lib/seed';

export function GalleryClient() {
  // Render the gallery only after mount — it relies on browser APIs
  // (localStorage, matchMedia, Leaflet) and should not be server-rendered.
  const [mounted, setMounted] = useState(false);
  // undefined = still resolving; null = no backend (use default localStorage).
  const [adapter, setAdapter] = useState<StorageAdapter | null | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    void (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anonKey) {
        setAdapter(null);
        return;
      }
      // Lazy-load the Supabase client so it isn't in the initial bundle.
      const { createSupabaseAdapter } = await import('../lib/adapters/supabaseAdapter');
      if (!cancelled) {
        setAdapter(
          createSupabaseAdapter({
            url,
            anonKey,
            bucket: process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'media',
          }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const photos = useMemo(() => buildSeedPhotos(), []);
  // AI: in-browser object detection (free) + Gemini generative edits (server-proxied).
  const ai = useMemo(() => createDemoAIProvider(), []);

  // Wait for mount + adapter resolution so we initialize on the right backend once.
  if (!mounted || adapter === undefined) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          background: '#1c1c1e',
          color: '#aeaeb2',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Loading Photos…
      </div>
    );
  }

  // Optional NEXT_PUBLIC_APG_* env overrides (theme colors/gradients, sidebar,
  // per-feature flags). Unset values fall back to the defaults below. See docs/ENV.md.
  const env = getGalleryConfigFromEnv();

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <PhotoGallery
        photos={photos}
        theme={env.theme ?? 'system'}
        ai={ai}
        adapter={adapter ?? undefined}
        borderRadius={env.borderRadius}
        themeTokens={env.themeTokens}
        features={{
          editor: true,
          camera: true,
          ai: true,
          map: true,
          import: true,
          export: true,
          sharing: true,
          ...env.features,
        }}
      />
    </div>
  );
}
