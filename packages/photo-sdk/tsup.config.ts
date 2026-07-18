import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ['react', 'react-dom'],
  // CSS is shipped separately (copied in the build script) so any consumer
  // can `import '@photo-gallery/sdk/styles.css'` regardless of their bundler.
});
