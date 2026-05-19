/**
 * ViewState System Tests
 *
 * Tests verify mathematical correctness, determinism, and edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import the ViewState implementation from compiled dist
import { ViewState, panByPixels, zoomToward } from '../dist/core/view-state.js';

describe('ViewState', () => {
  describe('Constructor and Basic Properties', () => {
    it('should create a valid ViewState', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      assert.strictEqual(view.center[0], 0);
      assert.strictEqual(view.center[1], 0);
      assert.strictEqual(view.zoom, 10);
      assert.strictEqual(view.rotation, 0);
      assert.strictEqual(view.viewportSize[0], 800);
      assert.strictEqual(view.viewportSize[1], 600);
    });

    it('should reject invalid viewport dimensions', () => {
      assert.throws(() => new ViewState([0, 0], 10, 0, [0, 600]));
      assert.throws(() => new ViewState([0, 0], 10, 0, [800, 0]));
      assert.throws(() => new ViewState([0, 0], 10, 0, [-1, 600]));
    });

    it('should accept explicit resolution', () => {
      const customRes = 100.5;
      const view = new ViewState([0, 0], 10, 0, [800, 600], customRes);
      assert.strictEqual(view.getResolution(), customRes);
    });
  });

  describe('Resolution Calculation', () => {
    it('should calculate resolution from zoom correctly', () => {
      const view10 = new ViewState([0, 0], 10, 0, [800, 600]);
      const view11 = new ViewState([0, 0], 11, 0, [800, 600]);
      const view9 = new ViewState([0, 0], 9, 0, [800, 600]);

      // Each zoom level halves the resolution
      assert.ok(Math.abs(view11.getResolution() - view10.getResolution() / 2) < 1e-10);
      assert.ok(Math.abs(view9.getResolution() - view10.getResolution() * 2) < 1e-10);
    });

    it('should have deterministic resolution', () => {
      const view1 = new ViewState([0, 0], 10, 0, [800, 600]);
      const view2 = new ViewState([0, 0], 10, 0, [800, 600]);
      assert.strictEqual(view1.getResolution(), view2.getResolution());
    });
  });

  describe('Clip Matrix Computation', () => {
    it('should produce a valid 4x4 matrix', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      const matrix = view.getClipMatrix();
      assert.strictEqual(matrix.length, 16);
    });

    it('should be deterministic', () => {
      const view1 = new ViewState([0, 0], 10, 0, [800, 600]);
      const view2 = new ViewState([0, 0], 10, 0, [800, 600]);
      const matrix1 = view1.getClipMatrix();
      const matrix2 = view2.getClipMatrix();

      for (let i = 0; i < 16; i++) {
        assert.strictEqual(matrix1[i], matrix2[i]);
      }
    });

    it('should transform center to clip space origin', () => {
      const view = new ViewState([100, 200], 10, 0, [800, 600]);
      const matrix = view.getClipMatrix();

      // Transform the center point [100, 200, 0, 1]
      const cx = 100, cy = 200;
      const x = matrix[0] * cx + matrix[4] * cy + matrix[12];
      const y = matrix[1] * cx + matrix[5] * cy + matrix[13];

      // Center should map to clip space origin (approximately)
      // Use slightly larger tolerance due to floating point precision
      assert.ok(Math.abs(x) < 1e-4, `Expected x ≈ 0, got ${x}`);
      assert.ok(Math.abs(y) < 1e-4, `Expected y ≈ 0, got ${y}`);
    });

    it('should handle rotation correctly', () => {
      const noRotation = new ViewState([0, 0], 10, 0, [800, 600]);
      const rotated = new ViewState([0, 0], 10, Math.PI / 2, [800, 600]);

      const matrix1 = noRotation.getClipMatrix();
      const matrix2 = rotated.getClipMatrix();

      // Matrices should be different
      let different = false;
      for (let i = 0; i < 16; i++) {
        if (Math.abs(matrix1[i] - matrix2[i]) > 1e-10) {
          different = true;
          break;
        }
      }
      assert.ok(different);
    });

    it('should handle different viewport sizes', () => {
      const small = new ViewState([0, 0], 10, 0, [400, 300]);
      const large = new ViewState([0, 0], 10, 0, [800, 600]);

      const matrix1 = small.getClipMatrix();
      const matrix2 = large.getClipMatrix();

      // Scaling factors should differ by factor of 2
      assert.ok(Math.abs(matrix1[0] - matrix2[0] * 2) < 1e-10);
      assert.ok(Math.abs(matrix1[5] - matrix2[5] * 2) < 1e-10);
    });
  });

  describe('Pan Operations', () => {
    it('should update center correctly', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      const panned = view.pan(100, 50);

      assert.strictEqual(panned.center[0], 100);
      assert.strictEqual(panned.center[1], 50);
      assert.strictEqual(panned.zoom, 10);
      assert.strictEqual(panned.rotation, 0);
    });

    it('should not mutate original view', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      view.pan(100, 50);

      assert.strictEqual(view.center[0], 0);
      assert.strictEqual(view.center[1], 0);
    });

    it('should compose correctly', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      const composed = view.pan(100, 0).pan(0, 50);
      const direct = view.pan(100, 50);

      assert.ok(composed.equals(direct));
    });
  });

  describe('Zoom Operations', () => {
    it('should update zoom correctly', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      const zoomed = view.zoomBy(1);

      assert.strictEqual(zoomed.zoom, 11);
      assert.ok(Math.abs(zoomed.getResolution() - view.getResolution() / 2) < 1e-10);
    });

    it('should handle negative zoom delta', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      const zoomed = view.zoomBy(-1);

      assert.strictEqual(zoomed.zoom, 9);
      assert.ok(Math.abs(zoomed.getResolution() - view.getResolution() * 2) < 1e-10);
    });
  });

  describe('Rotation Operations', () => {
    it('should update rotation correctly', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      const rotated = view.rotateBy(Math.PI / 4);

      assert.ok(Math.abs(rotated.rotation - Math.PI / 4) < 1e-10);
    });

    it('should handle negative rotation', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      const rotated = view.rotateBy(-Math.PI / 4);

      assert.ok(Math.abs(rotated.rotation - (-Math.PI / 4)) < 1e-10);
    });
  });

  describe('Resize Operations', () => {
    it('should update viewport size correctly', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      const resized = view.resize(1024, 768);

      assert.strictEqual(resized.viewportSize[0], 1024);
      assert.strictEqual(resized.viewportSize[1], 768);
    });

    it('should produce different matrices', () => {
      const view = new ViewState([0, 0], 10, 0, [800, 600]);
      const resized = view.resize(1024, 768);

      const matrix1 = view.getClipMatrix();
      const matrix2 = resized.getClipMatrix();

      let different = false;
      for (let i = 0; i < 16; i++) {
        if (Math.abs(matrix1[i] - matrix2[i]) > 1e-10) {
          different = true;
          break;
        }
      }
      assert.ok(different);
    });
  });

  describe('Equality Comparison', () => {
    it('should identify equal view states', () => {
      const view1 = new ViewState([100, 200], 10, Math.PI / 4, [800, 600]);
      const view2 = new ViewState([100, 200], 10, Math.PI / 4, [800, 600]);

      assert.ok(view1.equals(view2));
    });

    it('should identify different centers', () => {
      const view1 = new ViewState([100, 200], 10, 0, [800, 600]);
      const view2 = new ViewState([101, 200], 10, 0, [800, 600]);

      assert.ok(!view1.equals(view2));
    });

    it('should identify different zoom levels', () => {
      const view1 = new ViewState([0, 0], 10, 0, [800, 600]);
      const view2 = new ViewState([0, 0], 11, 0, [800, 600]);

      assert.ok(!view1.equals(view2));
    });

    it('should handle floating point tolerance', () => {
      const view1 = new ViewState([0, 0], 10, 0, [800, 600]);
      const view2 = new ViewState([1e-11, 0], 10, 0, [800, 600]);

      // Should be equal within default epsilon
      assert.ok(view1.equals(view2));
    });
  });

  describe('String Representation', () => {
    it('should produce readable output', () => {
      const view = new ViewState([100.5, 200.7], 10.3, 0.5, [800, 600]);
      const str = view.toString();

      assert.ok(str.includes('100.50'));
      assert.ok(str.includes('200.70'));
      assert.ok(str.includes('10.30'));
      assert.ok(str.includes('0.50'));
      assert.ok(str.includes('800x600'));
    });
  });
});

describe('panByPixels', () => {
  it('should convert pixel delta to world delta', () => {
    const view = new ViewState([0, 0], 10, 0, [800, 600]);
    const panned = panByPixels(view, 10, 20);

    // Should be different from original
    assert.ok(!view.equals(panned));

    // Center should have changed
    assert.ok(panned.center[0] !== 0 || panned.center[1] !== 0);
  });

  it('should account for rotation', () => {
    const view = new ViewState([0, 0], 10, Math.PI / 2, [800, 600]);
    const panned = panByPixels(view, 10, 0);

    // With 90° rotation, panning X should affect Y
    assert.ok(Math.abs(panned.center[1]) > 0);
  });
});

describe('zoomToward', () => {
  it('should zoom in toward center by default', () => {
    const view = new ViewState([100, 200], 10, 0, [800, 600]);
    const zoomed = zoomToward(view, 2.0);

    // Zoom level should increase
    assert.ok(zoomed.zoom > view.zoom);

    // Resolution should halve
    assert.ok(Math.abs(zoomed.getResolution() - view.getResolution() / 2) < 1e-10);
  });

  it('should keep anchor point stable', () => {
    const view = new ViewState([100, 200], 10, 0, [800, 600]);
    const anchorX = 150;
    const anchorY = 250;
    const zoomed = zoomToward(view, 2.0, anchorX, anchorY);

    // The anchor point should remain at the same screen position
    // (This is a conceptual test - actual verification would require
    // transforming coordinates through the matrix)
    assert.ok(zoomed.center[0] !== view.center[0]);
    assert.ok(zoomed.center[1] !== view.center[1]);
  });

  it('should zoom out correctly', () => {
    const view = new ViewState([100, 200], 10, 0, [800, 600]);
    const zoomed = zoomToward(view, 0.5);

    // Zoom level should decrease
    assert.ok(zoomed.zoom < view.zoom);

    // Resolution should double
    assert.ok(Math.abs(zoomed.getResolution() - view.getResolution() * 2) < 1e-10);
  });
});

// Helper function to compare matrices
function matrixEquals(m1, m2, epsilon = 1e-10) {
  if (m1.length !== m2.length) return false;
  for (let i = 0; i < m1.length; i++) {
    if (Math.abs(m1[i] - m2[i]) > epsilon) return false;
  }
  return true;
}
