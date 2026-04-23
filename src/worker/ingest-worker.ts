/// <reference lib="webworker" />

import { Buffer } from "buffer";
import { deserialize } from "flatgeobuf/lib/mjs/geojson.js";
import wkx from "wkx";
import type { GeoJsonFeature } from "../parser/geojson-types.js";
import { buildGeoJsonFeatureChunk } from "../parser/geojson-chunk-build.js";
import type { IngestWorkerRequest, IngestWorkerEvent } from "../parser/ingest-worker-messages.js";

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

const abortedParseIds = new Set<number>();
type QueuedJob = Exclude<IngestWorkerRequest, { type: "cancel" }>;
const jobQueue: QueuedJob[] = [];
let pumpLocked = false;

function asErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function runWithAbortableGlobalFetch<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as typeof globalThis & { fetch: typeof fetch };
  const prev = g.fetch.bind(g);
  g.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    prev(input, { ...init, signal });
  return fn().finally(() => {
    g.fetch = prev;
  });
}

function toHeaders(record?: Record<string, string>): HeadersInit | undefined {
  if (!record || Object.keys(record).length === 0) return undefined;
  return new Headers(record);
}

function igeoToGeoJsonFeature(f: unknown): GeoJsonFeature {
  const g = f as GeoJsonFeature;
  if (!g || typeof g !== "object" || !("geometry" in g)) {
    throw new Error("FlatGeobuf feature missing geometry");
  }
  return {
    type: "Feature",
    geometry: g.geometry,
    properties: g.properties ?? null,
    ...(g.id !== undefined ? { id: g.id } : {}),
  };
}

async function runFlatgeobufBbox(
  msg: Extract<IngestWorkerRequest, { type: "parse-flatgeobuf-bbox" }>,
): Promise<void> {
  const {
    parseId,
    url,
    bbox,
    tileKey,
    batchFeatureCount = 10_000,
    baseFeatureId = 0,
    defaultStyleId = 0,
    headers,
    maxFeatures,
  } = msg;

  if (defaultStyleId < 0 || defaultStyleId > 65535) {
    throw new Error("defaultStyleId must fit Uint16 (0..65535)");
  }

  const controller = new AbortController();
  const signal = controller.signal;

  let chunkIndex = 0;
  let featureCursor = 0;
  let pending: GeoJsonFeature[] = [];

  const flushPending = () => {
    if (pending.length === 0) return;
    const slice = pending;
    pending = [];
    const chunk = buildGeoJsonFeatureChunk(
      slice,
      featureCursor,
      baseFeatureId,
      defaultStyleId,
      chunkIndex,
      parseId,
      tileKey,
    );
    featureCursor += slice.length;
    chunkIndex += 1;
    const transfer: Transferable[] = [chunk.positions, chunk.featureIds, chunk.styleIds];
    self.postMessage(chunk, transfer);
  };

  await runWithAbortableGlobalFetch(signal, async () => {
    for await (const raw of deserialize(
      url,
      bbox,
      undefined,
      false,
      toHeaders(headers),
    )) {
      if (abortedParseIds.has(parseId)) {
        controller.abort();
        return;
      }
      if (maxFeatures !== undefined && featureCursor + pending.length >= maxFeatures) {
        break;
      }
      pending.push(igeoToGeoJsonFeature(raw));
      if (pending.length >= batchFeatureCount) {
        flushPending();
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
  });

  if (abortedParseIds.has(parseId)) {
    controller.abort();
    return;
  }

  if (maxFeatures !== undefined && featureCursor + pending.length > maxFeatures) {
    const keep = maxFeatures - featureCursor;
    pending = pending.slice(0, Math.max(0, keep));
  }

  flushPending();

  const done: IngestWorkerEvent = {
    type: "done",
    parseId,
    totalFeatures: featureCursor,
    totalChunks: chunkIndex,
  };
  self.postMessage(done);
}

async function runWkb(msg: Extract<IngestWorkerRequest, { type: "parse-wkb" }>): Promise<void> {
  const {
    parseId,
    buffer,
    batchFeatureCount = 10_000,
    baseFeatureId = 0,
    defaultStyleId = 0,
  } = msg;

  if (defaultStyleId < 0 || defaultStyleId > 65535) {
    throw new Error("defaultStyleId must fit Uint16 (0..65535)");
  }

  const geom = wkx.Geometry.parse(Buffer.from(buffer));
  const gjUnknown = geom.toGeoJSON() as unknown;
  const root = gjUnknown as { type?: string };

  let features: GeoJsonFeature[];
  if (root.type === "FeatureCollection") {
    const fc = gjUnknown as { features: GeoJsonFeature[] };
    features = fc.features.map((f) => ({
      type: "Feature" as const,
      geometry: f.geometry,
      properties: f.properties ?? null,
      ...(f.id !== undefined ? { id: f.id } : {}),
    }));
  } else if (root.type === "Feature") {
    features = [gjUnknown as GeoJsonFeature];
  } else {
    features = [
      {
        type: "Feature",
        geometry: gjUnknown as GeoJsonFeature["geometry"],
        properties: null,
      },
    ];
  }

  if (abortedParseIds.has(parseId)) return;

  await new Promise<void>((r) => setTimeout(r, 0));

  let chunkIndex = 0;
  const totalFeatures = features.length;
  for (let i = 0; i < totalFeatures; i += batchFeatureCount) {
    if (abortedParseIds.has(parseId)) return;
    const slice = features.slice(i, i + batchFeatureCount);
    const chunk = buildGeoJsonFeatureChunk(
      slice,
      i,
      baseFeatureId,
      defaultStyleId,
      chunkIndex,
      parseId,
    );
    chunkIndex += 1;
    const transfer: Transferable[] = [chunk.positions, chunk.featureIds, chunk.styleIds];
    self.postMessage(chunk, transfer);
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  if (abortedParseIds.has(parseId)) return;

  const done: IngestWorkerEvent = {
    type: "done",
    parseId,
    totalFeatures,
    totalChunks: chunkIndex,
  };
  self.postMessage(done);
}

async function runJob(msg: QueuedJob): Promise<void> {
  const parseId = msg.parseId;
  try {
    if (abortedParseIds.has(parseId)) return;
    if (msg.type === "parse-flatgeobuf-bbox") {
      await runFlatgeobufBbox(msg);
    } else {
      await runWkb(msg);
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      return;
    }
    const err: IngestWorkerEvent = {
      type: "error",
      parseId,
      message: asErrorMessage(e),
    };
    self.postMessage(err);
  } finally {
    abortedParseIds.delete(parseId);
  }
}

async function pumpQueue(): Promise<void> {
  if (pumpLocked) return;
  pumpLocked = true;
  try {
    while (jobQueue.length > 0) {
      const msg = jobQueue.shift();
      if (!msg) break;
      try {
        await runJob(msg);
      } catch (e) {
        const err: IngestWorkerEvent = {
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

self.onmessage = (ev: MessageEvent<IngestWorkerRequest>) => {
  const data = ev.data;
  if (data.type === "cancel") {
    const idx = jobQueue.findIndex((j) => j.parseId === data.parseId);
    if (idx >= 0) {
      jobQueue.splice(idx, 1);
      return;
    }
    abortedParseIds.add(data.parseId);
    return;
  }
  jobQueue.push(data);
  void pumpQueue();
};
