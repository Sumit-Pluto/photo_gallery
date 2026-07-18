# @photo-gallery/sdk

A reusable, macOS Photos-style photo gallery for React / Next.js — light & dark, fully responsive,
pluggable storage and AI. One component, no required CSS framework.

```tsx
import { PhotoGallery } from '@photo-gallery/sdk';
import '@photo-gallery/sdk/styles.css';

export default () => <PhotoGallery photos={myPhotos} theme="system" />;
```

See the [repository README](../../README.md) for full documentation, props, adapters and the
AI-provider interface.

## Build

```bash
pnpm build   # → dist/ : index.js (ESM), index.cjs (CJS), index.d.ts, styles.css
```

The package exports source from `src/` for zero-build use inside the monorepo (via
`transpilePackages`), and `dist/` is produced for external publishing.

MIT · Original implementation, not affiliated with Apple.
