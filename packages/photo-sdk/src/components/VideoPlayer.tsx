'use client';

import { useEffect, useRef, useState } from 'react';

import { Icon } from '../icons';

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

interface VideoPlayerProps {
  src: string;
  poster?: string;
  /** CSS filter string applied to the video (for edited clips). */
  filter?: string;
  autoPlay?: boolean;
}

/**
 * Custom macOS-style video player: a glass transport bar (play/pause, scrubber
 * with buffered + played tracks, time, volume, mute, PiP, fullscreen), a centre
 * play affordance, auto-hiding controls while playing, and keyboard shortcuts.
 * Replaces the browser's native controls for a consistent, on-brand look.
 */
export function VideoPlayer({ src, poster, filter, autoPlay = true }: VideoPlayerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);

  const v = () => videoRef.current;

  const togglePlay = () => {
    const el = v();
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };
  const seek = (t: number) => {
    const el = v();
    if (el) el.currentTime = Math.max(0, Math.min(duration || 0, t));
  };
  const toggleMute = () => {
    const el = v();
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };
  const changeVolume = (val: number) => {
    const el = v();
    if (!el) return;
    el.volume = val;
    el.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  };
  const toggleFullscreen = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.requestFullscreen?.();
  };
  const togglePip = () => {
    const el = v() as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> };
    if (!el) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else void el.requestPictureInPicture?.().catch(() => {});
  };

  // Auto-hide controls while playing; always show when paused / on activity.
  const nudge = () => {
    setControlsShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!v()?.paused) setControlsShown(false);
    }, 2600);
  };

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = v();
    if (!el) return;
    // Keys the player owns. For these, fully stop the native event so the
    // Lightbox's window-level keydown listener (prev/next/Escape) doesn't ALSO
    // fire — React's stopPropagation alone can't stop a separate window listener.
    const owned = [' ', 'k', 'ArrowLeft', 'ArrowRight', 'm', 'f'];
    if (owned.includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation?.();
    }
    switch (e.key) {
      case ' ':
      case 'k':
        togglePlay();
        break;
      case 'ArrowLeft':
        seek(el.currentTime - 5);
        break;
      case 'ArrowRight':
        seek(el.currentTime + 5);
        break;
      case 'm':
        toggleMute();
        break;
      case 'f':
        toggleFullscreen();
        break;
    }
    nudge();
  };

  const pct = duration ? (time / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className={['apg-vp', controlsShown ? '' : 'apg-vp--idle', fullscreen ? 'apg-vp--fs' : ''].join(' ')}
      onMouseMove={nudge}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="group"
      aria-label="Video player"
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        className="apg-vp__video"
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        style={filter ? { filter } : undefined}
        onClick={togglePlay}
        onPlay={() => {
          setPlaying(true);
          nudge();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsShown(true);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setTime(el.currentTime);
          try {
            if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
          } catch {
            /* ignore */
          }
        }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
      />

      {!playing ? (
        <button type="button" className="apg-vp__center" aria-label="Play" onClick={togglePlay}>
          <Icon name="play" size={34} />
        </button>
      ) : null}

      <div className="apg-vp__controls" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="apg-vp__btn" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <span className="apg-vp__time">{fmt(time)}</span>
        <div
          className="apg-vp__scrub"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          onPointerDown={(e) => {
            if (!duration) return; // metadata not loaded yet — nothing to seek
            const bar = e.currentTarget;
            const move = (clientX: number) => {
              const r = bar.getBoundingClientRect();
              seek(((clientX - r.left) / r.width) * duration);
            };
            move(e.clientX);
            bar.setPointerCapture(e.pointerId);
            const onMove = (ev: PointerEvent) => move(ev.clientX);
            // Release on BOTH pointerup and pointercancel (touch interruptions,
            // system gestures) so capture/listeners never leak.
            const onUp = () => {
              bar.removeEventListener('pointermove', onMove);
              bar.removeEventListener('pointerup', onUp);
              bar.removeEventListener('pointercancel', onUp);
            };
            bar.addEventListener('pointermove', onMove);
            bar.addEventListener('pointerup', onUp);
            bar.addEventListener('pointercancel', onUp);
          }}
        >
          <span className="apg-vp__track" />
          <span className="apg-vp__buffered" style={{ width: `${bufPct}%` }} />
          <span className="apg-vp__played" style={{ width: `${pct}%` }}>
            <span className="apg-vp__knob" />
          </span>
        </div>
        <span className="apg-vp__time">{fmt(duration)}</span>
        <button type="button" className="apg-vp__btn" aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
          <Icon name={muted || volume === 0 ? 'mute' : 'volume'} size={18} />
        </button>
        <input
          className="apg-vp__vol"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          aria-label="Volume"
          onChange={(e) => changeVolume(Number(e.target.value))}
        />
        <button type="button" className="apg-vp__btn" aria-label="Picture in picture" onClick={togglePip}>
          <Icon name="pip" size={18} />
        </button>
        <button type="button" className="apg-vp__btn" aria-label="Fullscreen" onClick={toggleFullscreen}>
          <Icon name="expand" size={18} />
        </button>
      </div>
    </div>
  );
}
