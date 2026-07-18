import type { GalleryFeatures, ThemeTokens } from '@photo-gallery/sdk';

/**
 * Reads NEXT_PUBLIC_APG_* environment variables into <PhotoGallery> props so the
 * whole gallery can be customized without touching code. Every value is optional
 * — anything unset falls back to the SDK's built-in defaults (dark/light/semi-dark).
 *
 * See docs/ENV.md for the full list.
 *
 * NOTE: Next.js only inlines NEXT_PUBLIC_* vars that are referenced statically, so
 * each one is read explicitly below (not via a dynamic key).
 */

const bool = (v: string | undefined): boolean | undefined =>
  v === undefined || v === '' ? undefined : v === 'true' || v === '1';

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Drop undefined entries so partial objects don't clobber SDK defaults. */
function compact<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function getFeaturesFromEnv(): Partial<GalleryFeatures> {
  return compact({
    editor: bool(process.env.NEXT_PUBLIC_APG_EDITOR),
    camera: bool(process.env.NEXT_PUBLIC_APG_CAMERA),
    ai: bool(process.env.NEXT_PUBLIC_APG_AI),
    map: bool(process.env.NEXT_PUBLIC_APG_MAP),
    import: bool(process.env.NEXT_PUBLIC_APG_IMPORT),
    export: bool(process.env.NEXT_PUBLIC_APG_EXPORT),
    sharing: bool(process.env.NEXT_PUBLIC_APG_SHARING),
  });
}

export function getThemeTokensFromEnv(): ThemeTokens | undefined {
  const tokens = compact({
    bgLight: process.env.NEXT_PUBLIC_APG_BG_LIGHT || undefined,
    bgDark: process.env.NEXT_PUBLIC_APG_BG_DARK || undefined,
    elevatedLight: process.env.NEXT_PUBLIC_APG_ELEVATED_LIGHT || undefined,
    elevatedDark: process.env.NEXT_PUBLIC_APG_ELEVATED_DARK || undefined,
    sidebarBgLight: process.env.NEXT_PUBLIC_APG_SIDEBAR_BG_LIGHT || undefined,
    sidebarBgDark: process.env.NEXT_PUBLIC_APG_SIDEBAR_BG_DARK || undefined,
    textLight: process.env.NEXT_PUBLIC_APG_TEXT_LIGHT || undefined,
    textDark: process.env.NEXT_PUBLIC_APG_TEXT_DARK || undefined,
    sidebarRadius: num(process.env.NEXT_PUBLIC_APG_SIDEBAR_RADIUS),
    accent: process.env.NEXT_PUBLIC_APG_ACCENT || undefined,
  }) as ThemeTokens;
  return Object.keys(tokens).length ? tokens : undefined;
}

export interface EnvGalleryConfig {
  features: Partial<GalleryFeatures>;
  themeTokens?: ThemeTokens;
  borderRadius?: number;
  theme?: 'system' | 'light' | 'dark' | 'semi-dark';
}

export function getGalleryConfigFromEnv(): EnvGalleryConfig {
  const theme = process.env.NEXT_PUBLIC_APG_THEME as EnvGalleryConfig['theme'] | undefined;
  // Accent comes through themeTokens.accent (PhotoGallery reads it there) — no
  // separate accentColor field, to avoid a confusing double source for one env var.
  return {
    features: getFeaturesFromEnv(),
    themeTokens: getThemeTokensFromEnv(),
    borderRadius: num(process.env.NEXT_PUBLIC_APG_RADIUS),
    theme: theme || undefined,
  };
}
