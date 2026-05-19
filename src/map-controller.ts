/**
 * MapController - Render lifecycle management for WebGPU map engine
 *
 * Manages render loop, frame scheduling, and dirty flag optimization.
 * Supports two rendering modes:
 * - OpenLayers-managed: OpenLayers controls frame timing
 * - Standalone: MapController controls frame timing via requestAnimationFrame
 *
 * Architecture:
 * - MapController owns the render lifecycle
 * - Renderer remains independent from render scheduling
 * - OpenLayers integration acts as an adapter layer
 */

import { ViewState, panByPixels, zoomToward } from "./core/view-state.js";
import type { WebGpuPointsRenderer } from "./renderer/webgpu-points-renderer.js";

/**
 * Rendering mode for the map controller
 */
export type RenderMode = "openlayers" | "standalone";

/**
 * Options for creating a MapController
 */
export interface MapControllerOptions {
  /**
   * The WebGPU renderer to manage
   */
  readonly renderer: WebGpuPointsRenderer;

  /**
   * Initial rendering mode
   * @default "openlayers"
   */
  readonly mode?: RenderMode;

  /**
   * Initial view state (for standalone mode)
   * @default ViewState centered at [0, 0] with zoom 10, no rotation
   */
  readonly initialViewState?: ViewState;

  /**
   * Callback fired before each render frame
   * Useful for frame timing, debugging, or custom pre-render logic
   */
  readonly onBeforeRender?: (frameIndex: number, timestamp: number) => void;

  /**
   * Callback fired after each render frame
   * Useful for post-render cleanup, metrics collection
   */
  readonly onAfterRender?: (frameIndex: number, timestamp: number) => void;
}

/**
 * MapController - Manages rendering lifecycle with dirty flag optimization
 *
 * The controller is responsible for:
 * 1. Managing the render loop (standalone mode only)
 * 2. Coordinating with OpenLayers frame scheduling (OpenLayers mode)
 * 3. Optimizing renders via dirty flags
 * 4. Handling viewport resize events
 * 5. Updating ViewState and notifying renderer
 */
export class MapController {
  private renderer: WebGpuPointsRenderer;
  private mode: RenderMode;
  private viewState: ViewState;
  private isDirty: boolean;
  private isRunning: boolean;
  private requestAnimationFrameId: number | null = null;
  private frameIndex: number = 0;

  // Callbacks (from options)
  private onBeforeRenderCallback: ((frameIndex: number, timestamp: number) => void) | null;
  private onAfterRenderCallback: ((frameIndex: number, timestamp: number) => void) | null;

  // OpenLayers mode callbacks (set by external code)
  private openLayersRenderFrame: (() => void) | null = null;

  /**
   * Create a new MapController
   *
   * @param options - Configuration options
   */
  constructor(options: MapControllerOptions) {
    this.renderer = options.renderer;
    this.mode = options.mode ?? "openlayers";
    this.viewState =
      options.initialViewState ??
      new ViewState([0, 0], 10, 0, [800, 600]);
    this.isDirty = true; // Initial render required
    this.isRunning = false;

    // Store callbacks from options
    this.onBeforeRenderCallback = options.onBeforeRender ?? null;
    this.onAfterRenderCallback = options.onAfterRender ?? null;
  }

  /**
   * Get the current rendering mode
   */
  getRenderMode(): RenderMode {
    return this.mode;
  }

  /**
   * Get the current view state
   */
  getViewState(): ViewState {
    return this.viewState;
  }

  /**
   * Check if a render is needed (dirty flag is set)
   */
  needsRender(): boolean {
    return this.isDirty;
  }

  /**
   * Get the current frame index
   */
  getFrameIndex(): number {
    return this.frameIndex;
  }

  /**
   * Switch between OpenLayers-managed and standalone rendering modes
   *
   * This method can be called at any time to change the rendering strategy.
   * The mode switch is instantaneous and preserves current view state.
   *
   * @param mode - The new rendering mode
   */
  switchMode(mode: RenderMode): void {
    if (this.mode === mode) {
      return;
    }

    this.mode = mode;

    // If switching to standalone, ensure we have a render loop running
    if (mode === "standalone" && !this.isRunning) {
      this.startRenderLoop();
    }
  }

  /**
   * Set the render frame callback for OpenLayers mode
   *
   * In OpenLayers mode, the map controller delegates frame timing to OpenLayers
   * by providing this callback which OpenLayers calls in its postrender handler.
   *
   * @param callback - Function to call for each render frame
   */
  setOpenLayersRenderFrame(callback: (() => void) | null): void {
    this.openLayersRenderFrame = callback;

    // When OpenLayers provides a render callback, stop our internal loop
    if (callback && this.isRunning) {
      this.stopRenderLoop();
    }
  }

  /**
   * Update the view state and mark the scene as dirty
   *
   * This is the primary method for modifying view state in standalone mode.
   * After calling this method, the scene will be re-rendered on the next frame.
   *
   * @param viewState - The new view state
   */
  updateViewState(viewState: ViewState): void {
    this.viewState = viewState;
    this.setDirty();
  }

  /**
   * Update individual view parameters with dirty flag
   *
   * Convenience methods that update specific view parameters.
   */

  /** Pan by world coordinate deltas */
  pan(deltaX: number, deltaY: number): void {
    this.viewState = this.viewState.pan(deltaX, deltaY);
    this.setDirty();
  }

