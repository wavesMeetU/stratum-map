/**
 * Tests for OpenLayers FrameState Adapter
 *
 * Verifies that:
 * 1. OpenLayers FrameState can be converted to ViewState
 * 2. ViewState generates the same clip matrix as legacy frameStateToClipMatrix
 * 3. Matrices match within tolerance for various view configurations
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { ViewState, panByPixels, zoomToward } from "../dist/core/view-state.js";
import { OpenLayersFrameStateAdapter } from "../dist/core/openlayers-adapter.js";

describe("OpenLayers FrameState Adapter", () => {
  const BASE_RESOLUTION = 156543.03392804103;

  function createMockFrameState({
    centerX = 0,
    centerY = 0,
    resolution = BASE_RESOLUTION / Math.pow(2, 10),
    rotation = 0,
    width = 800,
    height = 600,
  } = {}) {
    const fs = {
      coordinateToPixelTransform: new Float32Array(6),
      viewState: {
        center: [centerX, centerY],
        resolution,
        rotation,
      },
      size: [width, height],
      time: 1000,
    };

    // Build coordinateToPixelTransform from view parameters
    // This matches OpenLayers internal transform construction
    const center = fs.viewState.center;
    const res = fs.viewState.resolution;
    const rot = fs.viewState.rotation;
    const w = fs.size[0];
    const h = fs.size[1];

    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    // coordinateToPixelTransform: [a, b, c, d, e, f] where
    // pixelX = a * worldX + c * worldY + e
    // pixelY = b * worldX + d * worldY + f
    //
    // OpenLayers uses a rotation matrix where positive rotation is clockwise
    // (screen space convention), so the signs are different from ViewState.
    const t = fs.coordinateToPixelTransform;
    t[0] = (1 / res) * cos;
    t[1] = -(1 / res) * sin;  // Negative for clockwise rotation
    t[2] = (1 / res) * sin;   // Positive for clockwise rotation
    t[3] = (1 / res) * cos;
    t[4] = w / 2 - (center[0] * t[0] + center[1] * t[2]);
    t[5] = h / 2 - (center[0] * t[1] + center[1] * t[3]);

    return fs;
  }

  describe("frameStateToViewState", () => {
    it("converts basic FrameState to ViewState", () => {
      const fs = createMockFrameState({
        centerX: 1000,
        centerY: 2000,
        resolution: BASE_RESOLUTION / Math.pow(2, 10),
        rotation: 0,
        width: 800,
        height: 600,
      });

      const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

      assert.equal(viewState.center[0], 1000);
      assert.equal(viewState.center[1], 2000);
      assert.equal(viewState.zoom, 10);
      assert.equal(viewState.rotation, 0);
      assert.equal(viewState.viewportSize[0], 800);
      assert.equal(viewState.viewportSize[1], 600);
      assert.equal(viewState.getResolution(), fs.viewState.resolution);
    });

    it("preserves explicit resolution", () => {
      const customResolution = 123.45;
      const fs = createMockFrameState({ resolution: customResolution });

      const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

      assert.equal(viewState.getResolution(), customResolution);
    });

    it("handles rotation correctly", () => {
      const fs = createMockFrameState({ rotation: Math.PI / 4 });

      const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

      assert.equal(viewState.rotation, Math.PI / 4);
    });

    it("handles various zoom levels", () => {
      for (const zoom of [0, 5, 10, 15, 20]) {
        const resolution = BASE_RESOLUTION / Math.pow(2, zoom);
        const fs = createMockFrameState({ resolution });

        const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

        assert.equal(viewState.zoom, zoom);
        assert.equal(viewState.getResolution(), resolution);
      }
    });
  });

  describe("frameStateToClipMatrix", () => {
    it("generates column-major 4×4 matrix", () => {
      const fs = createMockFrameState();
      const matrix = new Float32Array(16);

      OpenLayersFrameStateAdapter.frameStateToClipMatrix(fs, matrix);

      assert.equal(matrix.length, 16);
      assert.equal(matrix[10], 1); // Z scaling (identity for 2D)
      assert.equal(matrix[11], 0);
      assert.equal(matrix[14], 0);
      assert.equal(matrix[15], 1); // W component
    });

    it("identity-like transformation for center point", () => {
      const fs = createMockFrameState({ centerX: 0, centerY: 0, width: 800, height: 600 });
      const matrix = new Float32Array(16);

      OpenLayersFrameStateAdapter.frameStateToClipMatrix(fs, matrix);

      // Center point (0, 0) should map to near clip space origin
      const x = matrix[12];
      const y = matrix[13];

      // For a centered view, this should be near (0, 0) or small values
      assert.ok(Math.abs(x) < 0.1, `Expected x near 0, got ${x}`);
      assert.ok(Math.abs(y) < 0.1, `Expected y near 0, got ${y}`);
    });
  });

  describe("matricesMatch", () => {
    it("verifies matrices match for basic configuration", () => {
      const fs = createMockFrameState();
      const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

      assert.ok(OpenLayersFrameStateAdapter.matricesMatch(fs, viewState));
    });

    it("verifies matrices match with rotation", () => {
      const rotations = [Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2];

      for (const rotation of rotations) {
        const fs = createMockFrameState({ rotation });
        const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

        assert.ok(
          OpenLayersFrameStateAdapter.matricesMatch(fs, viewState),
          `Matrices should match for rotation ${rotation}`
        );
      }
    });

    it("verifies matrices match at different zoom levels", () => {
      for (const zoom of [5, 10, 15]) {
        const resolution = BASE_RESOLUTION / Math.pow(2, zoom);
        const fs = createMockFrameState({ resolution });
        const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

        assert.ok(
          OpenLayersFrameStateAdapter.matricesMatch(fs, viewState),
          `Matrices should match for zoom ${zoom}`
        );
      }
    });

    it("verifies matrices match with various viewport sizes", () => {
      const sizes = [
        [640, 480],
        [800, 600],
        [1024, 768],
        [1920, 1080],
        [3840, 2160],
      ];

      for (const [width, height] of sizes) {
        const fs = createMockFrameState({ width, height });
        const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

        assert.ok(
          OpenLayersFrameStateAdapter.matricesMatch(fs, viewState),
          `Matrices should match for viewport ${width}x${height}`
        );
      }
    });

    it("verifies matrices match with different centers", () => {
      const centers = [
        [0, 0],
        [1000000, 2000000],
        [-500000, 750000],
        [2000000, -1000000],
      ];

      for (const [centerX, centerY] of centers) {
        const fs = createMockFrameState({ centerX, centerY });
        const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

        assert.ok(
          OpenLayersFrameStateAdapter.matricesMatch(fs, viewState),
          `Matrices should match for center [${centerX}, ${centerY}]`
        );
      }
    });

    it("detects mismatched matrices with custom tolerance", () => {
      const fs = createMockFrameState();
      const viewState = new ViewState([0, 0], 10, 0, [800, 600]);

      // Slightly different zoom should cause mismatch
      const tweakedView = viewState.zoomBy(0.001);

      assert.ok(
        !OpenLayersFrameStateAdapter.matricesMatch(fs, tweakedView, 1e-10),
        "Slightly different zoom should cause mismatch with strict tolerance"
      );

      // But should match with looser tolerance
      assert.ok(
        OpenLayersFrameStateAdapter.matricesMatch(fs, tweakedView, 1e-3),
        "Slightly different zoom should match with looser tolerance"
      );
    });

    it("all matrix elements match individually", () => {
      const fs = createMockFrameState({
        centerX: 1234567,
        centerY: 7654321,
        resolution: BASE_RESOLUTION / Math.pow(2, 12),
        rotation: Math.PI / 8,
        width: 1280,
        height: 720,
      });

      const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);
      const legacyMatrix = new Float32Array(16);
      const viewStateMatrix = viewState.getClipMatrix();

      OpenLayersFrameStateAdapter.frameStateToClipMatrix(fs, legacyMatrix);

      for (let i = 0; i < 16; i++) {
        const diff = Math.abs(legacyMatrix[i] - viewStateMatrix[i]);
        assert.ok(
          diff < 1e-6,
          `Matrix element ${i} differs: ${legacyMatrix[i]} vs ${viewStateMatrix[i]} (diff: ${diff})`
        );
      }
    });
  });

  describe("integration with ViewState helpers", () => {
    it("panByPixels works with adapter", () => {
      const fs = createMockFrameState();
      const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

      const panned = panByPixels(viewState, 50, 30);

      // Verify panned state has same clip matrix as if we did it in OpenLayers
      // This requires constructing a new FrameState, which is more complex
      // For now, just verify the helper works
      assert.notEqual(panned.center[0], viewState.center[0]);
      assert.notEqual(panned.center[1], viewState.center[1]);
    });

    it("zoomToward works with adapter", () => {
      const fs = createMockFrameState();
      const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

      const zoomed = zoomToward(viewState, 2.0);

      // Verify zoomed state
      assert.equal(zoomed.zoom, 11); // zoom 10 + 1 (2x zoom)
      assert.ok(Math.abs(zoomed.getResolution() - viewState.getResolution() / 2) < 1e-6);
    });
  });

  describe("edge cases", () => {
    it("handles zero rotation", () => {
      const fs = createMockFrameState({ rotation: 0 });
      const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

      assert.ok(OpenLayersFrameStateAdapter.matricesMatch(fs, viewState));
    });

    it("handles full rotation (2π)", () => {
      const fs = createMockFrameState({ rotation: Math.PI * 2 });
      const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

      // Matrices should match (rotation should wrap correctly)
      // Note: ViewState doesn't normalize rotation, so we pass the raw value
      assert.ok(OpenLayersFrameStateAdapter.matricesMatch(fs, viewState));
    });

    it("handles extreme zoom levels", () => {
      for (const zoom of [0, 1, 18, 19, 20]) {
        const resolution = BASE_RESOLUTION / Math.pow(2, zoom);
        const fs = createMockFrameState({ resolution });
        const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(fs);

        assert.ok(
          OpenLayersFrameStateAdapter.matricesMatch(fs, viewState, 1e-5),
          `Should handle zoom level ${zoom}`
        );
      }
    });
  });
});
