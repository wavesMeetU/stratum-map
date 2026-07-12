/**
 * ViewState - Standalone view state management for WebGPU rendering
 *
 * This class encapsulates all view parameters needed to compute transformation
 * matrices for rendering, completely independent of OpenLayers.
 *
 * Coordinate spaces:
 * - World space: Map coordinates (e.g., Web Mercator)
 * - View space: Coordinates relative to view center, pre-rotation
 * - Screen space: Pixel coordinates in viewport
 * - Clip space: Normalized device coordinates [-1, 1] for GPU shaders
 */

export class ViewState {
  /**
   * Create a new ViewState
   *
   * @param center - View center in world coordinates [x, y]
   * @param zoom - Zoom level (typically 0-20 for web maps)
   * @param rotation - Rotation in radians (counter-clockwise)
   * @param viewportSize - Viewport dimensions [width, height] in pixels
   * @param resolution - Optional explicit resolution (overrides zoom-based calculation)
   */
  constructor(
    public readonly center: [number, number],
    public readonly zoom: number,
    public readonly rotation: number,
    public readonly viewportSize: [number, number],
    private readonly resolution?: number
  ) {
    if (viewportSize[0] <= 0 || viewportSize[1] <= 0) {
      throw new Error('Viewport dimensions must be positive');
    }
  }

  /**
   * Calculate resolution from zoom level
   *
   * In web mapping, resolution is the map units per pixel at the current zoom.
   * Each zoom level typically doubles the resolution (halves the scale).
   *
   * Formula: resolution = baseResolution / (2^zoom)
   *
   * Where baseResolution is the resolution at zoom 0.
   * For Web Mercator (EPSG:3857), the world is 40,075,016.686m wide,
   * and a typical tile at zoom 0 is 256x256 pixels, giving:
   * baseResolution ≈ 156,543.03392804103 m/pixel
   *
   * @param zoom - Zoom level
   * @returns Resolution in map units per pixel
   */
  private static getResolutionFromZoom(zoom: number): number {
    const BASE_RESOLUTION = 156543.03392804103; // Web Mercator at zoom 0
    return BASE_RESOLUTION / Math.pow(2, zoom);
  }

  /**
   * Get the current resolution
   *
   * Resolution represents how many map units (e.g., meters) correspond to one pixel.
   * Lower resolution = more zoomed in (smaller area per pixel)
   * Higher resolution = more zoomed out (larger area per pixel)
   *
   * @returns Resolution in map units per pixel
   */
  getResolution(): number {
    return this.resolution ?? ViewState.getResolutionFromZoom(this.zoom);
  }

  /**
   * Whether this ViewState was constructed with an explicit `resolution` override
   * (as opposed to deriving resolution from `zoom` via the Web Mercator formula).
   * Mutators use this to decide whether to keep propagating an explicit override
   * or let the next state fall back to zoom-derived resolution.
   */
  hasExplicitResolution(): boolean {
    return this.resolution !== undefined;
  }

  /**
   * Compute the clip matrix for transforming world coordinates to clip space
   *
   * The transformation chain is:
   * 1. Translate world to view center (T_center)
   * 2. Scale by resolution (S_res)
   * 3. Rotate counter-clockwise by rotation angle (R_rot)
   * 4. Scale to viewport dimensions (S_viewport)
   * 5. Transform to clip space (T_clip)
   *
   * Combined matrix: M_clip × S_viewport × R_rot × S_res × T_center
   *
   * Clip space for WebGPU:
   * - X: [-1, 1] (left to right)
   * - Y: [-1, 1] (bottom to top)
   * - Z: [0, 1] (near to far)
   *
   * Note: This matches WebGL convention for 2D rendering.
   * For 3D, you may need to adjust the Z range.
   *
   * @returns 4×4 column-major transformation matrix as Float32Array
   */
  getClipMatrix(): Float32Array {
    const [cx, cy] = this.center;
    const [width, height] = this.viewportSize;
    const resolution = this.getResolution();
    const cos = Math.cos(-this.rotation); // Counter-rotate world
    const sin = Math.sin(-this.rotation);

    // Column-major 4×4 matrix
    // Each column is stored consecutively: [col0, col1, col2, col3]
    const matrix = new Float32Array(16);

    // Column 0: X transformation
    // World X → View X (scaled + rotated) → Screen X → Clip X
    matrix[0] = (cos / resolution) * (2 / width);
    matrix[1] = (sin / resolution) * (2 / width);
    matrix[2] = 0;
    matrix[3] = 0;

    // Column 1: Y transformation
    // World Y → View Y (scaled + rotated) → Screen Y → Clip Y
    matrix[4] = (-sin / resolution) * (2 / height);
    matrix[5] = (cos / resolution) * (2 / height);
    matrix[6] = 0;
    matrix[7] = 0;

    // Column 2: Z transformation (identity for 2D)
    matrix[8] = 0;
    matrix[9] = 0;
    matrix[10] = 1;
    matrix[11] = 0;

    // Column 3: Translation
    // Center translation → Viewport offset → Clip space origin
    // Note: Translation is applied after rotation, so we need to counter-rotate
    // the center coordinates before computing the translation
    matrix[12] = ((-cx * cos - cy * sin) / resolution) * (2 / width);
    matrix[13] = ((cx * sin - cy * cos) / resolution) * (2 / height);
    matrix[14] = 0;
    matrix[15] = 1;

    return matrix;
  }

  /**
   * Create a new ViewState with updated center (pan)
   *
   * @param deltaX - Pan delta in world X coordinates
   * @param deltaY - Pan delta in world Y coordinates
   * @returns New ViewState with updated center
   */
  pan(deltaX: number, deltaY: number): ViewState {
    return new ViewState(
      [this.center[0] + deltaX, this.center[1] + deltaY],
      this.zoom,
      this.rotation,
      this.viewportSize,
      this.resolution
    );
  }

