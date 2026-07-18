import type { Config } from 'tailwindcss';

// Tailwind is used for the demo's own landing page chrome only.
// The SDK ships its own self-contained stylesheet (no Tailwind required).
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'Inter',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
