import { type NextRequest, NextResponse } from 'next/server';

import { RunpodError } from '../../../../lib/runpod/client';
import { rpTranscribe } from '../../../../lib/runpod/endpoints';

export const runtime = 'nodejs';
export const maxDuration = 60; // cold-start STT worker can take a while

/**
 * Speech-to-text proxy for voice annotations. Accepts base64 WAV (16 kHz mono
 * PCM16, produced in-browser by lib/audioCapture) and returns the transcript.
 * Calls the RunPod voice-to-text endpoint (RUNPOD_STT_URL) — the key stays
 * server-side. See docs/AI-SETUP.md.
 */

const MAX_BASE64 = 8_000_000; // ~6 MB decoded WAV — stays under serverless body limits

export async function POST(req: NextRequest) {
  let body: { audio?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const audio = typeof body.audio === 'string' ? body.audio : '';
  const language = typeof body.language === 'string' ? body.language : undefined;
  if (!audio) return NextResponse.json({ error: 'Missing audio.' }, { status: 400 });
  if (audio.length > MAX_BASE64) {
    return NextResponse.json({ error: 'Audio too long — keep it under ~30s.' }, { status: 413 });
  }

  try {
    const { transcript, segments } = await rpTranscribe(audio, { language, punctuation: true });
    return NextResponse.json({ transcript, segments });
  } catch (e) {
    const msg =
      e instanceof RunpodError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Transcription failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
