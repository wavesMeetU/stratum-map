/**
 * ChunkedGeometryController — chunk key derivation/replacement (Stage 5.2) and
 * byte-aware GPU memory budgeting (Stage 5.3).
 *
 * No real WebGPU device is available in Node, so these tests drive
 * ChunkedGeometryController against a FakeChunkRenderer that mirrors the exact
 * chunk-residency/LRU/destroy/byte-accounting bookkeeping WebGpuPointsRenderer
 * implements (ingestTransferredWorkerChunk / evictOldestChunk / removeChunkByKey /
 * clearChunkedGeometry / getChunkKeys / getChunkCount / getResidentBytes /
 * getChunkByteSize) — the controller only ever calls those methods, so a
 * structurally-typed double is sufficient and avoids needing a browser/WebGPU
 * environment for this layer of behavior.
 *
 * Per-chunk byte size mirrors GpuPointChunkSlot.byteSizesForVertexCount exactly:
 * positions (8B/vertex) + style (4B/vertex, GPU stride-padded) + featureId (4B/vertex)
 * = 16 bytes/vertex — the same formula ChunkedGeometryController itself uses to
 * estimate an incoming chunk's size, so expected byte totals in these tests are
 * exact, not approximate.
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

const BYTES_PER_VERTEX = 16; // 8 (position) + 4 (style, stride-padded) + 4 (featureId)

/** Mirrors WebGpuPointsRenderer's chunk map + draw order + LRU order + destroy/byte tracking. */
class FakeChunkRenderer {
  constructor() {
    this.chunks = new Map(); // key -> slot
    this.drawOrder = [];
    this.lruOrder = [];
    this.destroyCount = 0;
    this.renderCount = 0;
    this.residentBytes = 0;
    this._anon = 0;
  }

  getChunkCount() {
    return this.chunks.size;
  }

  getChunkKeys() {
    return [...this.drawOrder];
  }

  getResidentBytes() {
    return this.residentBytes;
  }

  getChunkByteSize(key) {
    return this.chunks.get(key)?.byteSize ?? 0;
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

    const slot = { vertexCount: msg.vertexCount, byteSize: msg.vertexCount * BYTES_PER_VERTEX, destroyed: false };
    this.chunks.set(key, slot);
    this.residentBytes += slot.byteSize;
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
    this.residentBytes = 0;
  }

  render() {
    this.renderCount++;
  }

