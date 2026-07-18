import Link from 'next/link';

const FEATURES: Array<{ title: string; body: string }> = [
  { title: 'Pixel-faithful UI', body: 'macOS Photos sidebar, Library (Years/Months/All), Collections, Map and toolbars — in light & dark mode.' },
  { title: 'Albums & Smart Albums', body: 'Create, nest, rename, duplicate. Auto smart albums for Screenshots, Videos, Favourites, RAW and more.' },
  { title: 'Auto source detection', body: 'Camera vs. screenshot vs. download vs. social — classified on import with zero AI cost.' },
  { title: 'Map & places', body: 'Plot located photos on a free OpenStreetMap / satellite map. Map · Satellite · Grid modes.' },
  { title: 'Non-destructive editor', body: 'Exposure, contrast, colour, filters, rotate & flip — applied live, reversible any time.' },
  { title: 'Search & find-similar', body: 'Search by name, place, tag or detected object. Click an object to surface every photo with it.' },
  { title: 'Recycle bin & duplicates', body: '30-day recoverable trash, multi-select, copy/move, and duplicate detection with one-tap merge.' },
  { title: 'Pluggable everything', body: 'Swap the storage adapter (localStorage → S3/Postgres) and AI provider (free in-browser → Gemini).' },
];

export default function Home() {
  return (
    <main style={{ minHeight: '100%' }} className="apg-landing">
      <div className="landing-bg" />

      <header className="landing-nav">
        <div className="brand">
          <span className="brand-dot" />
          Photo Gallery <span className="brand-muted">SDK</span>
        </div>
        <nav className="landing-links">
          <a href="https://github.com" className="muted-link" target="_blank" rel="noreferrer">
            Docs
          </a>
          <Link href="/gallery" className="cta cta-sm">
            Open Gallery
          </Link>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">React · Next.js · TypeScript · tree-shakeable</p>
        <h1>
          The macOS Photos experience,
          <br />
          as a drop-in <span className="grad">SDK</span>.
        </h1>
        <p className="lead">
          A reusable, enterprise-grade photo gallery for any React or Next.js app. Albums, smart
          albums, map, a non-destructive editor, search and recycle bin — behind a single component.
        </p>
        <div className="hero-cta">
          <Link href="/gallery" className="cta">
            Open the Gallery →
          </Link>
          <a href="#usage" className="ghost">
            See the code
          </a>
        </div>

        <div className="window">
          <div className="window-bar">
            <span className="tl tl-r" />
            <span className="tl tl-y" />
            <span className="tl tl-g" />
            <span className="window-title">Photos</span>
          </div>
          <div className="window-body">
            <div className="wb-sidebar">
              {['Library', 'Collections', 'Favourites', 'Map', 'Videos', 'Screenshots', 'People'].map(
                (s, i) => (
                  <div key={s} className={`wb-row ${i === 0 ? 'wb-row--active' : ''}`}>
                    <span className="wb-ico" />
                    {s}
                  </div>
                ),
              )}
            </div>
            <div className="wb-grid">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="wb-tile" style={{ animationDelay: `${i * 18}ms` }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="usage" className="usage">
        <h2>Three lines to a full gallery</h2>
        <pre className="code">
          <code>{`import { PhotoGallery } from '@photo-gallery/sdk';
import '@photo-gallery/sdk/styles.css';

export default function App() {
  return (
    <PhotoGallery
      photos={myPhotos}     // your data, any source
      theme="system"        // light · dark · system
      features={{ editor: true, map: true, import: true }}
    />
  );
}`}</code>
        </pre>
        <p className="usage-note">
          Defaults to a zero-config localStorage backend, so it runs with no server. Provide a
          <code> StorageAdapter</code> or <code> AIProvider</code> to scale up.
        </p>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="final">
        <h2>Try it now</h2>
        <p>The demo ships with 40+ sample photos, videos, locations and tags.</p>
        <Link href="/gallery" className="cta">
          Open the Gallery →
        </Link>
      </section>

      <footer className="landing-foot">
        Built as <code>@photo-gallery/sdk</code> · original implementation, not affiliated with
        Apple.
      </footer>
    </main>
  );
}
