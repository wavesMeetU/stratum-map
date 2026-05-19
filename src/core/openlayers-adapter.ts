/**
 * OpenLayers FrameState Adapter
 *
 * Converts OpenLayers FrameState to standalone ViewState, enabling gradual migration
 * from OpenLayers-driven rendering to standalone ViewState-driven rendering.
 *
 * This adapter is the bridge between the legacy OpenLayers integration and the
 * new standalone ViewState system. It ensures matrix compatibility while allowing
 * both modes to coexist during migration.
 */

import { ViewState } from "./view-state.js";

/**
 * OpenLayers FrameState (devDependency only)
 *
 * This is a type-safe reference to the OpenLayers FrameState structure.
 * Since OpenLayers is a devDependency only, we don't import the actual type at runtime.
 *
 * @see https://openlayers.org/en/latest/apidoc/module-ol_MapBrowserEvent-MapBrowserEvent.html
 */
export interface OpenLayersFrameState {
  /** Coordinate-to-pixel transform matrix (3×3 affine) */
  readonly coordinateToPixelTransform: Float32Array;
  /** View center in map projection */
  readonly viewState: {
    readonly center: [number, number];
    readonly resolution: number;
    readonly rotation: number;
  };
  /** Viewport size in pixels */
  readonly size: [number, number];
  /** Timestamp in milliseconds */
  readonly time: number;
}

/**
 * Adapter that converts OpenLayers FrameState to ViewState
 *
 * This adapter:
 * 1. Extracts view parameters from OpenLayers FrameState
 * 2. Creates a ViewState instance
 * 3. Ensures the ViewState generates the same clip matrix as the legacy
 *    frameStateToClipMatrix() function
 */
export class OpenLayersFrameStateAdapter {
  /**
   * Convert OpenLayers FrameState to ViewState
   *
   * The ViewState will generate identical clip matrices to the legacy
   * frameStateToClipMatrix() function, ensuring visual equivalence.
   *
   * @param frameState - OpenLayers FrameState from postrender event
   * @returns ViewState with equivalent view parameters
   */
  static frameStateToViewState(frameState: OpenLayersFrameState): ViewState {
    const { center, resolution, rotation } = frameState.viewState;
    const [width, height] = frameState.size;

    // Calculate zoom level from resolution
    // For Web Mercator, resolution = baseResolution / (2^zoom)
    // Therefore: zoom = log2(baseResolution / resolution)
    const BASE_RESOLUTION = 156543.03392804103;
    const zoom = Math.log2(BASE_RESOLUTION / resolution);

    return new ViewState(
      [center[0], center[1]],
      zoom,
      rotation,
      [width, height],
      resolution // Pass explicit resolution to avoid recalculation
    );
  }

  /**
   * Generate the legacy frameStateToClipMatrix() matrix from FrameState
   *
   * This function replicates the legacy OpenLayers matrix computation
   * for testing and verification purposes.
   *
   * Column-major 4×4: map projection XY → WebGPU clip (w = 1)
   *
   * @param frameState - OpenLayers FrameState
   * @param out - Output Float32Array (will be mutated)
   * @returns The same matrix as out for chaining
   */
  static frameStateToClipMatrix(
    frameState: OpenLayersFrameState,
    out: Float32Array
  ): Float32Array {
    const t = frameState.coordinateToPixelTransform;
    const w = frameState.size[0];
    const h = frameState.size[1];
    const t0 = t[0];
    const t1 = t[1];
    const t2 = t[2];
    const t3 = t[3];
    const t4 = t[4];
    const t5 = t[5];
    const ax = (2 / w) * t0;
    const bx = (2 / w) * t2;
    const cx = (2 / w) * t4 - 1;
    const ay = (-2 / h) * t1;
    const by = (-2 / h) * t3;
    const cy = 1 - (2 / h) * t5;

    out[0] = ax;
    out[1] = ay;
    out[2] = 0;
    out[3] = 0;
    out[4] = bx;
    out[5] = by;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = cx;
    out[13] = cy;
    out[14] = 0;
    out[15] = 1;

    return out;
  }

  /**
   * Verify that ViewState generates the same matrix as OpenLayers FrameState
   *
   * This is used for testing and validation during migration.
   *
   * @param frameState - OpenLayers FrameState
   * @param viewState - ViewState to verify
   * @param epsilon - Tolerance for floating point comparison (default 1e-6)
   * @returns true if matrices match within tolerance
   */
  static matricesMatch(
    frameState: OpenLayersFrameState,
    viewState: ViewState,
    epsilon: number = 1e-6
  ): boolean {
    const legacyMatrix = new Float32Array(16);
    OpenLayersFrameStateAdapter.frameStateToClipMatrix(frameState, legacyMatrix);

    const viewStateMatrix = viewState.getClipMatrix();

    for (let i = 0; i < 16; i++) {
      if (Math.abs(legacyMatrix[i]! - viewStateMatrix[i]!) > epsilon) {
        return false;
      }
    }
    return true;
  }
}
