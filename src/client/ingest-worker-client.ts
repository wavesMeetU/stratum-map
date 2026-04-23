import { geometryBufferViewFromChunkMessage } from "../parser/geojson-chunk.js";
import type {
  GeoJsonWorkerChunkMessage,
  GeoJsonWorkerEvent,
} from "../parser/geojson-worker-messages.js";
import type { IngestWorkerRequest } from "../parser/ingest-worker-messages.js";
import type { GeoJsonParseChunkPayload, GeoJsonParseSummary } from "./geojson-worker-client.js";

type Pending = {
  readonly resolve: (summary: GeoJsonParseSummary) => void;
  readonly reject: (err: Error) => void;
  readonly onChunk: (chunk: GeoJsonParseChunkPayload) => void;
  readonly removeAbortListener: () => void;
};

let parseIdSeq = 1;

/**
 * FlatGeobuf (bbox / range-backed) + WKB ingestion in a dedicated worker.
 */
export class IngestWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();

  constructor(worker?: Worker) {
    this.worker =
      worker ??
      new Worker(new URL("../worker/ingest-worker.js", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<GeoJsonWorkerEvent>) => {
      const data = ev.data;
      const route = this.pending.get(data.parseId);
      if (!route) return;

      if (data.type === "chunk") {
        const { view, records } = geometryBufferViewFromChunkMessage(data);
        route.onChunk({
          view,
          records,
          chunkIndex: data.chunkIndex,
          workerChunk: data as GeoJsonWorkerChunkMessage,
        });
        return;
      }

      if (data.type === "done") {
        this.pending.delete(data.parseId);
        route.removeAbortListener();
        route.resolve({
          totalFeatures: data.totalFeatures,
          totalChunks: data.totalChunks,
        });
        return;
      }

      if (data.type === "error") {
        this.pending.delete(data.parseId);
        route.removeAbortListener();
        route.reject(new Error(data.message));
      }
    };
  }

  parseFlatGeobufBbox(options: {
    readonly url: string;
    readonly bbox: { minX: number; minY: number; maxX: number; maxY: number };
    readonly tileKey?: string;
    readonly onChunk: (chunk: GeoJsonParseChunkPayload) => void;
    readonly signal?: AbortSignal;
    readonly batchFeatureCount?: number;
    readonly baseFeatureId?: number;
    readonly defaultStyleId?: number;
    readonly headers?: Record<string, string>;
    readonly maxFeatures?: number;
  }): Promise<GeoJsonParseSummary> {
    const parseId = parseIdSeq++;
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const onAbort = () => {
        this.worker.postMessage({ type: "cancel", parseId } satisfies IngestWorkerRequest);
        if (this.pending.has(parseId)) {
          this.pending.delete(parseId);
          options.signal?.removeEventListener("abort", onAbort);
          reject(new DOMException("Aborted", "AbortError"));
        }
      };

      const removeAbortListener = () => {
        options.signal?.removeEventListener("abort", onAbort);
      };

      options.signal?.addEventListener("abort", onAbort);

      this.pending.set(parseId, {
        resolve: (s) => {
          removeAbortListener();
          resolve(s);
        },
        reject: (e) => {
          removeAbortListener();
          reject(e);
        },
        onChunk: options.onChunk,
        removeAbortListener,
      });

      const req: IngestWorkerRequest = {
        type: "parse-flatgeobuf-bbox",
        parseId,
        url: options.url,
        bbox: options.bbox,
        tileKey: options.tileKey,
        batchFeatureCount: options.batchFeatureCount,
        baseFeatureId: options.baseFeatureId,
        defaultStyleId: options.defaultStyleId,
        headers: options.headers,
        maxFeatures: options.maxFeatures,
      };
      this.worker.postMessage(req);
    });
  }

  parseWkb(options: {
    readonly buffer: ArrayBuffer;
    readonly onChunk: (chunk: GeoJsonParseChunkPayload) => void;
    readonly signal?: AbortSignal;
    readonly batchFeatureCount?: number;
    readonly baseFeatureId?: number;
    readonly defaultStyleId?: number;
  }): Promise<GeoJsonParseSummary> {
    const parseId = parseIdSeq++;
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const onAbort = () => {
        this.worker.postMessage({ type: "cancel", parseId } satisfies IngestWorkerRequest);
        if (this.pending.has(parseId)) {
          this.pending.delete(parseId);
          options.signal?.removeEventListener("abort", onAbort);
          reject(new DOMException("Aborted", "AbortError"));
        }
      };

      const removeAbortListener = () => {
        options.signal?.removeEventListener("abort", onAbort);
      };

      options.signal?.addEventListener("abort", onAbort);

      this.pending.set(parseId, {
        resolve: (s) => {
          removeAbortListener();
          resolve(s);
        },
        reject: (e) => {
          removeAbortListener();
          reject(e);
        },
        onChunk: options.onChunk,
        removeAbortListener,
      });

      const req: IngestWorkerRequest = {
        type: "parse-wkb",
        parseId,
        buffer: options.buffer,
        batchFeatureCount: options.batchFeatureCount,
        baseFeatureId: options.baseFeatureId,
        defaultStyleId: options.defaultStyleId,
      };
      this.worker.postMessage(req, [options.buffer]);
    });
  }

  terminate(): void {
    for (const [, p] of this.pending) {
      p.removeAbortListener();
      p.reject(new Error("Worker terminated"));
    }
    this.pending.clear();
    this.worker.terminate();
  }
}

export function createIngestWorkerClient(worker?: Worker): IngestWorkerClient {
  return new IngestWorkerClient(worker);
}
