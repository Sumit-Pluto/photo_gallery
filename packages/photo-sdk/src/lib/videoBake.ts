import type { EditState } from '../types';
import { editFilterCss } from './edits';
import {
  normalizeSegments,
  outputDuration,
  resolveOverlays,
  sampleOverlay,
  videoOutputSize,
} from './videoTimeline';

/**
 * Bake a video's edits into a NEW clip — entirely in the browser, no server and
 * no ffmpeg/SharedArrayBuffer (which would break the strict CSP).
 *
 * Timeline engine: ONE MediaRecorder runs continuously while an offscreen <video>
 * is driven across the ordered keep-segments (seek → set playbackRate → play → draw
 * until the segment's end → next). Because the recorder never stops between segments,
 * they concatenate automatically. Each frame is drawn to a <canvas> applying crop +
 * 90° rotation + flips + the CSS filter, then image/text overlays resolved at the
 * current OUTPUT time (keyframe-interpolated), then legacy annotations. Audio (original
 * ± music, with master fade in/out) is mixed through WebAudio into the recorded stream.
 *
 * Real-time: exporting N output-seconds takes ~N seconds. Progress is reported 0..1.
 */

export interface VideoBakeResult {
  blob: Blob;
  durationSec: number;
  mime: string;
  width: number;
  height: number;
  /** JPEG data URL poster grabbed from the chosen frame (edits.posterTime). */
  poster?: string;
}

function pickMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  const MR = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null;
  for (const m of candidates) {
    if (MR && MR.isTypeSupported(m)) return m;
  }
  return 'video/webm';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Rasterize a live annotations <svg> at the export resolution (vector → bitmap). */
function rasterizeSvg(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vbW = svg.clientWidth || w;
  const vbH = svg.clientHeight || h;
  clone.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const xml = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  return loadImage(url);
}

const seekTo = (video: HTMLVideoElement, t: number) =>
  new Promise<void>((res) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      res();
    };
    video.addEventListener('seeked', done);
    // Nudge so a seek to the current time still fires 'seeked'.
    video.currentTime = Math.max(0, t);
    // Fallback in case 'seeked' never fires (some codecs at exact boundaries).
    setTimeout(done, 600);
  });

/** Map an output-timeline time to the corresponding SOURCE time (for poster grab). */
function outputToSourceTime(
  segs: { start: number; end: number; speed?: number }[],
  outT: number,
): number {
  let acc = 0;
  for (const s of segs) {
    const d = (s.end - s.start) / (s.speed || 1);
    if (outT <= acc + d) return s.start + (outT - acc) * (s.speed || 1);
    acc += d;
  }
  const last = segs[segs.length - 1];
  return last ? last.end : outT;
}

export interface VideoBakeOptions {
  /** Live annotations SVG from the preview, rasterized over every frame. */
  annotationsSvg?: SVGSVGElement | null;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  maxDim?: number;
}

