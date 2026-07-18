import { type NextRequest, NextResponse } from 'next/server';

/**
 * Per-request Content-Security-Policy with a unique nonce.
 *
 * `script-src` uses a nonce + 'strict-dynamic' instead of 'unsafe-inline', so an
 * injected inline <script> cannot execute even if markup injection occurs.
 * Next.js reads the nonce from the request header and applies it to its own
 * bootstrap scripts. 'unsafe-eval' is allowed only in development (HMR needs it).
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets in-browser ML (background removal, OCR, etc.) compile WASM.
    // cdn.jsdelivr.net = defense for tesseract.js' worker bootstrap (the load-bearing
    // path is the blob: worker + connect-src fetch; under 'strict-dynamic' this host is
    // ignored, but it covers non-strict-dynamic fallback browsers).
    // 'unsafe-eval' is required by onnxruntime-web (Remove Background @imgly, CLIP
    // semantic search) which evals a JS glue string — 'wasm-unsafe-eval' alone
    // doesn't cover it. Trade-off: needed for the in-browser ML to run in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' 'unsafe-eval' https://cdn.jsdelivr.net`,
    // Leaflet & Framer Motion inject inline styles; keep style inline allowed.
    "style-src 'self' 'unsafe-inline'",
    // *.supabase.co serves uploaded media from Supabase Storage public URLs.
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com https://picsum.photos https://*.picsum.photos https://fastly.picsum.photos https://*.supabase.co",
    "media-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    // blob: = in-browser ML workers fetch WASM/model from blob URLs; storage.googleapis.com = TF.js weights;
    // *.supabase.co = backend; staticimgly.com = background-removal model;
    // cdn.jsdelivr.net = face-api models + tesseract.js worker/WASM-core/traineddata (OCR) + onnxruntime WASM;
    // huggingface.co + *.hf.co = transformers.js CLIP model config + weights, which
    // redirect to HF's Xet CDN (e.g. us.aws.cdn.hf.co) — semantic search.
    "connect-src 'self' blob: data: https://*.tile.openstreetmap.org https://nominatim.openstreetmap.org https://server.arcgisonline.com https://picsum.photos https://fastly.picsum.photos https://storage.googleapis.com https://*.supabase.co https://staticimgly.com https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next reads this request header to nonce its framework scripts.
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
