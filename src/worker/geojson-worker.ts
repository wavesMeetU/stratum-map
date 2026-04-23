/// <reference lib="webworker" />

import type { GeoJsonFeature, GeoJsonFeatureCollection } from "../parser/geojson-types.js";
import {
  countVertices,
  geometryKindFor,
  writeFlattenedGeometry,
} from "../parser/geojson-flatten.js";
import type { GeometryKind } from "../types/geometry.js";
import type {
  GeoJsonWorkerChunkMessage,
  GeoJsonWorkerEvent,
  GeoJsonWorkerFeatureRecord,
  GeoJsonWorkerRequest,
} from "../parser/geojson-worker-messages.js";
import { alignTo4Bytes } from "../gpu/byte-align.js";

const abortedParseIds = new Set<number>();
const parseQueue: Extract<GeoJsonWorkerRequest, { type: "parse" }>[] = [];
let pumpLocked = false;

function asErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function normalizeFeatures(parsed: unknown): GeoJsonFeature[] {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("GeoJSON root must be an object");
  }
  const root = parsed as { type?: string; features?: GeoJsonFeature[] };
  if (root.type === "FeatureCollection") {
    const fc = parsed as GeoJsonFeatureCollection;
    if (!Array.isArray(fc.features)) {
      throw new Error("FeatureCollection.features must be an array");
    }
    return fc.features;
  }
  if (root.type === "Feature") {
    return [parsed as GeoJsonFeature];
  }
  throw new Error("Expected FeatureCollection or Feature");
}

function geometryKindForFeature(geometry: GeoJsonFeature["geometry"]): GeometryKind {
  if (geometry === null) return "point";
  return geometryKindFor(geometry);
}

function buildChunk(
  slice: readonly GeoJsonFeature[],
  globalStartIndex: number,
  baseFeatureId: number,
  defaultStyleId: number,
  chunkIndex: number,
  parseId: number,
): GeoJsonWorkerChunkMessage {
  let vertexTotal = 0;
  for (const f of slice) {
    vertexTotal += countVertices(f.geometry);
  }

  const positions = new Float32Array(vertexTotal * 2);
  const featureIds = new Uint32Array(vertexTotal);
  const styleU16Count = Math.ceil(alignTo4Bytes(vertexTotal * 2) / 2);
  const styleIds = new Uint16Array(styleU16Count);

  let vertexOffset = 0;
  const records: GeoJsonWorkerFeatureRecord[] = [];

  for (let i = 0; i < slice.length; i++) {
    const f = slice[i];
    const featureId = baseFeatureId + globalStartIndex + i;
    const start = vertexOffset;
    const written = writeFlattenedGeometry(
      f.geometry,
      positions,
      featureIds,
      styleIds,
      featureId,
      defaultStyleId,
      vertexOffset,
    );
    vertexOffset += written;
    records.push({
      id: featureId,
      geometryKind: geometryKindForFeature(f.geometry),
      vertexStart: start,
      vertexCount: written,
      properties: Object.freeze({ ...(f.properties ?? {}) }) as Record<string, unknown>,
    });
  }

  if (vertexOffset !== vertexTotal) {
    throw new Error(`Internal vertex layout mismatch: ${vertexOffset} vs ${vertexTotal}`);
  }

  return {
    type: "chunk",
    parseId,
    chunkIndex,
    vertexCount: vertexTotal,
    positions: positions.buffer,
    featureIds: featureIds.buffer,
    styleIds: styleIds.buffer,
    records,
  };
}

async function runParse(msg: Extract<GeoJsonWorkerRequest, { type: "parse" }>): Promise<void> {
  const {
    parseId,
    text,
    batchFeatureCount = 10_000,
    baseFeatureId = 0,
    defaultStyleId = 0,
  } = msg;

  try {
    if (defaultStyleId < 0 || defaultStyleId > 65535) {
      throw new Error("defaultStyleId must fit Uint16 (0..65535)");
    }

    if (abortedParseIds.has(parseId)) return;

    let features: GeoJsonFeature[];
    try {
      features = normalizeFeatures(JSON.parse(text) as unknown);
    } catch (e) {
      const err: GeoJsonWorkerEvent = {
        type: "error",
        parseId,
        message: asErrorMessage(e),
      };
      self.postMessage(err);
      return;
    }

    if (abortedParseIds.has(parseId)) return;

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    if (abortedParseIds.has(parseId)) return;

    const totalFeatures = features.length;
    let chunkIndex = 0;
    for (let i = 0; i < totalFeatures; i += batchFeatureCount) {
      if (abortedParseIds.has(parseId)) return;

      const slice = features.slice(i, i + batchFeatureCount);
      const chunk = buildChunk(slice, i, baseFeatureId, defaultStyleId, chunkIndex, parseId);

      const transfer: Transferable[] = [chunk.positions, chunk.featureIds, chunk.styleIds];
      self.postMessage(chunk, transfer);

      chunkIndex += 1;

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    if (abortedParseIds.has(parseId)) return;

    const done: GeoJsonWorkerEvent = {
      type: "done",
      parseId,
      totalFeatures,
      totalChunks: chunkIndex,
    };
    self.postMessage(done);
  } finally {
    abortedParseIds.delete(parseId);
  }
}

async function pumpParseQueue(): Promise<void> {
  if (pumpLocked) return;
  pumpLocked = true;
  try {
    while (parseQueue.length > 0) {
      const msg = parseQueue.shift();
      if (!msg) break;
      try {
        await runParse(msg);
      } catch (e) {
        const err: GeoJsonWorkerEvent = {
          type: "error",
          parseId: msg.parseId,
          message: asErrorMessage(e),
        };
        self.postMessage(err);
      }
    }
  } finally {
    pumpLocked = false;
  }
}

self.onmessage = (ev: MessageEvent<GeoJsonWorkerRequest>) => {
  const data = ev.data;
  if (data.type === "cancel") {
    const idx = parseQueue.findIndex((p) => p.parseId === data.parseId);
    if (idx >= 0) {
      parseQueue.splice(idx, 1);
      return;
    }
    abortedParseIds.add(data.parseId);
    return;
  }
  if (data.type === "parse") {
    parseQueue.push(data);
    void pumpParseQueue();
  }
};
