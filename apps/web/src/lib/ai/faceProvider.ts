import type { DetectedFace, MediaItem } from '@photo-gallery/sdk';
// Type-only imports are erased at compile time — no bundle cost.
import type { TNetInput } from '@vladmandic/face-api';

/**
 * Free, in-browser face detection + recognition via `@vladmandic/face-api`
 * (TensorFlow.js under the hood). It returns a 128-D descriptor per face which
 * the SDK clusters into People — no API key, nothing leaves the browser.
 *
 * Models are fetched once from the jsDelivr CDN (allow-listed in the CSP). The
 * whole module is dynamically imported on first use so it never bloats the
 * initial bundle.
 */

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

type FaceApi = typeof import('@vladmandic/face-api');

let loadPromise: Promise<FaceApi | null> | null = null;

/** Load face-api + its models exactly once; resolves to null if anything fails. */
function ensureModels(): Promise<FaceApi | null> {
  loadPromise ??= (async () => {
    try {
      const faceapi = await import('@vladmandic/face-api');
      // The bundled tf re-export is typed narrowly; backend control lives on the
      // runtime object. Prefer WebGL (no eval; CSP-friendly), fall back gracefully.
      const tf = faceapi.tf as unknown as {
        setBackend: (b: string) => Promise<boolean>;
        ready: () => Promise<void>;
      };
      try {
        await tf.setBackend('webgl');
      } catch {
        /* keep default backend */
      }
      await tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    } catch (err) {
      // Degrade gracefully — People simply stays empty if models can't load.
      console.warn('[faceProvider] model load failed; face clustering disabled.', err);
      return null;
    }
  })();
  return loadPromise;
}

let warned = false;

export function createFaceProvider() {
  return {
    async detectFaces(
      item: MediaItem,
      image: ImageBitmap | HTMLImageElement,
    ): Promise<DetectedFace[]> {
      const faceapi = await ensureModels();
      if (!faceapi) return [];

      const w = (image as HTMLImageElement).naturalWidth || (image as ImageBitmap).width || 1;
      const h = (image as HTMLImageElement).naturalHeight || (image as ImageBitmap).height || 1;

      let results;
      try {
        results = await faceapi
          .detectAllFaces(
            image as unknown as TNetInput,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }),
          )
          .withFaceLandmarks()
          .withFaceDescriptors();
      } catch (err) {
        if (!warned) {
          warned = true;
          console.warn('[faceProvider] face detection failed on', item.name, err);
        }
        return [];
      }

      return results.map((r) => {
        const b = r.detection.box;
        return {
          confidence: r.detection.score,
          box: {
            x: clamp01(b.x / w),
            y: clamp01(b.y / h),
            width: clamp01(b.width / w),
            height: clamp01(b.height / h),
          },
          embedding: Array.from(r.descriptor),
        } satisfies DetectedFace;
      });
    },
  };
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
