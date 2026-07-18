/**
 * Request/response types for the RunPod endpoints described in
 * `model-api-spec.docx`. Server-side only — imported by the /api/ai/* routes,
 * never by client/SDK code (which must not see a RunPod URL or key).
 */

/** Normalized image result returned by every image endpoint (raw base64, no data: prefix). */
export interface RunpodImageResult {
  imageBase64: string;
  mimeType: string;
}

/** #9 SD 3.5 masked inpainting (also #11 outpaint, pre-padded). white in mask = regenerate. */
export interface InpaintReq {
  imageB64: string;
  maskB64: string;
  prompt: string;
  negativePrompt?: string;
  strength?: number;
  guidanceScale?: number;
  steps?: number;
  seed?: number;
}

/** #10 SD 3.5 general prompt edit (img2img, no mask). */
export interface Img2ImgReq {
  imageB64: string;
  prompt: string;
  negativePrompt?: string;
  strength?: number;
  guidanceScale?: number;
  steps?: number;
  seed?: number;
}

/**
 * #1 YOLO construction-material classifier, normalized to the SDK's
 * `DetectedObject` shape (box as fractions 0..1 of the image).
 */
export interface RunpodDetection {
  label: string;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
}

/** #2 DeepSingleImageCalibration — camera tilt (scaffold; no route/UI yet). */
export interface TiltResult {
  rollDegrees: number;
  pitchDegrees: number;
  fovDegrees: number;
}

/** #3 Parakeet voice-to-text (scaffold; no route/UI yet). */
export interface TranscriptSegment {
  text: string;
  startSec: number;
  endSec: number;
}
export interface TranscriptResult {
  transcript: string;
  segments?: TranscriptSegment[];
}
