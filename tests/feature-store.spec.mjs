/**
 * Run: npm run build && node --test tests/feature-store.spec.mjs
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { FeatureStore } from "../dist/core/feature-store.js";

function makeRecord(id, overrides = {}) {
  return {
    id,
    geometryKind: "point",
    vertexStart: id,
    vertexCount: 1,
    properties: { n: id, ...overrides.properties },
    ...overrides,
  };
}

describe("FeatureStore", () => {
  beforeEach(() => {});

  it("insert 10k features and lookup random id (Map O(1) average)", () => {
    const store = new FeatureStore();
    const n = 10_000;
    const records = [];
    for (let i = 0; i < n; i++) {
      records.push(makeRecord(i, { properties: { tag: `f${i}` } }));
    }
    store.ingestRecords(records);
    assert.equal(store.getById(0)?.properties.tag, "f0");
    assert.equal(store.getById(9999)?.properties.tag, "f9999");

    const probe = [7, 5012, 8234, 0, n - 1];
    for (const id of probe) {
      const r = store.getById(id);
      assert.ok(r);
      assert.equal(r.id, id);
      assert.equal(r.properties.tag, `f${id}`);
    }
  });

  it("duplicate featureId: last ingest wins", () => {
    const store = new FeatureStore();
    store.ingestRecords([makeRecord(1, { properties: { v: "a" } })]);
    store.ingestRecords([makeRecord(1, { properties: { v: "b" }, vertexStart: 99 })]);
    const r = store.getById(1);
    assert.equal(r.properties.v, "b");
    assert.equal(r.vertexStart, 99);
  });

  it("missing featureId returns undefined", () => {
    const store = new FeatureStore();
    store.ingestRecords([makeRecord(1)]);
    assert.equal(store.getById(999), undefined);
    assert.equal(store.getRecord(999), undefined);
  });

  it("ingest to previously missing id acts as insert (upsert)", () => {
    const store = new FeatureStore();
    assert.equal(store.getById(42), undefined);
    store.ingestRecords([makeRecord(42, { properties: { new: true } })]);
    assert.equal(store.getById(42)?.properties.new, true);
  });

  it("update geometry metadata via re-ingest (vertexStart / vertexCount)", () => {
    const store = new FeatureStore();
    store.ingestRecords([makeRecord(5, { vertexStart: 0, vertexCount: 1 })]);
    store.ingestRecords([makeRecord(5, { vertexStart: 100, vertexCount: 3 })]);
    const r = store.getById(5);
    assert.equal(r.vertexStart, 100);
    assert.equal(r.vertexCount, 3);
  });

  it("ingestRecordsWithPositions computes bbox from positions buffer", () => {
    const positions = new Float32Array([0, 0, 10, 20, 5, 5]);
    const store = new FeatureStore();
    store.ingestRecordsWithPositions(positions, [
      {
        id: 1,
        geometryKind: "point",
        vertexStart: 0,
        vertexCount: 1,
        properties: {},
      },
      {
        id: 2,
        geometryKind: "line",
        vertexStart: 1,
        vertexCount: 2,
        properties: {},
      },
    ]);
    assert.deepEqual(store.getById(1)?.bbox, [0, 0, 0, 0]);
    assert.deepEqual(store.getById(2)?.bbox, [5, 5, 10, 20]);
  });

  it("ingestRecordsWithPositions: out-of-range geometry leaves bbox undefined (no throw)", () => {
    const positions = new Float32Array(2); // only one xy pair
    const store = new FeatureStore();
    store.ingestRecordsWithPositions(positions, [
      {
        id: 1,
        geometryKind: "point",
        vertexStart: 5,
        vertexCount: 1,
        properties: {},
      },
    ]);
    const r = store.getById(1);
    assert.equal(r.bbox, undefined);
  });

  it("remove and retainIds", () => {
    const store = new FeatureStore();
    store.ingestRecords([makeRecord(1), makeRecord(2), makeRecord(3)]);
    assert.equal(store.remove(2), true);
    assert.equal(store.getById(2), undefined);
    assert.equal(store.remove(99), false);

    const removed = store.retainIds(new Set([1]));
    assert.equal(removed, 1);
    assert.equal(store.getById(1)?.id, 1);
    assert.equal(store.getById(3), undefined);
  });

  it("getRecordsInExtent scans all records (O(n))", () => {
    const store = new FeatureStore();
    store.ingestRecordsWithPositions(new Float32Array([0, 0, 100, 100]), [
      { id: 1, geometryKind: "point", vertexStart: 0, vertexCount: 1, properties: {} },
      { id: 2, geometryKind: "point", vertexStart: 1, vertexCount: 1, properties: {} },
    ]);
    const hits = store.getRecordsInExtent([50, 50, 150, 150]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 2);
  });

  it("clear empties store", () => {
    const store = new FeatureStore();
    store.ingestRecords([makeRecord(1)]);
    store.clear();
    assert.equal(store.getById(1), undefined);
  });
});
