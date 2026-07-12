/**
 * ChunkedGeometryController — chunk key derivation and replacement (Stage 5.2).
 *
 * No real WebGPU device is available in Node, so these tests drive
 * ChunkedGeometryController against a FakeChunkRenderer that mirrors the exact
 * chunk-residency/LRU/destroy bookkeeping WebGpuPointsRenderer implements
 * (ingestTransferredWorkerChunk / evictOldestChunk / removeChunkByKey /
 * clearChunkedGeometry / getChunkKeys / getChunkCount) — the controller only ever
 * calls those methods, so a structurally-typed double is sufficient and avoids
 * needing a browser/WebGPU environment for this layer of behavior.
 *
 * Run: node --test tests/chunked-geometry-controller.spec.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { ChunkedGeometryController } = await import(
  join(root, "dist/gpu/chunked-geometry-controller.js")
);
const { buildGeoJsonFeatureChunk } = await import(
  join(root, "dist/parser/geojson-chunk-build.js")
);

/** Mirrors WebGpuPointsRenderer's chunk map + draw order + LRU order + destroy tracking. */
class FakeChunkRenderer {
  constructor() {
    this.chunks = new Map(); // key -> slot
    this.drawOrder = [];
    this.lruOrder = [];
    this.destroyCount = 0;
    this.renderCount = 0;
    this._anon = 0;
  }

  getChunkCount() {
    return this.chunks.size;
  }

  getChunkKeys() {
    return [...this.drawOrder];
  }

  ingestTransferredWorkerChunk(msg, options) {
    const key = options?.chunkKey ?? `__anon:${this._anon++}`;
    const existing = this.chunks.get(key);

    if (msg.vertexCount === 0) {
      if (existing !== undefined) {
        this._destroy(existing);
        this.chunks.delete(key);
        this._splice(key);
      }
      return;
    }

    if (existing !== undefined) {
      this._destroy(existing);
    }

    const slot = { vertexCount: msg.vertexCount, destroyed: false };
    this.chunks.set(key, slot);
    if (existing === undefined) {
      this.drawOrder.push(key);
    }
    this._touchLru(key);
  }

  removeChunkByKey(key) {
    const slot = this.chunks.get(key);
    if (slot === undefined) return false;
    this._destroy(slot);
    this.chunks.delete(key);
    this._splice(key);
    return true;
  }

  evictOldestChunk() {
    while (this.lruOrder.length > 0) {
      const key = this.lruOrder.shift();
      if (!this.chunks.has(key)) continue;
      this.removeChunkByKey(key);
      return key;
    }
    return undefined;
  }

  clearChunkedGeometry() {
    for (const slot of this.chunks.values()) this._destroy(slot);
    this.chunks.clear();
    this.drawOrder.length = 0;
    this.lruOrder.length = 0;
  }

  render() {
    this.renderCount++;
  }

  _destroy(slot) {
    slot.destroyed = true;
    this.destroyCount++;
  }

  _touchLru(key) {
    const i = this.lruOrder.indexOf(key);
    if (i >= 0) this.lruOrder.splice(i, 1);
    this.lruOrder.push(key);
  }

  _splice(key) {
    const di = this.drawOrder.indexOf(key);
    if (di >= 0) this.drawOrder.splice(di, 1);
    const li = this.lruOrder.indexOf(key);
    if (li >= 0) this.lruOrder.splice(li, 1);
  }
}

function chunkMsg({ parseId, chunkIndex = 0, tileKey, n = 1 }) {
  const features = Array.from({ length: n }, (_, i) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [i, i] },
  }));
  return buildGeoJsonFeatureChunk(features, 0, 0, 0, chunkIndex, parseId, tileKey);
}

