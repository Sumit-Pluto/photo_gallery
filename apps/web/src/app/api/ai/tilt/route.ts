import { type NextRequest, NextResponse } from 'next/server';

import { RunpodError } from '../../../../lib/runpod/client';
import { rpTilt } from '../../../../lib/runpod/endpoints';

export const runtime = 'nodejs';
export const maxDuration = 60; // cold-start tilt worker can take a while

/**
 * Camera-tilt estimation proxy. Accepts a base64 image and returns
 * {rollDegrees, pitchDegrees, fovDegrees} from the RunPod tilt endpoint
 * (RUNPOD_TILT_URL) so the editor can auto-straighten. Requires the tilt
 * endpoint to be deployed; errors clearly if RUNPOD_TILT_URL is unset.
 */

const MAX_BASE64 = 4_000_000; // ~3 MB decoded

export async function POST(req: NextRequest) {
  let body: { image?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const image = typeof body.image === 'string' ? body.image : '';
  if (!image) return NextResponse.json({ error: 'Missing image.' }, { status: 400 });
  if (image.length > MAX_BASE64) {
    return NextResponse.json({ error: 'Image too large.' }, { status: 413 });
  }

  try {
    const tilt = await rpTilt(image);
    return NextResponse.json(tilt);
  } catch (e) {
    const msg =
      e instanceof RunpodError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Tilt estimate failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