  /** Pan by screen pixel deltas */
  panByPixels(pixelDeltaX: number, pixelDeltaY: number): ViewState {
    const newState = panByPixels(this.viewState, pixelDeltaX, pixelDeltaY);
    this.viewState = newState;
    this.setDirty();
    return newState;
  }

  /** Zoom by delta zoom levels */
  zoomBy(deltaZoom: number): void {
    this.viewState = this.viewState.zoomBy(deltaZoom);
    this.setDirty();
  }

  /** Zoom toward a specific point */
  zoomToward(zoomFactor: number, anchorX?: number, anchorY?: number): ViewState {
    const newState = zoomToward(this.viewState, zoomFactor, anchorX, anchorY);
    this.viewState = newState;
    this.setDirty();
    return newState;
  }

  /** Rotate by delta radians */
  rotateBy(deltaRotation: number): void {
    this.viewState = this.viewState.rotateBy(deltaRotation);
    this.setDirty();
  }

  /** Resize viewport */
  resize(width: number, height: number): void {
    this.viewState = this.viewState.resize(width, height);
    this.setDirty();
  }

  /**
   * Manually mark the scene as dirty
   *
   * Forces a re-render on the next frame, even if view state hasn't changed.
   * Useful when data is updated without changing view.
   */
  setDirty(): void {
    this.isDirty = true;
  }

  /**
   * Clear the dirty flag
   *
   * Called automatically after each render. This prevents re-renders
   * when nothing has changed.
   */
  private clearDirty(): void {
    this.isDirty = false;
  }

  /**
   * Start the standalone render loop
   *
   * In standalone mode, the map controller uses requestAnimationFrame
   * to drive rendering. Each frame checks the dirty flag and only
   * renders if something has changed.
   *
   * This method does nothing in OpenLayers mode (frame timing controlled externally).
   */
  startRenderLoop(): void {
    if (this.mode === "openlayers") {
      // In OpenLayers mode, rendering is controlled externally
      return;
    }

    if (this.isRunning) {
      return; // Already running
    }

    this.isRunning = true;
    this.isDirty = true; // Ensure initial render
    this.scheduleNextFrame();
  }

  /**
   * Stop the standalone render loop
   *
   * Cancels any pending requestAnimationFrame callbacks.
   *
   * This method does nothing in OpenLayers mode.
   */
  stopRenderLoop(): void {
    if (this.mode === "openlayers") {
      return;
    }

    this.isRunning = false;

    if (this.requestAnimationFrameId !== null) {
      cancelAnimationFrame(this.requestAnimationFrameId);
      this.requestAnimationFrameId = null;
    }
  }

  /**
   * Render a single frame
   *
   * This method renders the current state regardless of dirty flag.
   * Useful for forcing a re-render (e.g., after data updates).
   *
   * In OpenLayers mode, this calls the external render callback.
   * In standalone mode, this renders directly.
   */
  renderFrame(timestamp?: number): void {
    if (this.mode === "openlayers") {
      // Delegate to OpenLayers-provided callback
      this.openLayersRenderFrame?.();
      return;
    }

    // Standalone mode: render directly with ViewState
    this.invokeRenderCallbacks("before", this.frameIndex, timestamp);

    // Use ViewState as single source of truth
    this.renderer.renderWithViewState(this.viewState, { timeMs: timestamp ?? 0 });

    this.invokeRenderCallbacks("after", this.frameIndex, timestamp ?? 0);
    this.frameIndex++;
    this.clearDirty();
  }

  /**
   * Render a single frame only if dirty
   *
   * This is the standard render method for the render loop.
   * It checks the dirty flag and only renders if something has changed.
   *
   * @returns true if a render was performed, false if skipped
   */
  renderFrameIfNeeded(timestamp: number): boolean {
    if (!this.isDirty) {
      return false; // Nothing to render
    }

    this.renderFrame(timestamp);
    return true;
  }

  /**
   * Handle canvas resize event
   *
   * Updates the viewport size in the ViewState and marks as dirty.
   *
   * @param width - New canvas width in pixels
   * @param height - New canvas height in pixels
   */
  handleResize(width: number, height: number): void {
    this.resize(width, height);

    // In OpenLayers mode, also update the canvas backing store
    if (this.mode === "openlayers") {
      this.renderer.resizeBackingStore(width, height);
    }
  }

  /**
   * Schedule the next frame via requestAnimationFrame
   *
   * This is the core of the standalone render loop.
   */
  private scheduleNextFrame(): void {
    const render = (timestamp: number) => {
      this.requestAnimationFrameId = null;

      if (!this.isRunning) {
        return; // Loop was stopped before this frame fired
      }

      this.renderFrameIfNeeded(timestamp);

      if (this.isRunning) {
        // Schedule next frame
        this.requestAnimationFrameId = requestAnimationFrame(render);
      }
    };

    this.requestAnimationFrameId = requestAnimationFrame(render);
  }

  /**
   * Invoke render callbacks if registered
   */
  private invokeRenderCallbacks(
    phase: "before" | "after",
    frameIndex: number,
    timestamp?: number
  ): void {
    const callback = phase === "before" ? this.onBeforeRenderCallback : this.onAfterRenderCallback;
    callback?.(frameIndex, timestamp ?? 0);
  }

  /**
   * Release all resources
   *
   * Stops the render loop and cleans up callbacks.
   */
  release(): void {
    this.stopRenderLoop();
    this.openLayersRenderFrame = null;
    this.onBeforeRenderCallback = null;
    this.onAfterRenderCallback = null;
  }
}
