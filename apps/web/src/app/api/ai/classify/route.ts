import { type NextRequest, NextResponse } from 'next/server';

import { RunpodError } from '../../../../lib/runpod/client';
import { rpDetect } from '../../../../lib/runpod/endpoints';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BASE64 = 4_000_000; // ~3 MB decoded — under serverless body limits

/**
 * Object-detection proxy for the RunPod YOLO construction-material classifier (#1).
 * The key + endpoint URL stay server-side. The client (runpodYoloProvider) calls
 * this only when NEXT_PUBLIC_APG_RUNPOD_DETECT is on; otherwise detection runs
 * fully in-browser (COCO-SSD) with no server round-trip. Returns the SDK's
 * DetectedObject[] shape (box as 0..1 fractions) so it drops straight into the
 * existing Objects browser / smart albums / search.
 */
export async function POST(req: NextRequest) {
  if (!process.env.RUNPOD_API_KEY || !process.env.RUNPOD_YOLO_URL) {
    return NextResponse.json(
      { error: 'RunPod detection is not configured (set RUNPOD_API_KEY + RUNPOD_YOLO_URL).' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { imageBase64, width, height } = (body ?? {}) as {
    imageBase64?: unknown;
    width?: unknown;
    height?: unknown;
  };
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0 || imageBase64.length > MAX_BASE64) {
    return NextResponse.json({ error: 'Invalid or oversized image.' }, { status: 400 });
  }
  const w = Number(width);
  const h = Number(height);

  try {
    const objects = await rpDetect(
      imageBase64,
      Number.isFinite(w) && w > 0 ? w : 1,
      Number.isFinite(h) && h > 0 ? h : 1,
    );
    return NextResponse.json({ objects });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Detection failed.';
    const status = err instanceof RunpodError ? err.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
