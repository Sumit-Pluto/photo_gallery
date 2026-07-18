'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

import { createLocalStorageAdapter } from '../adapters/localStorage';
import type { StorageAdapter } from '../adapters/types';
import type { AIProvider } from '../ai/types';
import { normalizeMediaItem, type MediaInput } from '../lib/media';
import { GalleryStoreContext, useGallery, useGalleryStoreApi } from '../store/context';
import {
  createGalleryStore,
  DEFAULT_FEATURES,
  type GalleryConfig,
  type GalleryFeatures,
  type GalleryStore,
  type ThemeTokens,
} from '../store/store';
import type { Album, MediaItem, ThemePreference } from '../types';
import { AIAnalyzer } from './AIAnalyzer';
import { SemanticSearch } from './SemanticSearch';
import { AIProviderContext } from './aiContext';
import { AppShell } from './AppShell';
import { Camera } from './Camera';
import { ContextMenuHost } from './ContextMenu';
import { PhotoEditor } from './editor/PhotoEditor';
import { VideoEditor } from './editor/VideoEditor';
import { InfoPanel } from './InfoPanel';
import { Lightbox } from './Lightbox';
import { ModalHost } from './Modal';

export interface PhotoGalleryProps {
  /** Initial media. Accepts full MediaItems or loose `{ src, name?, ... }` inputs. */
  photos?: Array<MediaItem | MediaInput>;
  /** Initial user albums. */
  albums?: Album[];
  /** Storage backend. Defaults to a zero-config localStorage adapter. */
  adapter?: StorageAdapter;
  /** AI provider for object/face/caption/search. Pass `false` to disable. */
  ai?: AIProvider | boolean;
  theme?: ThemePreference;
  accentColor?: string;
  /** Base corner radius in px (default 10). Drives all rounded UI. */
  borderRadius?: number;
  /** Per-theme color / gradient / radius overrides (mapped to CSS variables). */
  themeTokens?: ThemeTokens;
  features?: Partial<GalleryFeatures>;
  /** Render the macOS-style traffic-light title bar. */
  showWindowChrome?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
  onReady?: () => void;
}

export function PhotoGallery(props: PhotoGalleryProps) {
  const {
    photos,
    albums,
    adapter,
    ai,
    theme = 'system',
    accentColor,
    borderRadius,
    themeTokens,
    features,
    showWindowChrome = false,
    title = 'Photos',
    className,
    style,
    onReady,
  } = props;

  // Resolve adapter / AI once.
  const adapterRef = useRef<StorageAdapter | null>(null);
  if (!adapterRef.current) {
    adapterRef.current = adapter ?? createLocalStorageAdapter();
  }
  const aiProvider: AIProvider | null = useMemo(
    () => (ai && typeof ai === 'object' ? ai : null),
    [ai],
  );

  const config: GalleryConfig = useMemo(
    () => ({
      features: { ...DEFAULT_FEATURES, ...features },
      accentColor: themeTokens?.accent ?? accentColor ?? '#0a84ff',
      borderRadius: borderRadius ?? 10,
      showWindowChrome,
      title,
      themeTokens,
    }),
    [features, accentColor, borderRadius, themeTokens, showWindowChrome, title],
  );

  // Create the store exactly once for this gallery instance.
  const [store] = useState<GalleryStore>(() =>
    createGalleryStore({
      config,
      // Normalize + sanitize every input (loose or full MediaItem) through one path.
      initialMedia: (photos ?? [])
        .map((p) => normalizeMediaItem(p))
        .filter((m): m is MediaItem => m !== null),
      initialAlbums: albums ?? [],
    }),
  );

  // Apply the initial theme preference into the store.
  useEffect(() => {
    store.getState().setTheme(theme);
  }, [store, theme]);

  return (
    <GalleryStoreContext.Provider value={store}>
      <GalleryRoot
        adapter={adapterRef.current}
        ai={aiProvider}
        className={className}
        style={style}
        onReady={onReady}
      />
    </GalleryStoreContext.Provider>
  );
}

interface GalleryRootProps {
  adapter: StorageAdapter;
  ai: AIProvider | null;
  className?: string;
  style?: CSSProperties;
  onReady?: () => void;
}