  _destroy(slot) {
    slot.destroyed = true;
    this.residentBytes -= slot.byteSize;
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

describe("ChunkedGeometryController — byte-aware GPU memory budgeting (Stage 5.3)", () => {
  it("existing chunk-count eviction is unchanged when no byte budget is set", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer, maxGpuChunks: 2 });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "a" }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "b" }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 3, tileKey: "c" }));

    assert.equal(renderer.getChunkCount(), 2, "count cap enforced exactly as before");
    assert.ok(!renderer.getChunkKeys().includes("t:a-c0"), "LRU-oldest (a) evicted");
  });

  it("byte budget evicts least-recently-used chunks to make room", () => {
    const renderer = new FakeChunkRenderer();
    // Budget fits exactly 2 one-vertex chunks (2 * 16 = 32 bytes).
    const controller = new ChunkedGeometryController({ renderer, maxGpuBytes: 32 });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "a", n: 1 }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "b", n: 1 }));
    assert.equal(renderer.getResidentBytes(), 32);

    controller.ingestWorkerChunk(chunkMsg({ parseId: 3, tileKey: "c", n: 1 }));

    assert.equal(renderer.getResidentBytes(), 32, "budget still respected");
    assert.equal(renderer.getChunkCount(), 2);
    const keys = renderer.getChunkKeys();
    assert.ok(!keys.includes("t:a-c0"), "LRU-oldest (a) evicted to make room");
    assert.ok(keys.includes("t:b-c0"));
    assert.ok(keys.includes("t:c-c0"));
  });

  it("many small chunks coexist within budget without eviction", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer, maxGpuBytes: 1000 });

    for (let i = 0; i < 5; i++) {
      controller.ingestWorkerChunk(chunkMsg({ parseId: i + 1, tileKey: `t${i}`, n: 1 }));
    }

    assert.equal(renderer.getChunkCount(), 5, "well within budget, nothing evicted");
    assert.equal(renderer.getResidentBytes(), 5 * BYTES_PER_VERTEX);
    assert.equal(renderer.destroyCount, 0);
  });

  it("a single large chunk triggers eviction of smaller resident chunks even under the count cap", () => {
    const renderer = new FakeChunkRenderer();
    // maxGpuChunks is generous (10) — only the byte budget should bind here.
    const controller = new ChunkedGeometryController({ renderer, maxGpuChunks: 10, maxGpuBytes: 200 });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "small-a", n: 1 })); // 16B
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "small-b", n: 1 })); // 16B
    assert.equal(renderer.getChunkCount(), 2);

    // 10 vertices => 160 bytes; alone it fits the 200-byte budget, but only once the
    // two small chunks are evicted first (16+16+160 = 192... actually fits without
    // eviction; use a bigger one to force eviction below).
    controller.ingestWorkerChunk(chunkMsg({ parseId: 3, tileKey: "big", n: 11 })); // 176B

    // 16 + 16 + 176 = 208 > 200, so at least one small chunk must be evicted.
    assert.ok(renderer.getResidentBytes() <= 200, "byte budget enforced");
    assert.ok(renderer.getChunkKeys().includes("t:big-c0"), "newest large chunk is kept");
  });

  it("count and byte limits both apply; the more restrictive one binds", () => {
    const renderer = new FakeChunkRenderer();
    // Byte budget alone would allow 6 chunks (6*16=96 <= 100); count cap of 3 is stricter.
    const controller = new ChunkedGeometryController({ renderer, maxGpuChunks: 3, maxGpuBytes: 100 });

    for (let i = 0; i < 5; i++) {
      controller.ingestWorkerChunk(chunkMsg({ parseId: i + 1, tileKey: `t${i}`, n: 1 }));
    }

    assert.equal(renderer.getChunkCount(), 3, "count cap (the stricter limit) binds");
    assert.ok(renderer.getResidentBytes() <= 100);
  });

  it("same-key replacement: old bytes removed, new bytes added exactly once (no double-count)", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer, maxGpuBytes: 1000 });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "a", n: 2 })); // 32B
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "b", n: 2 })); // 32B
    assert.equal(renderer.getResidentBytes(), 64);

    // Replace tile-a with a differently-sized version (fresh parseId, same tileKey).
    controller.ingestWorkerChunk(chunkMsg({ parseId: 3, tileKey: "a", n: 3 })); // 48B

    // Must be 48 (new a) + 32 (b) = 80 — NOT 32(old a) + 48(new a) + 32(b) = 112.
    assert.equal(renderer.getResidentBytes(), 80, "old size removed, new size added exactly once");
  });

  it("replacing a large chunk with a smaller one lowers residency", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer, maxGpuBytes: 1000 });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "a", n: 10 })); // 160B
    assert.equal(renderer.getResidentBytes(), 160);

    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "a", n: 1 })); // 16B
    assert.equal(renderer.getResidentBytes(), 16, "residency drops to match the smaller replacement");
  });

  it("replacing a small chunk with a larger one enforces the budget (evicts unrelated chunks if needed)", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer, maxGpuBytes: 100 });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "a", n: 1 })); // 16B
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "b", n: 1 })); // 16B
    assert.equal(renderer.getResidentBytes(), 32);

    // Grow tile-a to 6 vertices (96B). Total would be 96+16=112 > 100, so tile-b must evict.
    controller.ingestWorkerChunk(chunkMsg({ parseId: 3, tileKey: "a", n: 6 }));

    assert.ok(renderer.getResidentBytes() <= 100, "budget enforced after growing a replacement");
    assert.ok(renderer.getChunkKeys().includes("t:a-c0"), "the grown replacement itself is kept");
    assert.ok(!renderer.getChunkKeys().includes("t:b-c0"), "unrelated chunk evicted to make room");
  });

  it("a same-key replacement that is itself LRU-oldest is not double-discounted", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer, maxGpuBytes: 40 });

    // "a" is touched first (oldest), "b" second.
    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "a", n: 1 })); // 16B
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "b", n: 1 })); // 16B
    assert.equal(renderer.getResidentBytes(), 32);

    // Replace "a" (still LRU-oldest, since replacing doesn't re-touch until the
    // controller actually calls ingestTransferredWorkerChunk) with something big enough
    // that "a" itself must be evicted by the pre-loop before the replace even runs.
    controller.ingestWorkerChunk(chunkMsg({ parseId: 3, tileKey: "a", n: 3 })); // 48B alone > budget(40)

    // Expected: "b" evicted too (48 alone already exceeds the 40-byte budget, so
    // everything else must go); resident bytes reflect exactly one accepted chunk.
    assert.equal(renderer.getResidentBytes(), 48, "final total is exactly the new chunk's size, no double count");
    assert.equal(renderer.getChunkCount(), 1);
  });

  it("explicit removal subtracts the removed chunk's bytes", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "a", n: 4 })); // 64B
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "b", n: 1 })); // 16B
    assert.equal(renderer.getResidentBytes(), 80);

    controller.removeChunkByKey("t:a-c0");

    assert.equal(renderer.getResidentBytes(), 16, "removed chunk's bytes subtracted");
  });

  it("disposal resets resident-byte accounting to zero", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "a", n: 5 }));
    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "b", n: 2 }));
    assert.ok(renderer.getResidentBytes() > 0);

    controller.dispose();

    assert.equal(renderer.getResidentBytes(), 0);
  });

  it("oversized single-chunk policy: accepted anyway, all older chunks evicted (soft budget)", () => {
    const renderer = new FakeChunkRenderer();
    const controller = new ChunkedGeometryController({ renderer, maxGpuBytes: 10 });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "a", n: 1 })); // 16B > budget(10) alone

    // Never rejected — still resident despite exceeding the (soft) budget.
    assert.equal(renderer.getChunkCount(), 1);
    assert.equal(renderer.getResidentBytes(), 16);
    assert.ok(renderer.getResidentBytes() > 10, "soft budget: exceeding is allowed for an unavoidably oversized chunk");

    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "b", n: 1 })); // another 16B, still > budget alone

    // "a" must be evicted to make maximum room before "b" (still oversized alone) is accepted.
    assert.equal(renderer.getChunkCount(), 1);
    assert.ok(!renderer.getChunkKeys().includes("t:a-c0"));
    assert.ok(renderer.getChunkKeys().includes("t:b-c0"));
  });

  it("eviction callbacks fire correctly for real byte-triggered evictions", () => {
    const renderer = new FakeChunkRenderer();
    const evicted = [];
    const controller = new ChunkedGeometryController({
      renderer,
      maxGpuBytes: 20,
      onGpuChunkEvicted: (key) => evicted.push(key),
    });

    controller.ingestWorkerChunk(chunkMsg({ parseId: 1, tileKey: "a", n: 1 })); // 16B
    assert.deepEqual(evicted, []);

    controller.ingestWorkerChunk(chunkMsg({ parseId: 2, tileKey: "b", n: 1 })); // 16+16=32 > 20 => evict a

    assert.deepEqual(evicted, ["t:a-c0"], "byte-triggered eviction fires the callback exactly once, for the right key");
  });
});
