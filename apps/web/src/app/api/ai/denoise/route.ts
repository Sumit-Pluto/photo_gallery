import { type NextRequest, NextResponse } from 'next/server';

import { RunpodError } from '../../../../lib/runpod/client';
import { rpDenoiseAudio } from '../../../../lib/runpod/endpoints';

export const runtime = 'nodejs';
export const maxDuration = 60; // cold-start denoise worker can take a while

/**
 * Audio noise-removal proxy. Accepts base64 WAV (48 kHz mono PCM16, produced
 * in-browser by lib/audioCapture) and returns a cleaned base64 WAV. Calls the
 * RunPod audio-denoise endpoint (RUNPOD_AUDIO_DENOISE_URL) — key stays
 * server-side. Used before transcription on noisy sites. See docs/AI-SETUP.md.
 */

const MAX_BASE64 = 12_000_000; // ~9 MB decoded WAV

export async function POST(req: NextRequest) {
  let body: { audio?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const audio = typeof body.audio === 'string' ? body.audio : '';
  if (!audio) return NextResponse.json({ error: 'Missing audio.' }, { status: 400 });
  if (audio.length > MAX_BASE64) {
    return NextResponse.json({ error: 'Audio too long — keep it under ~30s.' }, { status: 413 });
  }

  try {
    const { audioB64 } = await rpDenoiseAudio(audio);
    return NextResponse.json({ audio: audioB64 });
  } catch (e) {
    const msg =
      e instanceof RunpodError ? e.message : e instanceof Error ? e.message : 'Denoise failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
