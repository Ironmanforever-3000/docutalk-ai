import pcaModule from "npm:ml-pca";

// ml-pca ships different export shapes across versions/interop modes
// (default class, named export, or { default: PCA }). Resolve all of them.
const PCA =
  (pcaModule as unknown as { default?: unknown }).default ??
  (pcaModule as unknown as { PCA?: unknown }).PCA ??
  pcaModule;

export interface PcaModel {
  loadings: number[][];
  center: number[];
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
}

export function computeChunkCoordinates(
  embeddings: number[][]
): { coords: Array<{ x: number; y: number }>; model: PcaModel } {
  if (embeddings.length < 2) {
    const coords = embeddings.map(() => ({ x: 0, y: 0 }));
    return {
      coords,
      model: {
        loadings: [],
        center: [],
        bounds: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
      },
    };
  }

  const pca = new PCA(embeddings);
  const projected = pca.predict(embeddings, { nComponents: 2 });
  const rawCoords = projected.to2DArray().map(([x, y]) => ({ x, y }));

  const xs = rawCoords.map((c) => c.x);
  const ys = rawCoords.map((c) => c.y);
  const bounds = {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  };

  const loadings = pca.getLoadings().to2DArray();
  const center = pca.toJSON().means;

  return {
    coords: normalizeToRange(rawCoords),
    model: { loadings, center, bounds },
  };
}

function normalizeToRange(
  coords: { x: number; y: number }[],
  range = 100
): { x: number; y: number }[] {
  const xs = coords.map((c) => c.x);
  const ys = coords.map((c) => c.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  return coords.map((c) => ({
    x: ((c.x - xMin) / xSpan) * range - range / 2,
    y: ((c.y - yMin) / ySpan) * range - range / 2,
  }));
}

export function projectQuery(
  embedding: number[],
  model: PcaModel
): { x: number; y: number } {
  const { loadings, center, bounds } = model;
  if (!loadings.length) return { x: 0, y: 0 };

  const centered = embedding.map((v, i) => v - (center[i] ?? 0));
  const rawX = centered.reduce((sum, v, i) => sum + v * (loadings[i]?.[0] ?? 0), 0);
  const rawY = centered.reduce((sum, v, i) => sum + v * (loadings[i]?.[1] ?? 0), 0);

  const range = 100;
  const xSpan = bounds.xMax - bounds.xMin || 1;
  const ySpan = bounds.yMax - bounds.yMin || 1;

  return {
    x: ((rawX - bounds.xMin) / xSpan) * range - range / 2,
    y: ((rawY - bounds.yMin) / ySpan) * range - range / 2,
  };
}
