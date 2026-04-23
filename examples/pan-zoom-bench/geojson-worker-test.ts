/**
 * Browser-only harness: real Dedicated Worker + transferable buffers.
 * Playwright reads `window.__geoJsonWorkerTest`.
 */
import { createGeoJsonWorkerClient } from "../../src/client/geojson-worker-client.js";

export interface GeoJsonWorkerHarnessResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly summary?: { totalFeatures: number; totalChunks: number };
  readonly checks: {
    readonly chunkCount: number;
    readonly recordCounts: readonly number[];
    readonly totalVertices: number;
    readonly uniqueFeatureIds: number;
    readonly positionsAreArrayBuffer: boolean;
    readonly styleDefaultApplied: boolean;
  };
}

declare global {
  interface Window {
    __geoJsonWorkerTest?: GeoJsonWorkerHarnessResult;
  }
}

function fcPointFeatures(n: number): string {
  return JSON.stringify({
    type: "FeatureCollection",
    features: Array.from({ length: n }, (_, i) => ({
      type: "Feature",
      properties: { i },
      geometry: { type: "Point", coordinates: [i * 0.01, -i * 0.02] },
    })),
  });
}

async function run(): Promise<void> {
  try {
    const client = createGeoJsonWorkerClient();
    const n = 2500;
    const text = fcPointFeatures(n);
    const batch = 1000;
    const recordCounts: number[] = [];
    let totalVertices = 0;
    const idSet = new Set<number>();
    let positionsAreArrayBuffer = true;
    let styleDefaultApplied = true;
    const summary = await client.parse({
      text,
      batchFeatureCount: batch,
      defaultStyleId: 7,
      onChunk: (payload) => {
        const msg = payload.workerChunk;
        recordCounts.push(msg.records.length);
        if (!(msg.positions instanceof ArrayBuffer)) {
          positionsAreArrayBuffer = false;
        }
        const pos = new Float32Array(msg.positions, 0, msg.vertexCount * 2);
        for (let i = 0; i < pos.length; i++) {
          if (!Number.isFinite(pos[i])) {
            throw new Error(`non-finite position at ${i}`);
          }
        }
        const styles = new Uint16Array(msg.styleIds, 0, msg.vertexCount);
        for (let i = 0; i < msg.vertexCount; i++) {
          if (styles[i] !== 7) {
            styleDefaultApplied = false;
          }
        }
        totalVertices += msg.vertexCount;
        for (const r of msg.records) {
          idSet.add(r.id);
        }
      },
    });

    if (recordCounts.length !== 3 || recordCounts[0] !== 1000 || recordCounts[1] !== 1000 || recordCounts[2] !== 500) {
      throw new Error(`unexpected record counts: ${recordCounts.join(",")}`);
    }
    if (summary.totalFeatures !== n || summary.totalChunks !== 3) {
      throw new Error(`unexpected summary: ${JSON.stringify(summary)}`);
    }
    if (totalVertices !== n || idSet.size !== n) {
      throw new Error(`vertex/id mismatch: verts=${totalVertices} ids=${idSet.size}`);
    }

    client.terminate();

    window.__geoJsonWorkerTest = {
      ok: true,
      summary,
      checks: {
        chunkCount: recordCounts.length,
        recordCounts,
        totalVertices,
        uniqueFeatureIds: idSet.size,
        positionsAreArrayBuffer,
        styleDefaultApplied,
      },
    };
  } catch (e) {
    window.__geoJsonWorkerTest = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      checks: {
        chunkCount: 0,
        recordCounts: [],
        totalVertices: 0,
        uniqueFeatureIds: 0,
        positionsAreArrayBuffer: false,
        styleDefaultApplied: false,
      },
    };
  }
}

void run();
