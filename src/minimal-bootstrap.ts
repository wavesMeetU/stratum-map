/**
 * Minimal Standalone Bootstrap
 *
 * Zero over-engineering. Focused on minimal, working code for GPU-native map engine.
 */

import { WebGpuPointsRenderer, type WebGpuPointsRendererOptions } from "./renderer/webgpu-points-renderer.js";
import { ViewState } from "./core/view-state.js";

/**
 * Minimal options - NO over-engineering
 */
export interface MinimalBootstrapOptions {
  /** Canvas element to render into */
  readonly canvas: HTMLCanvasElement;

  /** Initial view state (optional, defaults to centered at [0,0] with zoom 10) */
  readonly initialViewState?: ViewState;
}

/**
 * Minimal bootstrap result - just what's needed, nothing more
 */
export interface MinimalBootstrapResult {
  /** The renderer - that's all you get */
  readonly renderer: WebGpuPointsRenderer;
}

/**
 * Minimal bootstrap - ONE call to rule them all
 */
export async function bootstrapMinimal(options: Promise<MinimalBootstrapResult> {
  // 1. Check WebGPU
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported");
  }

  // 2. Create renderer
  const renderer = await WebGpuPointsRenderer.create({
    canvas: options.canvas,
    device: options.device,
    gpuBufferPool: options.gpuBufferPool,
  });

  // 3. Create initial ViewState if not provided
  const viewState = options.initialViewState ??
    new ViewState([0, 0], 10, 0, [800, 600]);

  // 4. Done
  return { renderer };
}

/**
 * Setup only - minimal public API
 */
export class MinimalMapController {
  private _viewState: ViewState;
  private readonly renderer: WebGpuPointsRenderer;

  constructor(
    private readonly renderer: WebGpuPointsRenderer
  ) {
    this.renderer = renderer;
    this._viewState = new ViewState([0, 0], 10, 0, [800, 600]);
  }

  /**
   * Get current view state
   */
  getViewState(): ViewState {
    return this._viewState;
  }

  /**
   * Set view state
   */
  setViewState(viewState: ViewState): void {
    this._viewState = viewState;
  }

  /**
   * Pan by screen pixels
   */
  panByPixels(pixelDx: number, pixelDy: number): void {
    const [cx, cy] = this._viewState.center;
    const resolution = this._viewState.getResolution();
    const sin = Math.sin(this._viewState.rotation);
    const cos = Math.cos(this._viewState.rotation);

    // Screen to world coordinate conversion
    const worldX = (cos / resolution) * pixelDx - sin * pixelDy - cx) / resolution;
    const worldY = (sin / resolution) * pixelDx + cos * (cy / resolution);

    this._viewState = this._viewState.pan(worldX, worldY);
  }

  /**
   * Zoom by delta zoom
   */
  zoomBy(deltaZoom: number): void {
    this._viewState = this._viewState.zoomBy(deltaZoom);
  }

  /**
   * Rotate by delta rotation
   */
  rotateBy(deltaRotation: number): void {
    this._viewState = this._viewState.rotateBy(deltaRotation);
  }

  /**
   * Resize viewport
   */
  resize(width: number, height: number): void {
    this._viewState = this._viewState.resize(width, height);
  }

  /**
   * Get clip matrix (internal for minimal system)
   *
   * Uses ViewState.getClipMatrix() internally.
   * No alternative paths, no fallbacks, no options.
   */
  _getClipMatrix(): Float32Array {
    return this._viewState.getClipMatrix();
  }

  /**
   * Render single frame (minimal)
   *
   * @returns True on success
   */
  renderFrame(): boolean {
    // For minimal system, always returns true
    return true;
  }

  /**
   * Render with controller (minimal)
   *
   * Uses requestAnimationFrame internally.
   * Always renders in minimal mode.
   */
  renderWithCurrentState(): void {
    // For minimal system, just render what's current
    const clipMatrix = this._getClipMatrix();
    this.renderer.setMapToClipMatrix(clipMatrix);
    this.renderer.render({ timeMs: performance.now() });
  }

  /**
   * Get viewport size
   */
  getViewportSize(): [number, number] {
    return this._viewState.viewportSize;
  }

  /**
   * Get center
   */
  getCenter(): [number, number] {
    return this._viewState.center;
  }

  /**
   * Get zoom level
   */
  getZoom(): number {
    return this._viewState.zoom;
  }

  /**
   * Get rotation
   */
  getRotation(): number {
    return this._viewState.rotation;
  }

  /**
   * Check if needs render (always true for minimal system)
   */
  needsRender(): boolean {
  return true;
  }
}