describe("ChunkedGeometryController — chunk key derivation and replacement", () => {
  it("same tileKey arriving via a fresh parse session (new parseId) replaces, not duplicates", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "tile-3-4" }));
    assert.equal(renderer.getChunkCount(), 1);
    assert.equal(renderer.destroyCount, 0);

    // Same logical tile, re-queried later => fresh parseId, same tileKey.
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "tile-3-4" }));

    assert.equal(renderer.getChunkCount(), 1, "must replace, not duplicate");
    assert.equal(renderer.getChunkKeys().length, 1);
  });

  it("replacement destroys the old GPU slot exactly once", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "tile-a" }));
    assert.equal(renderer.destroyCount, 0);

    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "tile-a" }));
    assert.equal(renderer.destroyCount, 1, "old slot destroyed exactly once");

    controller.ingestWorkerChunk(chunkMsg({ parseId: 3, tileKey: "tile-a" }));
    assert.equal(renderer.destroyCount, 2, "each subsequent replacement destroys exactly one more");
  });

  it("different tile identities coexist without colliding", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "tile-a" }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "tile-b" }));

    assert.equal(renderer.getChunkCount(), 2);
    assert.equal(renderer.destroyCount, 0);
  });

  it("a single tile split across multiple chunkIndex batches within one query does not self-collide", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, chunkIndex: 0, tileKey: "tile-a" }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, chunkIndex: 1, tileKey: "tile-a" }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, chunkIndex: 2, tileKey: "tile-a" }));

    assert.equal(renderer.getChunkCount(), 3, "3 distinct batches of the same tile must all remain resident");
    assert.equal(renderer.destroyCount, 0);
  });

  it("tileKey-derived keys never collide with parseId-derived keys (disjoint default key spaces)", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer });

    // No tileKey => falls back to the pre-existing `p${parseId}-c${chunkIndex}` scheme.
    controller.ingestWorkerChunk(chunkMsg({ parseId: 5, chunkIndex: 0 }));
    // A tileKey chosen so an unprefixed scheme could plausibly collide with "p5-c0".
    controller.ingestWorkerChunk(chunkMsg({ parseId: 99, chunkIndex: 0, tileKey: "5" }));

    assert.equal(renderer.getChunkCount(), 2, "must not collide despite similar-looking identity components");
    assert.equal(renderer.destroyCount, 0);
  });

  it("features without an id and messages without a tileKey still use the pre-existing positional/parseId scheme unchanged", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, chunkIndex: 0 }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, chunkIndex: 0 }));

    // Different parseId, no tileKey => distinct keys, both resident (unchanged pre-fix behavior).
    assert.equal(renderer.getChunkCount(), 2);
    assert.equal(renderer.destroyCount, 0);
  });

  it("stale cancelled messages remain rejected regardless of tileKey", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer, minParseId: () => 10 });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 5, tileKey: "tile-a" }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 9 }));

    assert.equal(renderer.getChunkCount(), 0, "messages below minParseId must never be ingested");
  });

  it("replacement re-touches LRU order (replaced chunk is not the next eviction candidate)", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer, maxGpuChunks: 2 });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "tile-a" }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "tile-b" }));
    assert.equal(renderer.getChunkCount(), 2);

    // Refresh tile-a (fresh parseId, same tileKey) — this should mark tile-a as most
    // recently touched, leaving tile-b as the LRU eviction candidate.
    controller.ingestWorkerChunk(chunkMsg({ parseId: 3, tileKey: "tile-a" }));
    assert.equal(renderer.getChunkCount(), 2, "replace must not grow chunk count");

    // Ingesting a third distinct tile should evict tile-b (least recently touched), not tile-a.
    controller.ingestWorkerChunk(chunkMsg({ parseId: 4, tileKey: "tile-c" }));

    assert.equal(renderer.getChunkCount(), 2, "cap enforced");
    const keys = renderer.getChunkKeys();
    assert.ok(keys.includes("t:tile-a-c0"), "recently-replaced tile-a must survive eviction");
    assert.ok(!keys.includes("t:tile-b-c0"), "least-recently-touched tile-b must be evicted");
    assert.ok(keys.includes("t:tile-c-c0"));
  });

  it("replacement does not fire onGpuChunkEvicted (replace is not eviction)", () => {
    const renderer = new FakeChunkRenderer();
    const evicted = [];
    const controller = new ChunkedGeometryController({
      renderer,
      onGpuChunkEvicted: (key) => evicted.push(key),
    });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "tile-a" }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "tile-a" }));

    assert.deepEqual(evicted, [], "onGpuChunkEvicted must not fire for a same-key replace");
  });

  it("disposal destroys all remaining resources exactly once", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "tile-a" }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "tile-b" }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 3, tileKey: "tile-a" })); // replace tile-a

    const destroyedBeforeDispose = renderer.destroyCount; // 1, from the replace above
    controller.dispose();

    // 2 chunks resident at dispose time (tile-a's replacement + tile-b), each destroyed once.
    assert.equal(renderer.destroyCount, destroyedBeforeDispose + 2);
    assert.equal(renderer.getChunkCount(), 0);

    // Disposing again must not destroy anything further.
    controller.dispose();
    assert.equal(renderer.destroyCount, destroyedBeforeDispose + 2);
  });
});
