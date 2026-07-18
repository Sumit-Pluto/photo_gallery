import type { AIProvider, DetectedObject, MediaItem } from '@photo-gallery/sdk';

import { imageToBase64 } from './imageEncode';

/**
 * Object detection backed by the RunPod YOLO construction-material classifier
 * (#1), proxied through /api/ai/classify so the RunPod key stays server-side.
 *
 * Opt-in via `NEXT_PUBLIC_APG_RUNPOD_DETECT=true` (see createDemoAIProvider). If
 * the server call fails (endpoint down / not configured) it falls back to the
 * given in-browser provider (COCO-SSD), so detection never hard-fails.
 */
export function createRunpodYoloProvider(fallback: AIProvider): Pick<AIProvider, 'detectObjects'> {
  return {
    async detectObjects(item: MediaItem, image): Promise<DetectedObject[]> {
      try {
        const { data, mimeType, width, height } = imageToBase64(image, 1280);
        const res = await fetch('/api/ai/classify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageBase64: data, mimeType, width, height }),
        });
        if (!res.ok) throw new Error(`classify failed (${res.status})`);
        const { objects } = (await res.json()) as { objects?: DetectedObject[] };
        if (Array.isArray(objects)) return objects;
        throw new Error('classify returned no objects');
      } catch {
        return fallback.detectObjects ? fallback.detectObjects(item, image) : [];
      }
    },
  };
}
