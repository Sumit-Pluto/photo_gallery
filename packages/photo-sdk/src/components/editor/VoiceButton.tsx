'use client';

import { useRef, useState } from 'react';

import { blobToWavBase64, startRecording, wavBase64ToBlob, type Recorder } from '../../lib/audioCapture';
import { Icon } from '../../icons';
import { useAIProvider } from '../aiContext';

/**
 * Reusable dictation button: record → (optional AI denoise) → transcribe → onText.
 * Renders nothing if the AI provider can't transcribe. Used by the image-markup
 * Text tool, the video Text overlay, and the Info comment box.
 */
export function VoiceButton({
  onText,
  denoise = false,
  label = 'Speak',
  size = 14,
}: {
  onText: (text: string) => void;
  denoise?: boolean;
  label?: string;
  size?: number;
}) {
  const provider = useAIProvider();
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const recRef = useRef<Recorder | null>(null);

  if (!provider?.transcribeAudio) return null;

  const start = async () => {
    setStatus(null);
    try {
      recRef.current = await startRecording();
      setRecording(true);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Microphone unavailable.');
    }
  };

  const stop = async () => {
    const rec = recRef.current;
    recRef.current = null;
    setRecording(false);
    if (!rec || !provider.transcribeAudio) return;
    try {
      const blob = await rec.stop();
      let wav: string;
      if (denoise && provider.denoiseAudio) {
        setStatus('Reducing noise…');
        const w48 = await blobToWavBase64(blob, 48000);
        const cleaned = await provider.denoiseAudio(w48);
        wav = await blobToWavBase64(wavBase64ToBlob(cleaned), 16000);
      } else {
        wav = await blobToWavBase64(blob, 16000);
      }
      setStatus('Transcribing…');
      const t = (await provider.transcribeAudio(wav)).trim();
      if (t) onText(t);
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not transcribe.');
    }
  };

  return (
    <span className="apg-voice">
      <button
        type="button"
        className={`apg-btn apg-btn--small apg-voice__mic${recording ? ' apg-voice__mic--rec' : ''}`}
        onClick={recording ? stop : start}
        aria-label={recording ? 'Stop recording' : 'Dictate text'}
        title={recording ? 'Stop & transcribe' : 'Speak to type'}
      >
        <Icon name={recording ? 'check' : 'mic'} size={size} />
        {recording ? 'Stop' : label}
      </button>
      {recording || status ? (
        <span className="apg-voice__status" aria-live="polite">
          {recording ? '● Listening…' : status}
        </span>
      ) : null}
    </span>
  );
}
