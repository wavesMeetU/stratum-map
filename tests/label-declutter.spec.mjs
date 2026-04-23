/**
 * Run: npm run build && node --test tests/label-declutter.spec.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  declutterLabels,
  estimateLabelTextMetrics,
  projectMapAnchorToScreenPx,
} from "../dist/text/label-declutter.js";

function stubAtlas(advance = 8, cell = 10) {
  const uvRect = { u0: 0, v0: 0, u1: 0.1, v1: 0.1 };
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

/** Map (x,y) in **pixel-like** space to canvas pixels 0..vw/vh (for unit tests). */
function linearPixelMat(vw, vh) {
  const m = new Float32Array(16);
  m[0] = 2 / vw;
  m[5] = -2 / vh;
  m[12] = -1;
  m[13] = 1;
  m[15] = 1;
  return m;
}

function label(id, x, y, text, priority = 0, extra = {}) {
  return {
    id,
    x,
    y,
    text,
    color: [1, 1, 1, 1],
    sizePx: 10,
    priority,
    ...extra,
  };
}

describe("projectMapAnchorToScreenPx", () => {
  it("maps center map coords to viewport center", () => {
    const vw = 800;
    const vh = 600;
    const m = linearPixelMat(vw, vh);
    const p = projectMapAnchorToScreenPx(m, vw / 2, vh / 2, vw, vh);
    assert.ok(p);
    assert.ok(Math.abs(p.x - vw / 2) < 1e-3);
    assert.ok(Math.abs(p.y - vh / 2) < 1e-3);
  });
});

describe("estimateLabelTextMetrics", () => {
  it("returns positive width for ASCII text", () => {
    const atlas = stubAtlas();
    const m = estimateLabelTextMetrics(label(1, 0, 0, "abc", 0), atlas);
    assert.ok(m.widthPx > 0);
    assert.ok(m.heightPx > 0);
  });
});

describe("declutterLabels", () => {
  it("filters by zoom before projection", () => {
    const atlas = stubAtlas();
    const vw = 400;
    const vh = 300;
    const m = linearPixelMat(vw, vh);
    const labels = [
      label(1, 10, 10, "A", 0, { minZoom: 5 }),
      label(2, 20, 20, "B", 0, { maxZoom: 2 }),
    ];
    const r = declutterLabels(labels, atlas, {
      mapToClipColumnMajor: m,
      viewportWidthPx: vw,
      viewportHeightPx: vh,
      mapZoom: 3,
    });
    assert.equal(r.stats.rejectedZoom, 2);
    assert.equal(r.stats.acceptedCount, 0);
  });

  it("rejects fully offscreen projected boxes", () => {
    const atlas = stubAtlas();
    const vw = 200;
    const vh = 200;
    const m = linearPixelMat(vw, vh);
    const labels = [label(1, vw * 4, vh * 4, "X", 0)];
    const r = declutterLabels(labels, atlas, {
      mapToClipColumnMajor: m,
      viewportWidthPx: vw,
      viewportHeightPx: vh,
      mapZoom: 4,
    });
    assert.equal(r.stats.acceptedCount, 0);
    assert.ok(r.stats.rejectedOffscreen >= 1);
  });

  it("higher priority wins overlapping collision", () => {
    const atlas = stubAtlas(20, 10);
    const vw = 320;
    const vh = 240;
    const m = linearPixelMat(vw, vh);
    const x = 40;
    const y = 40;
    const labels = [
      label(10, x, y, "lo", 1),
      label(11, x, y, "hi", 100),
    ];
    const r = declutterLabels(labels, atlas, {
      mapToClipColumnMajor: m,
      viewportWidthPx: vw,
      viewportHeightPx: vh,
      mapZoom: 2,
      globalPaddingPx: 2,
    });
    assert.equal(r.stats.acceptedCount, 1);
    assert.equal(r.accepted[0].id, 11);
    assert.equal(r.stats.rejectedCollision, 1);
  });

  it("when priorities tie, lower id wins collision (stable tie-break)", () => {
    const atlas = stubAtlas(20, 10);
    const vw = 300;
    const vh = 220;
    const m = linearPixelMat(vw, vh);
    const x = 50;
    const y = 50;
    const labels = [
      label(11, x, y, "b", 0),
      label(10, x, y, "a", 0),
    ];
    const r = declutterLabels(labels, atlas, {
      mapToClipColumnMajor: m,
      viewportWidthPx: vw,
      viewportHeightPx: vh,
      mapZoom: 1,
      globalPaddingPx: 1,
    });
    assert.equal(r.stats.acceptedCount, 1);
    assert.equal(r.accepted[0].id, 10);
    assert.equal(r.stats.rejectedCollision, 1);
  });

  it("accepts spaced labels with no collisions", () => {
    const atlas = stubAtlas(8, 10);
    const vw = 640;
    const vh = 480;
    const m = linearPixelMat(vw, vh);
    const labels = [
      label(1, 40, 40, "A", 0),
      label(2, 400, 300, "B", 0),
      label(3, 200, 80, "C", 0),
    ];
    const r = declutterLabels(labels, atlas, {
      mapToClipColumnMajor: m,
      viewportWidthPx: vw,
      viewportHeightPx: vh,
      mapZoom: 2,
      globalPaddingPx: 1,
    });
    assert.equal(r.stats.acceptedCount, 3);
    assert.equal(r.stats.rejectedCollision, 0);
  });

  it("accepted set has pairwise non-overlap in screen space (naive check)", () => {
    const atlas = stubAtlas(7, 10);
    const vw = 420;
    const vh = 360;
    const m = linearPixelMat(vw, vh);
    const labels = [];
    for (let i = 0; i < 40; i++) {
      labels.push(label(i, (i * 13) % vw, ((i * 17) % vh) + (i % 3), `L${i}`, i % 5));
    }
    const r = declutterLabels(labels, atlas, {
      mapToClipColumnMajor: m,
      viewportWidthPx: vw,
      viewportHeightPx: vh,
      mapZoom: 3,
      globalPaddingPx: 2,
    });
    const rects = [];
    for (const lb of r.accepted) {
      const scr = projectMapAnchorToScreenPx(m, lb.x, lb.y, vw, vh);
      assert.ok(scr);
      const { widthPx, heightPx } = estimateLabelTextMetrics(lb, atlas);
      const anchor = lb.anchor ?? "center";
      let ox = -0.5 * widthPx;
      let oy = -0.5 * heightPx;
      if (anchor === "left") {
        ox = 0;
        oy = -0.5 * heightPx;
      }
      const pad = 2 + (lb.paddingPx ?? 0);
      rects.push({
        x0: scr.x + ox - pad,
        y0: scr.y + oy - pad,
        x1: scr.x + ox + widthPx + pad,
        y1: scr.y + oy + heightPx + pad,
      });
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const ov = !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
        assert.equal(ov, false);
      }
    }
  });
});
