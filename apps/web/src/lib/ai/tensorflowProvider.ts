import type { AIProvider, DetectedObject, MediaItem } from '@photo-gallery/sdk';

/**
 * Free, in-browser AI provider using TensorFlow.js + COCO-SSD object detection.
 * No API key, no server — the model (~6 MB) downloads from the public TF model
 * CDN on first use and runs on the GPU via the WebGL backend.
 *
 * Detects 80 COCO classes (person, dog, cat, car, laptop, chair, dining table,
 * tv, bottle, cup, …) which power search, find-similar and the Objects browser.
 */
export function createTensorflowProvider(): AIProvider {
  // Loaded lazily and memoized so the heavy bundle/model is fetched only once.
  let modelPromise: Promise<CocoModel> | null = null;

  async function getModel(): Promise<CocoModel> {
    if (!modelPromise) {
      modelPromise = (async () => {
        const tf = await import('@tensorflow/tfjs');
        try {
          await tf.setBackend('webgl');
        } catch {
          // Fall back to the default backend if WebGL is unavailable.
        }
        await tf.ready();
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        return cocoSsd.load({ base: 'lite_mobilenet_v2' }) as unknown as CocoModel;
      })();
    }
    return modelPromise;
  }

  return {
    name: 'tensorflow-coco-ssd',

    async detectObjects(item: MediaItem, image): Promise<DetectedObject[]> {
      const model = await getModel();
      const el = image as HTMLImageElement;
      const w = el.naturalWidth || el.width || item.width || 1;
      const h = el.naturalHeight || el.height || item.height || 1;
      const predictions = await model.detect(el, 20, 0.4);
      return predictions.map((p) => ({
        label: p.class,
        confidence: p.score,
        box: {
          x: p.bbox[0] / w,
          y: p.bbox[1] / h,
          width: p.bbox[2] / w,
          height: p.bbox[3] / h,
        },
      }));
    },
  };
}

interface CocoPrediction {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}
interface CocoModel {
  detect(
    img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    maxNumBoxes?: number,
    minScore?: number,
  ): Promise<CocoPrediction[]>;
}
