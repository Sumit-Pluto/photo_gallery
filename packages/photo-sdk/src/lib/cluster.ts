import type { MediaId, MediaItem } from '../types';

/**
 * Face clustering — groups detected faces across the library into people.
 *
 * Faces carry a 128-D embedding (from the provider's face-recognition model).
 * Two faces of the same person sit close in that space; different people sit far
 * apart. We do a simple, deterministic online clustering: process faces largest
 * first (big, frontal faces make better seeds), and assign each to the nearest
 * existing centroid within `threshold`, else start a new cluster.
 *
 * Kept dependency-free and pure so it runs anywhere and is trivially testable.
 */

/** Max Euclidean distance between L2-ish descriptors for "same person".
 * face-api's recommended cut-off is 0.6; we use a slightly tighter 0.55 to
 * favour precision (fewer wrong merges) over recall. */
const DEFAULT_THRESHOLD = 0.55;

export interface FaceCluster {
  /** Unique media ids in this cluster, ordered by first appearance. */
  mediaIds: MediaId[];
  /** Item whose face is the most prominent (largest box) — used as the cover. */
  coverId: MediaId;
  /** Mean descriptor of the cluster. */
  centroid: number[];
  /** Number of individual faces (not items) merged into this cluster. */
  faceCount: number;
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function clusterFaces(media: MediaItem[], threshold = DEFAULT_THRESHOLD): FaceCluster[] {
  // Flatten every embedded face; bigger faces first for stabler seed centroids.
  const faces: { itemId: MediaId; emb: number[]; area: number }[] = [];
  for (const m of media) {
    if (m.deletedAt) continue;
    for (const f of m.faces ?? []) {
      if (f.embedding && f.embedding.length > 0) {
        faces.push({ itemId: m.id, emb: f.embedding, area: f.box.width * f.box.height });
      }
    }
  }
  faces.sort((a, b) => b.area - a.area);

  interface Acc {
    sum: number[];
    n: number;
    centroid: number[];
    members: { itemId: MediaId; area: number }[];
  }
  const clusters: Acc[] = [];

  for (const f of faces) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const d = euclidean(clusters[i]!.centroid, f.emb);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0 && bestD <= threshold) {
      const c = clusters[best]!;
      for (let k = 0; k < f.emb.length; k++) c.sum[k] = (c.sum[k] ?? 0) + f.emb[k]!;
      c.n += 1;
      c.centroid = c.sum.map((s) => s / c.n);
      c.members.push({ itemId: f.itemId, area: f.area });
    } else {
      clusters.push({
        sum: [...f.emb],
        n: 1,
        centroid: [...f.emb],
        members: [{ itemId: f.itemId, area: f.area }],
      });
    }
  }

  return clusters.map((c) => {
    const seen = new Set<MediaId>();
    const mediaIds: MediaId[] = [];
    let coverId = c.members[0]!.itemId;
    let coverArea = -1;
    for (const m of c.members) {
      if (!seen.has(m.itemId)) {
        seen.add(m.itemId);
        mediaIds.push(m.itemId);
      }
      if (m.area > coverArea) {
        coverArea = m.area;
        coverId = m.itemId;
      }
    }
    return { mediaIds, coverId, centroid: c.centroid, faceCount: c.n };
  });
}