  /**
   * Create a new ViewState with updated zoom
   *
   * When an explicit `resolution` was configured, it is **scaled** by the same
   * factor a zoom-derived view would apply (halved per +1 zoom level), not copied
   * unchanged — copying it unchanged would leave `getResolution()` constant and
   * make the zoom operation visually inert.
   *
   * @param deltaZoom - Zoom level change (positive = zoom in, negative = zoom out)
   * @returns New ViewState with updated zoom
   */
  zoomBy(deltaZoom: number): ViewState {
    const newResolution =
      this.resolution !== undefined
        ? this.resolution / Math.pow(2, deltaZoom)
        : undefined;
    return new ViewState(
      this.center,
      this.zoom + deltaZoom,
      this.rotation,
      this.viewportSize,
      newResolution
    );
  }

  /**
   * Create a new ViewState with updated rotation
   *
   * @param deltaRotation - Rotation change in radians (counter-clockwise)
   * @returns New ViewState with updated rotation
   */
  rotateBy(deltaRotation: number): ViewState {
    return new ViewState(
      this.center,
      this.zoom,
      this.rotation + deltaRotation,
      this.viewportSize,
      this.resolution
    );
  }

  /**
   * Create a new ViewState with updated viewport size
   *
   * @param width - New viewport width in pixels
   * @param height - New viewport height in pixels
   * @returns New ViewState with updated viewport size
   */
  resize(width: number, height: number): ViewState {
    return new ViewState(
      this.center,
      this.zoom,
      this.rotation,
      [width, height],
      this.resolution
    );
  }

  /**
   * Check if two ViewStates are equivalent
   *
   * @param other - Other ViewState to compare
   * @param epsilon - Tolerance for floating point comparison
   * @returns True if view states are equivalent within tolerance
   */
  equals(other: ViewState, epsilon: number = 1e-10): boolean {
    return (
      Math.abs(this.center[0] - other.center[0]) < epsilon &&
      Math.abs(this.center[1] - other.center[1]) < epsilon &&
      Math.abs(this.zoom - other.zoom) < epsilon &&
      Math.abs(this.rotation - other.rotation) < epsilon &&
      this.viewportSize[0] === other.viewportSize[0] &&
      this.viewportSize[1] === other.viewportSize[1] &&
      Math.abs(this.getResolution() - other.getResolution()) < epsilon
    );
  }

  /**
   * Get a string representation for debugging
   */
  toString(): string {
    return `ViewState(center=[${this.center[0].toFixed(2)}, ${this.center[1].toFixed(2)}], zoom=${this.zoom.toFixed(2)}, rotation=${this.rotation.toFixed(2)}rad, viewport=${this.viewportSize[0]}x${this.viewportSize[1]})`;
  }
}

/**
 * Helper function to create a ViewState from pixel-based pan/zoom
 *
 * This is useful when you have pan deltas in screen pixels and want to
 * convert them to world coordinates before creating the ViewState.
 *
 * @param currentView - Current ViewState
 * @param pixelDeltaX - Pan delta in screen pixels (X direction)
 * @param pixelDeltaY - Pan delta in screen pixels (Y direction)
 * @returns New ViewState with panned center
 */
export function panByPixels(
  currentView: ViewState,
  pixelDeltaX: number,
  pixelDeltaY: number
): ViewState {
  const resolution = currentView.getResolution();
  const cos = Math.cos(currentView.rotation);
  const sin = Math.sin(currentView.rotation);

  // Convert pixel delta to world delta, accounting for rotation
  const worldDeltaX = (pixelDeltaX * cos - pixelDeltaY * sin) * resolution;
  const worldDeltaY = (pixelDeltaX * sin + pixelDeltaY * cos) * resolution;

  return currentView.pan(worldDeltaX, worldDeltaY);
}

/**
 * Helper function to zoom toward a point
 *
 * @param currentView - Current ViewState
 * @param zoomFactor - Zoom multiplier (e.g., 2.0 for zoom in, 0.5 for zoom out)
 * @param anchorX - Anchor point X in world coordinates (optional, defaults to center)
 * @param anchorY - Anchor point Y in world coordinates (optional, defaults to center)
 * @returns New ViewState zoomed toward anchor point
 */
export function zoomToward(
  currentView: ViewState,
  zoomFactor: number,
  anchorX?: number,
  anchorY?: number
): ViewState {
  const ax = anchorX ?? currentView.center[0];
  const ay = anchorY ?? currentView.center[1];

  // Calculate new center to keep anchor point stable
  const newCenter: [number, number] = [
    ax - (ax - currentView.center[0]) / zoomFactor,
    ay - (ay - currentView.center[1]) / zoomFactor,
  ];

  // Resolution always scales by 1/zoomFactor regardless of explicit-resolution
  // mode — this is the actual visual zoom effect and must never be skipped.
  const currentResolution = currentView.getResolution();
  const newResolution = currentResolution / zoomFactor;
  // `zoom` is kept as an informational/bookkeeping label derived via the Web
  // Mercator formula (matches legacy behavior); it does not drive the clip
  // matrix when an explicit resolution is propagated below.
  const newZoom = Math.log2(156543.03392804103 / newResolution);

  // Only propagate the computed resolution as an explicit override when the
  // input view was itself in explicit-resolution mode — otherwise preserve
  // the existing zoom-derived (Web Mercator) behavior unchanged.
  return new ViewState(
    newCenter,
    newZoom,
    currentView.rotation,
    currentView.viewportSize,
    currentView.hasExplicitResolution() ? newResolution : undefined
  );
}