function GalleryRoot({ adapter, ai, className, style, onReady }: GalleryRootProps) {
  const api = useGalleryStoreApi();
  const ready = useGallery((s) => s.ready);
  const theme = useGallery((s) => s.theme);
  const resolvedTheme = useGallery((s) => s.resolvedTheme);
  const accent = useGallery((s) => s.config.accentColor);
  const radius = useGallery((s) => s.config.borderRadius);
  const tokens = useGallery((s) => s.config.themeTokens);
  const showChrome = useGallery((s) => s.config.showWindowChrome);
  const aiEnabled = useGallery((s) => s.config.features.ai);
  const cameraEnabled = useGallery((s) => s.config.features.camera);

  // Initialize (load persisted state) EXACTLY once — the ref guard prevents a
  // double init() (React Strict Mode / remounts) from re-seeding an empty backend.
  const initedRef = useRef(false);
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    void api.getState().init(adapter, ai);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  // Resolve "system" theme and react to OS changes.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      api.getState().setResolvedTheme(theme === 'system' ? 'light' : theme);
      return;
    }
    if (theme !== 'system') {
      api.getState().setResolvedTheme(theme);
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => api.getState().setResolvedTheme(mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [api, theme]);

  // Map optional theme tokens → CSS variables for the active theme. Dark values
  // apply in dark mode and to the semi-dark sidebar; light values elsewhere.
  const dark = resolvedTheme === 'dark';
  const tokenVars: Record<string, string> = {};
  if (tokens) {
    // Colors/gradients only — reject url()/expression()/JS or CSS breakout chars
    // (defense-in-depth; tokens normally come from build-time env, not user input).
    const CSS_UNSAFE = /(url\(|expression\(|javascript:|[<>{}])/i;
    const set = (v: string | undefined, name: string) => {
      if (v && !CSS_UNSAFE.test(v)) tokenVars[name] = v;
    };
    const bg = dark ? tokens.bgDark : tokens.bgLight;
    set(bg, '--apg-bg');
    set(bg, '--apg-bg-content');
    set(dark ? tokens.elevatedDark : tokens.elevatedLight, '--apg-bg-elevated');
    // In semi-dark the sidebar is always the dark glass value.
    set(resolvedTheme === 'semi-dark' ? tokens.sidebarBgDark : dark ? tokens.sidebarBgDark : tokens.sidebarBgLight, '--apg-sidebar-bg');
    set(dark ? tokens.textDark : tokens.textLight, '--apg-text');
    if (typeof tokens.sidebarRadius === 'number') tokenVars['--apg-sidebar-radius'] = `${tokens.sidebarRadius}px`;
  }

  const rootStyle: CSSProperties = {
    ['--apg-accent' as string]: accent,
    ['--apg-radius' as string]: `${radius}px`,
    ['--apg-radius-sm' as string]: `${Math.max(2, Math.round(radius * 0.6))}px`,
    ['--apg-radius-lg' as string]: `${Math.round(radius * 1.4)}px`,
    ['--apg-radius-xl' as string]: `${Math.round(radius * 2)}px`,
    ...tokenVars,
    ...style,
  };

  return (
    <AIProviderContext.Provider value={aiEnabled ? ai : null}>
      <div
        className={['apg', className].filter(Boolean).join(' ')}
        data-theme={resolvedTheme}
        style={rootStyle}
      >
        {showChrome ? <WindowChrome /> : null}
        <div className="apg__body">
          <AppShell />
        </div>
        <Lightbox />
        <PhotoEditor />
        <VideoEditor />
        <InfoPanel />
        {cameraEnabled ? <Camera /> : null}
        <ModalHost />
        <ContextMenuHost />
        {ai && aiEnabled ? <AIAnalyzer provider={ai} /> : null}
        {ai && aiEnabled ? <SemanticSearch provider={ai} /> : null}
      </div>
    </AIProviderContext.Provider>
  );
}

function WindowChrome() {
  const title = useGallery((s) => s.config.title);
  return (
    <div className="apg-titlebar">
      <div className="apg-traffic">
        <span className="apg-traffic__dot apg-traffic__dot--red" />
        <span className="apg-traffic__dot apg-traffic__dot--yellow" />
        <span className="apg-traffic__dot apg-traffic__dot--green" />
      </div>
      <div className="apg-titlebar__title">{title}</div>
    </div>
  );
}
