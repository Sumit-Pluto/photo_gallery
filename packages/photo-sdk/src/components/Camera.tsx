'use client';

import { nanoid } from 'nanoid';
import { useEffect, useRef, useState } from 'react';

import { Icon } from '../icons';
import { createMediaItem } from '../lib/media';
import { useGallery, useGalleryStoreApi } from '../store/context';
import type { Annotation, MediaItem } from '../types';
import { Annotations, type AnnotationTool } from './editor/Annotations';

type Mode = 'photo' | 'video';
type Facing = 'user' | 'environment';

const ANN_TOOLS: Array<{ tool: AnnotationTool; label: string; icon: 'check' | 'aspect' | 'chevron-right' | 'crop' | 'tag' | 'wand' }> = [
  { tool: 'select', label: 'Off', icon: 'check' },
  { tool: 'rect', label: 'Box', icon: 'aspect' },
  { tool: 'arrow', label: 'Arrow', icon: 'chevron-right' },
  { tool: 'double-arrow', label: 'Measure', icon: 'crop' },
  { tool: 'text', label: 'Text', icon: 'tag' },
  { tool: 'freehand', label: 'Draw', icon: 'wand' },
];
const ANN_COLORS = ['#ff3b30', '#ffd60a', '#34c759', '#0a84ff', '#ffffff'];

