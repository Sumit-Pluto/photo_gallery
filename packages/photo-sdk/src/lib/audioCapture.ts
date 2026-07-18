/**
 * Microphone capture + WAV (PCM16) encoding — browser-only, no external deps.
 *
 * Powers the voice-annotation UI: record speech, optionally run it through the
 * audio-denoise model, then transcribe. Records via MediaRecorder, then decodes
 * and resamples with the Web Audio API to the mono sample rate each model wants
 * (16 kHz for speech-to-text, 48 kHz for denoise) and encodes 16-bit PCM WAV.
 *
 * All browser globals are touched at call time (never module top-level), so
 * importing this on the server is safe.
 */

export interface Recorder {
  /** Stop recording, release the mic, and resolve with the recorded audio blob. */
  stop(): Promise<Blob>;
  /** Abort without producing a blob (still releases the mic). */
  cancel(): void;
}

/** Begin recording from the default microphone. Rejects if mic access is denied. */
export async function startRecording(): Promise<Recorder> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone is not available in this browser.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const release = () => stream.getTracks().forEach((t) => t.stop());
  recorder.start();

  const collect = () => new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });

  return {
    stop() {
      return new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          release();
          resolve(collect());
        };
        try {
          recorder.stop();
        } catch {
          release();
          resolve(collect());
        }
      });
    },
    cancel() {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
      release();
    },
  };
}

/**
 * Decode any recorded audio blob, downmix to mono, resample to `sampleRate`, and
 * return base64 (no `data:` prefix) of a 16-bit PCM WAV.
 */
export async function blobToWavBase64(blob: Blob, sampleRate: number): Promise<string> {
  const arrayBuf = await blob.arrayBuffer();
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioCtx) throw new Error('Web Audio is not supported in this browser.');

  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    // slice(0) — decodeAudioData detaches the buffer; keep a copy.
    decoded = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    void decodeCtx.close();
  }

  // Downmix (multi-channel → 1) + resample via an OfflineAudioContext at the target rate.
  const frames = Math.max(1, Math.round(decoded.duration * sampleRate));
  const offline = new OfflineAudioContext(1, frames, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return base64FromBytes(new Uint8Array(encodeWavPcm16(rendered.getChannelData(0), sampleRate)));
}

/** Turn base64 WAV (as returned by the denoise model) back into a Blob. */
export function wavBase64ToBlob(base64: string): Blob {
  const clean = base64.includes(',') ? base64.split(',', 2)[1]! : base64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'audio/wav' });
}

function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate = sampleRate * blockAlign
  view.setUint16(32, 2, true); // block align = channels * bytesPerSample
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function base64FromBytes(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
