/**
 * Run: npm run build && node --test tests/text-layout.spec.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutTextLabels } from "../dist/text/text-layout.js";

function stubAtlas(advance, cell) {
  const uvRect = { u0: 0, v0: 0, u1: 0.0625, v1: 0.1666 };
  return {
    family: "bitmap",
    cellEmPx: cell,
    getTextureView: () => {
      throw new Error("stub: no GPU");
    },
    getGlyphMetrics: () => ({
      advance,
      bearingX: 0,
      bearingY: 0,
      width: cell,
      height: cell,
      uvRect,
    }),
    atlasSampleModes: () => ({ magFilter: "nearest", minFilter: "nearest" }),
    destroy: () => {},
  };
}

describe("layoutTextLabels", () => {
  it("emits one glyph instance per ASCII character", () => {
    const atlas = stubAtlas(8, 10);
    const labels = [
      { id: 1, x: 100, y: 200, text: "ab", color: [1, 0, 0, 1], sizePx: 10 },
    ];
    const { instanceCount, instanceData } = layoutTextLabels(labels, atlas, {});
    assert.equal(instanceCount, 2);
    assert.equal(instanceData[0], 100);
    assert.equal(instanceData[1], 200);
    assert.equal(instanceData[2], 0);
    const stride = 20;
    assert.equal(instanceData[stride + 0], 100);
    assert.equal(instanceData[stride + 1], 200);
    assert.equal(instanceData[stride + 2], 8);
  });

  it("maps non-ASCII code points to glyph 63 slot via sanitize in layout", () => {
    const atlas = stubAtlas(8, 10);
    const labels = [{ id: 2, x: 0, y: 0, text: "\u03bb", color: [0, 1, 0, 1], sizePx: 10 }];
    const { instanceCount } = layoutTextLabels(labels, atlas, {});
    assert.equal(instanceCount, 1);
  });

  it("culls labels outside extent", () => {
    const atlas = stubAtlas(8, 10);
    const labels = [
      { id: 1, x: 0, y: 0, text: "x", color: [1, 1, 1, 1], sizePx: 10 },
      { id: 2, x: 1000, y: 1000, text: "y", color: [1, 1, 1, 1], sizePx: 10 },
    ];
    const { instanceCount } = layoutTextLabels(labels, atlas, {
      cullExtent3857: [0, 0, 50, 50],
      cullMarginWorld: 0,
    });
    assert.equal(instanceCount, 1);
  });

  it("respects maxGlyphs cap", () => {
    const atlas = stubAtlas(8, 10);
    const labels = [{ id: 1, x: 0, y: 0, text: "abcdef", color: [1, 1, 1, 1], sizePx: 10 }];
    const { instanceCount } = layoutTextLabels(labels, atlas, { maxGlyphs: 3 });
    assert.equal(instanceCount, 3);
  });

  it("prefers higher priority labels when maxGlyphs caps output", () => {
    const atlas = stubAtlas(10, 10);
    const labels = [
      { id: 1, x: 0, y: 0, text: "aa", color: [1, 0, 0, 1], sizePx: 10, priority: 0 },
      { id: 2, x: 1, y: 1, text: "b", color: [0, 1, 0, 1], sizePx: 10, priority: 10 },
    ];
    const { instanceCount, instanceData } = layoutTextLabels(labels, atlas, { maxGlyphs: 2 });
    assert.equal(instanceCount, 2);
    assert.equal(instanceData[0], 1);
    assert.equal(instanceData[4], 0);
    assert.equal(instanceData[1], 1);
  });
});