export function Camera() {
  const api = useGalleryStoreApi();
  const open = useGallery((s) => s.cameraOpen);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const locationRef = useRef<MediaItem['location']>(undefined);
  const deviceRef = useRef<{ label?: string; width?: number; height?: number }>({});

  const [mode, setMode] = useState<Mode>('photo');
  const [facing, setFacing] = useState<Facing>('environment');
  const [grid, setGrid] = useState(false);
  const [annTool, setAnnTool] = useState<AnnotationTool>('rect');
  const [annColor, setAnnColor] = useState('#ff3b30');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ url: string; blob: Blob; kind: 'image' | 'video'; w: number; h: number } | null>(null);

  // Start / restart the camera stream when open or facing changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available in this browser.');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        }).catch(async () =>
          navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } }),
        );
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings?.() ?? {};
        deviceRef.current = { label: track?.label || 'Web Camera', width: settings.width, height: settings.height };
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        setError(
          e instanceof Error && e.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access and try again.'
            : 'Could not start the camera.',
        );
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  // Prefetch location when the camera opens so a fix is ready by capture time.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getCurrentLocation().then((loc) => {
      if (!cancelled && loc) locationRef.current = loc;
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset transient state when closing.
  useEffect(() => {
    if (!open) {
      setReview((r) => {
        if (r) URL.revokeObjectURL(r.url);
        return null;
      });
      setAnnotations([]);
      setRecording(false);
    }
  }, [open]);

  if (!open) return null;

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const close = () => {
    if (review) URL.revokeObjectURL(review.url);
    stopStream();
    api.getState().closeCamera();
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Mirror the front camera to match the on-screen preview.
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setReview({ url: URL.createObjectURL(blob), blob, kind: 'image', w: canvas.width, h: canvas.height });
      },
      'image/jpeg',
      0.92,
    );
  };

  const toggleRecord = () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mimeType = types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      const v = videoRef.current;
      setReview({
        url: URL.createObjectURL(blob),
        blob,
        kind: 'video',
        w: v?.videoWidth ?? 1280,
        h: v?.videoHeight ?? 720,
      });
      setRecording(false);
    };
    recorder.start();
    recorderRef.current = recorder;
    recordStartRef.current = Date.now();
    setRecording(true);
  };

  const usePhoto = async () => {
    if (!review) return;
    const now = Date.now();
    const id = nanoid(10);
    const location = locationRef.current ?? (await getCurrentLocation());
    const device = deviceRef.current;
    const exif: Record<string, string | number> = {
      Make: 'Web Camera',
      Model: device.label || 'Web Camera',
    };
    if (device.width && device.height) exif.Resolution = `${device.width}×${device.height}`;
    const duration =
      review.kind === 'video'
        ? Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000))
        : undefined;
    // Prefer the backend (Supabase Storage) for a durable URL; otherwise fall back
    // to a data URL (durable across reloads for BOTH photos and video). Only if that
    // fails do we keep the in-session object URL as a last resort.
    const uploaded = await api.getState().uploadBlob(id, review.blob);
    const src = uploaded ?? (await blobToDataUrl(review.blob).catch(() => review.url));
    const item: MediaItem = createMediaItem({
      id,
      src,
      name: `${review.kind === 'video' ? 'VID' : 'IMG'}_${formatStamp(now)}.${review.kind === 'video' ? 'webm' : 'jpg'}`,
      kind: review.kind,
      mime: review.kind === 'video' ? (review.blob.type || 'video/webm') : 'image/jpeg',
      bytes: review.blob.size,
      width: review.w,
      height: review.h,
      takenAt: now,
      source: 'camera',
      duration,
      location,
      exif,
      edits: annotations.length ? { adjustments: {}, annotations } : undefined,
    });
    api.getState().addMedia([item]);
    setReview(null);
    setAnnotations([]);
    close();
    api.getState().setView('library');
    // Auto object-detection (AIAnalyzer) will tag the new capture when an AI provider is configured.
  };

  const retake = () => {
    if (review) URL.revokeObjectURL(review.url);
    setReview(null);
    setAnnotations([]);
  };

  return (
    <div className="apg-camera" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="apg-camera__bar">
        <button type="button" className="apg-iconbtn" aria-label="Close camera" onClick={close}>
          <Icon name="close" />
        </button>
        <div className="apg-segmented" role="tablist" style={{ margin: '0 auto' }}>
          {(['photo', 'video'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={['apg-segmented__item', mode === m ? 'apg-segmented__item--active' : ''].join(' ')}
              onClick={() => !recording && setMode(m)}
            >
              {m === 'photo' ? 'Photo' : 'Video'}
            </button>
          ))}
        </div>
        <button type="button" className={['apg-iconbtn', grid ? 'apg-iconbtn--on' : ''].join(' ')} aria-label="Grid" onClick={() => setGrid((g) => !g)}>
          <Icon name="aspect" />
        </button>
        <button type="button" className="apg-iconbtn" aria-label="Switch camera" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
          <Icon name="rotate" />
        </button>
      </div>

      <div className="apg-camera__stage">
        {error ? (
          <div className="apg-camera__error">
            <Icon name="camera" size={42} />
            <p>{error}</p>
            <button type="button" className="apg-btn apg-btn--primary" onClick={() => setFacing((f) => f)}>
              Retry
            </button>
          </div>
        ) : review ? (
          <div className="apg-camera__preview">
            {review.kind === 'image' ? (
              <div style={{ position: 'relative', display: 'inline-flex', maxWidth: '100%', maxHeight: '78vh' }}>
                <img src={review.url} alt="Captured" />
                <Annotations
                  annotations={annotations}
                  editable
                  tool={annTool}
                  color={annColor}
                  onChange={setAnnotations}
                />
              </div>
            ) : (
              <video src={review.url} controls autoPlay loop />
            )}
          </div>
        ) : (
          <div className="apg-camera__videowrap" style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}>
            <video ref={videoRef} playsInline muted autoPlay />
            {grid ? <div className="apg-camera__grid" /> : null}
          </div>
        )}
      </div>

      {review?.kind === 'image' ? (
        <div className="apg-camera__markup">
          {ANN_TOOLS.map((t) => (
            <button
              key={t.tool}
              type="button"
              className={['apg-camera__tool', annTool === t.tool ? 'apg-camera__tool--active' : ''].join(' ')}
              onClick={() => setAnnTool(t.tool)}
            >
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          ))}
          <span style={{ width: 1, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
          {ANN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setAnnColor(c)}
              className="apg-camera__swatch"
              style={{ background: c, outline: annColor === c ? '2px solid #fff' : 'none' }}
            />
          ))}
          <span style={{ width: 1, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
          <button
            type="button"
            className="apg-camera__tool"
            disabled={annotations.length === 0}
            onClick={() => setAnnotations((a) => a.slice(0, -1))}
          >
            <Icon name="rotate" size={15} /> Undo
          </button>
          <button
            type="button"
            className="apg-camera__tool"
            disabled={annotations.length === 0}
            onClick={() => setAnnotations([])}
          >
            <Icon name="trash" size={15} /> Clear
          </button>
        </div>
      ) : null}

      <div className="apg-camera__controls">
        {review ? (
          <>
            <button type="button" className="apg-btn" onClick={retake}>
              Retake
            </button>
            <button type="button" className="apg-btn apg-btn--primary" onClick={() => void usePhoto()}>
              Use {review.kind === 'video' ? 'Video' : 'Photo'}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={['apg-camera__shutter', mode === 'video' ? 'apg-camera__shutter--video' : '', recording ? 'apg-camera__shutter--recording' : ''].join(' ')}
            aria-label={mode === 'video' ? (recording ? 'Stop recording' : 'Record') : 'Capture photo'}
            disabled={Boolean(error)}
            onClick={mode === 'photo' ? capturePhoto : toggleRecord}
          />
        )}
      </div>
    </div>
  );
}

function getCurrentLocation(): Promise<MediaItem['location'] | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 300_000 },
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

function formatStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
