import type { FeatureRecord } from "../core/feature-record.js";
import type { GeometryBufferView } from "../core/geometry-buffer.js";
import { geometryBufferViewFromChunkMessage } from "../parser/geojson-chunk.js";
import type {
  GeoJsonWorkerEvent,
  GeoJsonWorkerRequest,
} from "../parser/geojson-worker-messages.js";

export interface GeoJsonParseChunkPayload {
  readonly view: GeometryBufferView;
  readonly records: readonly FeatureRecord[];
  readonly chunkIndex: number;
}

export interface GeoJsonParseOptions {
  readonly text: string;
  /** Called for each transferred batch (may be sync; keep work small for UI smoothness). */
  readonly onChunk: (chunk: GeoJsonParseChunkPayload) => void;
  readonly signal?: AbortSignal;
  readonly batchFeatureCount?: number;
  readonly baseFeatureId?: number;
  readonly defaultStyleId?: number;
}

export interface GeoJsonParseSummary {
  readonly totalFeatures: number;
  readonly totalChunks: number;
}

type Pending = {
  readonly resolve: (summary: GeoJsonParseSummary) => void;
  readonly reject: (err: Error) => void;
  readonly onChunk: GeoJsonParseOptions["onChunk"];
  readonly removeAbortListener: () => void;
};

let parseIdSeq = 1;

/**
 * Coordinates the GeoJSON worker: progressive chunks use transferred `ArrayBuffer`s only.
 */
export class GeoJsonWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();

  constructor(worker?: Worker) {
    this.worker =
      worker ??
      new Worker(new URL("../worker/geojson-worker.js", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<GeoJsonWorkerEvent>) => {
      const data = ev.data;
      const route = this.pending.get(data.parseId);
      if (!route) return;

      if (data.type === "chunk") {
        const { view, records } = geometryBufferViewFromChunkMessage(data);
        route.onChunk({ view, records, chunkIndex: data.chunkIndex });
        return;
      }

      if (data.type === "done") {
        this.detach(data.parseId, route);
        route.resolve({
          totalFeatures: data.totalFeatures,
          totalChunks: data.totalChunks,
        });
        return;
      }

      if (data.type === "error") {
        this.detach(data.parseId, route);
        route.reject(new Error(data.message));
      }
    };
  }

  private detach(parseId: number, route: Pending): void {
    this.pending.delete(parseId);
    route.removeAbortListener();
  }

  parse(options: GeoJsonParseOptions): Promise<GeoJsonParseSummary> {
    const parseId = parseIdSeq++;

    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const onChunk = options.onChunk;

      const onAbort = () => {
        this.worker.postMessage({ type: "cancel", parseId } satisfies GeoJsonWorkerRequest);
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
        resolve: (summary) => {
          removeAbortListener();
          resolve(summary);
        },
        reject: (err) => {
          removeAbortListener();
          reject(err);
        },
        onChunk,
        removeAbortListener,
      });

      const req: GeoJsonWorkerRequest = {
        type: "parse",
        parseId,
        text: options.text,
        batchFeatureCount: options.batchFeatureCount,
        baseFeatureId: options.baseFeatureId,
        defaultStyleId: options.defaultStyleId,
      };
      this.worker.postMessage(req);
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

export function createGeoJsonWorkerClient(worker?: Worker): GeoJsonWorkerClient {
  return new GeoJsonWorkerClient(worker);
}
