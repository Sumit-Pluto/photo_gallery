import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';

import './globals.css';
// The SDK's self-contained stylesheet + Leaflet's CSS for the Map view.
import '@photo-gallery/sdk/styles.css';
import 'leaflet/dist/leaflet.css';

export const metadata: Metadata = {
  title: 'Photo Gallery SDK — macOS Photos for the web',
  description:
    'A reusable, macOS Photos-style photo gallery for React / Next.js. Albums, smart albums, map, editor, search and more — drop-in via one component.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a84ff',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the per-request nonce header opts every route into dynamic rendering,
  // which lets Next apply the CSP nonce (set in middleware.ts) to its framework
  // scripts — required for the nonce-based, no-'unsafe-inline' script policy.
  void (await headers()).get('x-nonce');

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