export async function bakeVideo(
  src: string,
  edits: EditState,
  opts: VideoBakeOptions = {},
): Promise<VideoBakeResult> {
  const maxDim = edits.export?.maxDim ?? opts.maxDim ?? 1280;
  const fps = edits.export?.fps ?? 30;

  // 1) Offscreen source video (separate from the on-screen preview).
  const video = document.createElement('video');
  video.src = src;
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.muted = true; // reliable autoplay; audio is tapped via WebAudio below
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error('Could not load video for export.'));
  });

  const srcW = video.videoWidth || 1280;
  const srcH = video.videoHeight || 720;
  const totalDur = video.duration || 0;

  // 2) Geometry (crop + 90° rotation + flips) → output canvas size.
  const geo = videoOutputSize(srcW, srcH, edits, maxDim);
  const { W, H, contentW, contentH, cropX, cropY, cropW, cropH, rot } = geo;
  const flipH = !!edits.flipH;
  const flipV = !!edits.flipV;

  // 3) Timeline: ordered keep-segments + total output duration.
  const segs = normalizeSegments(edits, totalDur);
  const outDur = Math.max(0.1, outputDuration(segs));

  // 4) Overlays: preload images; resolve legacy single overlay too.
  const overlays = resolveOverlays(edits);
  const imgMap = new Map<string, HTMLImageElement>();
  await Promise.all(
    overlays
      .filter((o) => o.kind === 'image' && o.src)
      .map(async (o) => {
        const img = await loadImage(o.src!).catch(() => null);
        if (img) imgMap.set(o.id, img);
      }),
  );
  const annoImg = opts.annotationsSvg
    ? await rasterizeSvg(opts.annotationsSvg, W, H).catch(() => null)
    : null;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const filter = editFilterCss(edits) || 'none';

  // 5) Audio graph: original (volume/mute) + music → master gain (fades) → stream.
  const AC: typeof AudioContext =
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    AudioContext;
  const ac = new AC();
  const dest = ac.createMediaStreamDestination();
  const master = ac.createGain();
  master.connect(dest);
  let music: HTMLAudioElement | null = null;
  try {
    const vNode = ac.createMediaElementSource(video);
    const vGain = ac.createGain();
    vGain.gain.value = edits.audio?.muted ? 0 : (edits.audio?.originalVolume ?? 1);
    vNode.connect(vGain).connect(master);
  } catch {
    /* element may have no audio track */
  }
  if (edits.audio?.musicSrc) {
    music = new Audio(edits.audio.musicSrc);
    music.crossOrigin = 'anonymous';
    music.loop = true;
    try {
      const mNode = ac.createMediaElementSource(music);
      const gain = ac.createGain();
      gain.gain.value = edits.audio.musicVolume ?? 0.8;
      mNode.connect(gain).connect(master);
    } catch {
      /* ignore */
    }
  }

  // 6) Recorder over canvas video + mixed audio.
  const stream = canvas.captureStream(fps);
  const audioTrack = dest.stream.getAudioTracks()[0];
  if (audioTrack) stream.addTrack(audioTrack);
  const mime = pickMime();
  const recorderOpts: MediaRecorderOptions = { mimeType: mime };
  if (edits.export?.bitrate) recorderOpts.videoBitsPerSecond = edits.export.bitrate;
  const recorder = new MediaRecorder(stream, recorderOpts);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => {
    recorder.onstop = () => res();
  });

  // Per-frame compositor. `outClock` is the elapsed OUTPUT time (drives keyframes).
  const drawFrame = (outClock: number, withOverlays = true) => {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.filter = filter;
    ctx.drawImage(video, cropX, cropY, cropW, cropH, -contentW / 2, -contentH / 2, contentW, contentH);
    ctx.filter = 'none';
    ctx.restore();

    if (withOverlays) {
      for (const o of overlays) {
        const s = sampleOverlay(o, outClock);
        if (!s.visible || s.opacity <= 0) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity));
        if (o.kind === 'image') {
          const img = imgMap.get(o.id);
          if (img) {
            const ow = W * s.scale;
            const oh = ow * (img.height / Math.max(1, img.width));
            ctx.translate(s.x * W + ow / 2, s.y * H + oh / 2);
            if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180);
            ctx.drawImage(img, -ow / 2, -oh / 2, ow, oh);
          }
        } else {
          const fsize = Math.max(8, (o.fontSize ?? 0.08) * H);
          ctx.font = `${o.bold ? '700 ' : ''}${fsize}px system-ui, -apple-system, sans-serif`;
          ctx.textBaseline = 'top';
          ctx.translate(s.x * W, s.y * H);
          if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180);
          ctx.lineWidth = Math.max(2, fsize * 0.12);
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.fillStyle = o.color ?? '#ffffff';
          ctx.strokeText(o.text ?? '', 0, 0);
          ctx.fillText(o.text ?? '', 0, 0);
        }
        ctx.restore();
      }
    }
    if (annoImg) ctx.drawImage(annoImg, 0, 0, W, H);
  };

  // 7) Prime first segment, start recorder + audio + fades.
  await seekTo(video, segs[0]!.start);
  drawFrame(0);
  recorder.start();
  await ac.resume().catch(() => {});

  const t0 = ac.currentTime;
  const fadeIn = edits.audio?.fadeIn ?? 0;
  const fadeOut = edits.audio?.fadeOut ?? 0;
  master.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : 1, t0);
  if (fadeIn > 0) master.gain.linearRampToValueAtTime(1, t0 + Math.min(fadeIn, outDur));
  if (fadeOut > 0) {
    const fs = Math.max(t0 + fadeIn, t0 + outDur - fadeOut);
    master.gain.setValueAtTime(1, fs);
    master.gain.linearRampToValueAtTime(0.0001, t0 + outDur);
  }

  let aborted = false;
  const onAbort = () => {
    aborted = true;
  };
  opts.signal?.addEventListener('abort', onAbort);

  // 8) Drive the offscreen video across every segment (continuous recording).
  let baseOut = 0; // output seconds completed by prior segments
  for (const seg of segs) {
    if (aborted) break;
    await seekTo(video, seg.start);
    video.playbackRate = seg.speed || 1;
    if (music && seg === segs[0]) await music.play().catch(() => {});
    await video.play().catch(() => {});
    const segOut = (seg.end - seg.start) / (seg.speed || 1);
    // Guard against a stalled decoder (autoplay blocked, boundary glitch).
    const deadline = performance.now() + (segOut + 4) * 1000;
    await new Promise<void>((res) => {
      const draw = () => {
        if (
          aborted ||
          video.currentTime >= seg.end ||
          video.ended ||
          performance.now() > deadline
        ) {
          res();
          return;
        }
        const outClock = baseOut + (video.currentTime - seg.start) / (seg.speed || 1);
        drawFrame(outClock);
        opts.onProgress?.(Math.min(0.99, outClock / outDur));
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    });
    video.pause();
    baseOut += segOut;
  }

  music?.pause();
  if (recorder.state !== 'inactive') recorder.stop();
  await stopped;
  opts.signal?.removeEventListener('abort', onAbort);

  // 9) Poster frame (before closing the audio context / disposing the video).
  let poster: string | undefined;
  try {
    const posterOut = Math.max(0, Math.min(outDur, edits.posterTime ?? 0));
    await seekTo(video, outputToSourceTime(segs, posterOut));
    drawFrame(posterOut);
    const pscale = Math.min(1, 640 / Math.max(W, H));
    const pc = document.createElement('canvas');
    pc.width = Math.max(2, Math.round(W * pscale));
    pc.height = Math.max(2, Math.round(H * pscale));
    pc.getContext('2d')!.drawImage(canvas, 0, 0, pc.width, pc.height);
    poster = pc.toDataURL('image/jpeg', 0.8);
  } catch {
    /* poster is best-effort */
  }

  await ac.close().catch(() => {});
  opts.onProgress?.(1);

  return { blob: new Blob(chunks, { type: mime }), durationSec: outDur, mime, width: W, height: H, poster };
}
