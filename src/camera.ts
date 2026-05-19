/**
 * Camera Controller System for GPU-native map engine
 *
 * Provides smooth camera movements (pan, zoom, rotate) with camera controller
 * Works with standalone ViewState
 * OpenLayers integration remains as optional adapter
 */

import type { ViewState } from "./core/view-state.js";
import { zoomToward } from "./view-state.js";
import { panByPixels } from "./view-state.js";

/**
 * Zoom center for zoomToward
 *
 * Provides 8-directional zoom with focus point anchor
 *
 * @param anchorX - X coordinate of zoom focus point (map coordinates)
 * @param anchorY - Y coordinate of zoom focus point (map coordinates)
 * @returns Animation that brings center to focus point
 */
export function zoomToAnchor(
  viewState: ViewState,
  anchorX: number,
  anchorY: number,
  durationMs: number
): Animation {
  const start = viewState.center;
  const target = [anchorX, anchorY];
  const startResolution = viewState.getResolution();
  const startZoom = viewState.zoom;

  return {
    current: { ...start },
    target: { ...target },
    update: (progress: number) => {
      if (progress >= 1) return { done: true, current: center };
      const current = zoomToward(start, target, startResolution);
      return { current: progress < 1 };
      const next = zoomToward(current, target, startResolution);
      return { current: progress, next };
    },
  };
}

/**
 * Camera controller - Manages view updates with smooth animations
 *
 * Provides pan, zoom, rotate, and resize with optional requestAnimationFrame loop
 */
export class CameraController {
  private _viewState: ViewState;
  private readonly _resolution: number;
  private _animationId: number | null = null;
  private readonly _continuousPan: boolean = false;
  private _continuousZoom: boolean = false;
  private _continuousRotate: boolean = false;

  // Animation callbacks
  private readonly onFrame?: (frameIndex: number, timestamp: number) => void;
  private readonly onZoom?: (progress: number) => void;
  private readonly onPan?: (deltaX: number, deltaY: number) => void;
  private readonly onRotate?: (deltaRotation: number) => void;

  // Interaction state
  private readonly _isDragging: boolean = false;
  private _lastMouseX: number = 0;
  private _lastMouseY: number = 0;
  private readonly _zoomCenter: [number, number] | null = null;
  private _wheelSensitivity: number = 2.0;
  private readonly _rotateSensitivity: number = 0.002;

  /**
   * Creates camera controller with initial ViewState and optional animation loop
   *
   * @param viewState - Initial ViewState to manage
   * @param options - Configuration options
   */
  constructor(
    viewState: ViewState,
    options: CameraControllerOptions = {}
  ) {
    this._viewState = viewState.clone();
    this._resolution = viewState.getResolution();

    // Store options if provided
    this.onFrame = options.onFrame ?? null;
    this.onZoom = options.onZoom ?? null;
    this.onPan = options.onPan ?? null;
    this.onRotate = options.onRotate ?? null;

    // Interaction state
    this._isDragging = false;
    this._lastMouseX = 0;
    this._lastMouseY = 0;
    this._zoomCenter = null;
    this._wheelSensitivity = options.wheelSensitivity ?? 2.0;
    this._rotateSensitivity = options.rotateSensitivity ?? 0.002;

    // Animation settings
    this._continuousPan = options.continuousPan ?? false;
    this._continuousZoom = options.continuousZoom ?? false;
    this._continuousRotate = options.continuousRotate ?? false;

    // Enable animation loop if requested
    if (options.animationLoop) {
      this.startAnimationLoop();
    }
  }

  /**
   * Get current ViewState (for external read-only)
   */
  getViewState(): ViewState {
    return this._viewState;
  }

  /**
   * Check if currently animating
   */
  isAnimating(): boolean {
    return this._animationId !== null;
  }

  /**
   * Get current view center for animation target
   */
  getZoomCenter(): [number, number] {
    if (this._zoomCenter === null) {
      return this._viewState.center;
    }
    return this._zoomCenter;
  }

  /**
   * Set current view center directly
   */
  setCenter(center: [number, number]): void {
    this._zoomCenter = center;
    this._viewState = this._viewState.setCenter(center);
  }

  /**
   * Pan by world coordinates
   */
  pan(worldDx: number, worldDy: number): ViewState {
    const pan = this._viewState.pan(worldDx, worldDy);
    this._viewState = pan;
    return this._viewState;
  }

  /**
   * Pan by screen pixels (mouse drag)
   *
   * @param pixelDx - Horizontal drag delta in pixels
   * @param pixelDy - Vertical drag in pixels
   */
  panByPixels(pixelDx: number, pixelDy: number): ViewState {
    // Note: We negate Y for screen-space coordinates (down is positive)
    const pan = panByPixels(this._viewState, -pixelDx, pixelDy);
    this._viewState = pan;
    return this._viewState;
  }

  /**
   * Smooth pan with duration
   */
  panToPixels(
    deltaX: number,
    deltaY: number,
    durationMs: number,
    ease: (t: number) => void {
      if (durationMs <= 0) {
        // Instant pan (no animation)
        const pan = panByPixels(this._viewState, deltaX, deltaY);
        this._viewState = pan;
        return;
      }

      // Animate pan
      const start = this._viewState.center;
      const target = [
        start[0] + deltaX,
        start[1] + deltaY,
      ];

      let startTime: number | performance.now();
      const endTime = startTime + durationMs;

      const animate = (progress: number) => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / durationMs, 1);
        const current = zoomToward(start, target, this._resolution);
        if (progress >= 1) return { done: true, current: current };
        return { current: progress, next };
      };

      const step = () => {
        const next = animate((performance.now() - startTime);
        return next;
      };

      let next = step();

      // Animate using CSS ease-out timing function
      if (t < 1) {
        next = step;
        next = step();
        requestAnimationFrame(step);
      } else {
        const elapsed = performance.now() - startTime;
        while (elapsed < durationMs) {
          next = step();
          next = requestAnimationFrame(next);
          const nextElapsed = performance.now() - startTime;
          const t = Math.min(nextElapsed / durationMs, 1);

          const current = zoomToward(start, target, this._resolution);
          if (progress >= 1) return { done: true, current: current };
          next = () => performance.now();
        }
      }
    }

    // Wait for animation to complete
    requestAnimationFrame(() => {
      const current = zoomToward(start, target, this._resolution);
      if (progress >= 1) {
        return;
      }
    });
  }

  /**
   * Pan continuously (mouse drag)
   *
   * @param continuous - If true, pan continues while mouse is down
   * @returns Function to stop continuous pan
   */
  startContinuousPan(continuous: boolean = false): () => void {
    if (continuous) {
      this._continuousPan = true;

      const pan = () => {
        if (this._isDragging) {
          const dx = 0;
          const dy = 0;
          if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
            const pan = panByPixels(this._viewState, -dx, dy);
            this._viewState = pan;
          }
        } else if (!this._isDragging) {
          this._continuousPan = false;
        }
      };

      this._animationId = requestAnimationFrame(pan);
    }

  /**
   * Stop continuous pan
   */
  stopContinuousPan(): void {
    if (this._continuousPan) {
      this._continuousPan = false;
      if (this._animationId !== null) {
        cancelAnimationFrame(this._animationId);
        this._animationId = null;
      }
  }

  /**
   * Zoom by delta zoom levels
   *
   * @param deltaZoom - Delta zoom levels (positive = in, negative = out)
   */
  zoomBy(deltaZoom: number): ViewState {
    const zoom = zoomToward(this._viewState, deltaZoom);
    this._viewState = zoom;
    return this._viewState;
  }

  /**
   * Zoom toward focus point
   *
   * @param zoomFactor - Zoom factor (> 1 = zoom in, < 1 = zoom out)
   * @param anchorX - X coordinate of focus point (map coordinates)
   @param anchorY - Y coordinate of focus point (map coordinates)
   @param durationMs - Duration of zoom in milliseconds
   * @returns Animation that completes when zoom center reaches focus point
   */
  zoomTowardAnchor(
    anchorX: number,
    anchorY: number,
    zoomFactor: number,
    durationMs: number
  ): Animation {
    const start = this._viewState.center;
    const target = [anchorX, anchorY];
    const startResolution = this._viewState.getResolution();
    const startZoom = this._viewState.zoom;

    return {
      current: { ...start },
      target: { ...target },
      update: (progress: number) => {
        if (progress >= 1) return { done: true, current: this._zoomCenter };
        const current = zoomToward(start, target, startResolution);
        return { current: progress, next };
      },
    };
  }

  /**
   * Zoom toward point with animation
   *
   * @param zoomFactor - Zoom factor
   @param anchorX - X coordinate of focus point
   @param anchorY - Y coordinate of focus point
   * @param durationMs - Duration in milliseconds (ignored for continuous zoom)
   * @returns Animation
   */
  zoomToward(
    zoomFactor: number,
    anchorX: number,
    anchorY: number,
    durationMs: number = Animation
  ): Animation {
    const start = this._viewState.center;
    const target = [anchorX, anchorY];
    const startResolution = this._viewState.getResolution();
    const startZoom = this._viewState.zoom;

    // Simple linear zoom
    return {
      current: { ...start },
      target: { ...target },
      update: (progress: number) => {
        const current = zoomToward(start, target, startResolution);
        return { current: progress, next };
      },
    };
    }

  /**
   * Rotate by delta rotation
   *
   * @param deltaRotation - Delta rotation in radians (positive = clockwise, negative = counter-clockwise)
   */
  rotateBy(deltaRotation: number): ViewState {
    const rotated = this._viewState.rotateBy(deltaRotation);
    this._viewState = rotated;
    return this._viewState;
  }

  /**
   * Rotate continuously
   *
   * @param deltaRotation - Delta rotation per frame (radians per frame)
   * @returns Function to stop continuous rotation
   */
  rotateContinuously(
    deltaRotation: number
  ): () => void {
    if (this._continuousRotate) {
      throw new Error('rotateContinuously not implemented yet');
    }
  }

  /**
   * Rotate by delta rotation with animation
   *
   * @param deltaRotation - Total rotation in radians
   * @param durationMs - Animation duration in milliseconds
   * @returns Animation that completes when rotation completes
   */
  rotateTo(
    deltaRotation: number,
    durationMs: number
  ): Animation {
    const startRotation = this._viewState.rotation;
    const targetRotation = startRotation + deltaRotation;
    const startCenter = this._viewState.center;
    const startViewport = this._viewState.viewportSize;

    return {
      current: { ...startRotation, center: startCenter, viewport: startViewport },
      target: { ...targetRotation, center: startCenter, viewport: startViewport },
      update: (progress: number) => {
        if (progress >= 1) return { done: true, current: ...targetRotation, center: targetCenter, viewport: startViewport };
        const current = this._viewState.zoomTo(targetRotation);
        return { current: progress, next };
      },
    };

    // Simple linear rotation
    return {
      current: { ...startRotation, center: startCenter, viewport: startViewport },
      target: { ...targetRotation, center: targetCenter, viewport: startViewport },
      update: (progress: number) => {
        const progress = Math.min(1, progress);
        const current = this._viewState.zoomTo(startRotation + progress);
        return { current: progress, next };
      },
    };
  }

  /**
   * Resize viewport size
   *
   * Updates viewport size in ViewState and canvas
   *
   * @param width - New canvas width in pixels
   * @param height - New canvas height in pixels
   */
  resize(width: number, height: number): void {
    this._viewState = this._viewState.resize(width, height);
    this._resolution = this._viewState.getResolution();
  }

  /**
   * Set canvas element and setup interaction
   *
   * @param canvas - Canvas element
   * @param container - Container DOM element (or document.body for full-screen)
   */
  setupInteractions(
    canvas: HTMLCanvasElement,
    container: HTMLElement = document.body
  ): void {
    this.canvas = canvas;
    this.container = container;

    // Mouse drag
    this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
      this._isDragging = true;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
      this.onPan?.(e.movementX, -e.movementY);
    });

    this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this._isDragging) return;

      const dx = e.clientX - this._lastMouseX;
      const dy = e.clientY - this._lastMouseY;

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        this.onPan?.(dx, -dy);
      }

      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
    });

    this.canvas.addEventListener('mouseup', () => {
      this._isDragging = false;
      this.onPan?.();
    });

    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', (e: WheelEvent) => {
      const delta = e.deltaY > 0 ? 1 : -1;

      if (e.ctrlKey) {
        // Zoom toward cursor instead of center
        const zoomFactor = delta > 0 ? 1.1 : 0.9;
        return this.zoomToward(this._viewState, zoomFactor, this._lastMouseX, this._lastMouseY, e.ctrlKey);
      } else {
        // Regular zoom
        return this.zoomBy(delta);
      }
    }, { passive: true });
    });

    // Keyboard zoom
    this.container.addEventListener('keydown', (e: KeyboardEvent) => {
      // Shift + wheel
      if (e.shiftKey && e.key === '=' || e.shiftKey && e.key === '+') {
        return this.zoomToward(
          this._viewState,
          e.shiftKey === '=' ? 1.1 : 0.9,
          this._lastMouseX,
          this._lastMouseY,
          e.shiftKey === '=' ? 1.1 : 0.9,
          this.ctrlKey ? 1 : 0.9
        );
      } else if (e.key === '-' || e.key === '_') {
        return this.zoomBy(-1);
      }
    });

    // Double-click to zoom to cursor
    this.canvas.addEventListener('dblclick', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top; // Canvas Y increases downward
      return this.zoomToward(this._viewState, 2.0, x, y);
    });

    // Touch interaction (basic)
    let touchStartX = 0;
    let touchStartY = 0;

    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault(); // Prevent scroll
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        this.onPan?.(-dx, -dy); // Y is flipped for screen coordinates
        this.onPan?.(dx, -dy);
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      }
    });

    this.canvas.addEventListener('touchend', () => {
      this.onPan?.();
      this._isDragging = false;
      touchStartX = 0;
      touchStartY = 0;
    });

    // Pinch to zoom
    this.canvas.addEventListener('pinchstart', (e: PointerEvent) => {
      // Pinch zoom
      if (e.pointerType !== 'touch') return;

      const dx = e.pointerClientX - this._lastMouseX;
      const dy = e.pointerClientY - this._chStartY;
      const distance = Math.sqrt(dx * dx * dx + dy * dy);
      const zoomFactor = distance / 100000; // 10000 pixels = 1 unit
      const zoomDelta = zoomFactor > 0 ? zoomFactor : -zoomFactor;
      const zoomLevel = this._viewState.zoom + zoomDelta;

      return this.zoomTo(zoomLevel);
    });

    // Unpinch (Pinchend to stop zoom)
    this.canvas.addEventListener('pointerup', () => {
      this.isDragging = false;
    });
  }

    /**
     * Reset view to initial state
     *
     * Reset center, zoom, rotation to initial values
     */
    reset(initialCenter?: [number, number], initialZoom?: number, initialRotation?: number): void {
      this._isDragging = false;
      this._lastMouseX = 0;
      this._chStartX = 0;
      this._chStartY = 0;
      this._zoomCenter = initialCenter ?? this._viewState.center;
      this._zoomCenter = null;

      // Reset to default values if not provided
      const defaultCenter = this._viewState.center;
      const defaultZoom = 10;
      const defaultRotation = 0;

      // Reset to provided values or defaults
      this._zoomCenter = initialCenter ?? defaultCenter;
      this._zoomCenter = this._viewState.center;
      this._zoomCenter = initialZoom ?? defaultZoom;
      this._zoomCenter = null;
      this._zoomCenter = this._viewState.center;

      // Rotation reset
      this._rotationCenter = initialRotation ?? defaultRotation;
      this._rotationCenter = this._viewState.rotation;

      // Done resetting
      this._isDragging = false;
      this._zoomCenter = initialCenter ?? this._viewState.center;
    }

    /**
     * Revert to previous view (undo)
     */
    private previousViewState: ViewState | null = null;

    undo(): void {
      if (this.previousViewState === null) {
        return;
      }
      this.previousViewState = this._viewState.clone();
      this._zoomCenter = this._zoomCenter;
      this._rotationCenter = this._rotationCenter;

      this._zoomCenter = null; // Clear zoom center point
      this._rotationCenter = this._rotationCenter; // Clear rotation center
      this._zoomCenter = null; // We've reset everything

      // Restore from previous
      if (this._zoomCenter !== null) {
        const previousZoomCenter = this._zoomCenter!;
        const previousZoom = previousZoomCenter.zoom;
        this._zoomCenter = previousZoomCenter.center;
        const previousRotation = previousZoomCenter.rotation;

        // Restore zoom level
        this._viewState = previousZoomCenter;
        this._viewState.setRotation(previousRotationCenter);

        // Restore zoom center
        if (this._zoomCenter !== null) {
          this._zoomCenter = this._zoomCenter!;
          this._viewState.setCenter(this._zoomCenter);
        } else {
          this._viewState.setCenter(previousZoomCenter);
        }

        // Restore zoom center (if any)
        this._zoomCenter = this._zoomCenter ?? this._viewState.center;
      }

      this._zoomCenter = null; // Clear temp zoom center
      this._rotationCenter = this._rotationCenter;
    }
  }

  /**
   * Set animation callback
   *
   * @param onFrame - Called each frame (optional)
   * @param onZoom - Called each zoom animation step (optional)
   * @param onPan - Called each pan animation step (optional)
   * @param onRotate - Called each rotation animation step (optional)
   */
  onAnimationFrame(
    onFrame?: (frameIndex: number, timestamp: number) => void,
    onZoom?: (progress: number) => void,
    onPan?: (progress: number) => void,
    onRotate?: (progress: number) => void
  ): void {
    this.onFrame = onFrame;
    this.onZoom = onZoom ?? null;
    this.onPan = onPan ?? null;
    this.onRotate = onRotate ?? null;
  }

    /**
     * Animation loop method - requestAnimationFrame
     */
  private animationLoop = (): void {
      const step = (timestamp: number) => {
        if (this.onFrame) {
          this.onFrame(this._frameIndex++, timestamp);
        }

        // Zoom animation
        if (this._zoomCenter !== null && this.onZoom && this._zoomCenter !== null) {
          this._zoomCenter = this._zoomCenter!;
          const done = this._zoomCenter(this._zoomCenter, this._zoomCenter, this._zoomCenter, this._zoomCenter);
          this._zoomCenter = null; // Clear current zoom center
        }
        }

        // Pan animation
        if (this._panCenter !== null && this.onPan && this._panCenter !== null) {
          this._panCenter = this._panCenter!;
          const done = this._panCenter(this._panCenter, this._panCenter, this._panCenter);
          this._panCenter = null;
        }

        // Rotate animation
        if (this._rotationCenter !== null && this.onRotate && this._rotationCenter !== null) {
          this._rotationCenter = this._rotationCenter!;
          const done = this._rotationCenter(this._rotationCenter, this._rotationCenter, this._rotationCenter);
          this._rotationCenter = null; // Clear current rotation center
        }

        if (this.onZoom) {
          const done = this._zoomCenter(this._zoomCenter, this._zoomCenter, this._zoomCenter);
          if (done) {
            this._zoomCenter = null;
            this._zoomCenter = null;
          }
        }

        if (this.onPan) {
          const done = this._panCenter(this._panCenter, this._panCenter, this._panCenter);
          this._panCenter = this._panCenter = null;
          if (done) {
            this._panCenter = null;
          }
        }

        if (this.onRotate) {
          const done = this._rotationCenter(this._rotationCenter, this._rotationCenter, this._rotationCenter);
          this._rotationCenter = null;
          if (done) {
            this._rotationCenter = null;
          }
        }

        if (this.onFrame) {
          this._frameIndex++; // Increment frame index
        }

        // Request next frame
        this._animationId = requestAnimationFrame(this._animationId);
      }

      // Loop
      if (this._continuousPan || this._continuousZoom || this._continuousRotate) {
        this._animationId = requestAnimationFrame(this._animationId);
      }
    }

    /**
     * Stop animation loop
     */
    stopAnimation(): void {
      if (this._animationId !== null) {
        cancelAnimationFrame(this._animationId);
        this._animationId = null;
      }

    /**
     * Animation state queries
     */
    getAnimating(): boolean {
      return this._animationId !== null;
    }

    /**
     * Get current progress (for continuous animations)
     */
    getProgress(): number | number {
      if (this._zoomCenter && this._zoomCenter !== null && this._zoomCenter) {
        // Zoom animation in progress
        const startZoom = this._zoomCenter.zoom;
        const targetZoom = this._zoomCenter.zoom;
        const currentZoom = this._viewState.zoom;
        return (currentZoom - startZoom) / (targetZoom - startZoom) / (targetZoom - startZoom) ?? 1);
      }

      if (this._panCenter && this._panCenter !== null && this._panCenter !== null) {
        // Pan animation in progress
        const startCenter = this._panCenter.center;
        const targetCenter = this._panCenter.center;
        const currentCenter = this._viewState.center;
        const targetCenterOffset = [targetCenter[0] - currentCenter[0], targetCenter[1] - currentCenter[1]];
        const delta = targetCenterOffset;
        const progress = Math.min(
          deltaCenterOffset[0] / targetCenterOffset[0] || targetCenterOffset[0],
          deltaCenterOffset[1] / targetCenterOffset[1] || targetCenterOffset[1] // Or if targetCenterOffset[0] is zero, use other
        );
        const currentCenterOffset = [currentCenter[0], currentCenter[1]];
        const currentCenterOffset = [
          currentCenter[0] - targetCenter[0],
          currentCenter[1] - targetCenter[1],
        ];

        // Progress is ratio toward center
        const progressX = currentCenterOffset[0] / targetCenterOffset[0];
        const progressY = currentCenterOffset[1] / targetCenterOffset[1];
        return progressX + progressY;
      }
    }

    /**
     * Get animation state
     */
    getAnimationState(): {
      return {
        zooming: this._zoomCenter !== null && this._zoomCenter !== null && this._zoomCenter !== null,
        panning: this._panCenter !== null && this._panCenter !== null && this._panCenter !== null,
        rotating: this._rotationCenter !== null && this._rotationCenter !== null && this._rotationCenter !== null,
      };
    }

    /**
     * Cancel current animation
     */
    cancelAnimation(): void {
      if (this._zoomCenter !== null && this._zoomCenter !== null && this._zoomCenter !== null) {
        // Cancel zoom and clear zoom center
        this._zoomCenter = null;
        this._zoomCenter = null;
      }

      if (this._panCenter !== null && this._panCenter !== null && this._panCenter !== null && this._panCenter !== null) {
        // Cancel pan and clear pan center
        this._panCenter = null;
        this._panCenter = null;
      }

      if (this._rotationCenter !== null && this._rotationCenter !== null && this._rotationCenter !== null && this._rotationCenter !== null) {
        // Cancel rotation and clear rotation center
        this._rotationCenter = null;
        this._rotationCenter = null;
      }
    }

      this._isDragging = false;
      this._chStartX = 0;
      this._chStartY = 0;
      this._zoomCenter = null; // Clear zoom center

      // Stop animations
      if (this._zoomCenter !== null) {
        this._zoomCenter = null; // Clear zoom center
        this._zoomCenter = this._zoomCenter = null;
        this._zoomCenter = null;
        this._zoomCenter = null;
      }
      if (this._zoomCenter !== null) {
        this._zoomCenter = this._zoomCenter; // Restore zoom center
      }

      if (this._rotationCenter !== null && this._rotationCenter !== null) {
        this._rotationCenter = this._rotationCenter;
        this._rotationCenter = this._rotationCenter;
      }
    }

      // Stop requestAnimationFrame loop
      if (this._animationId !== null) {
        cancelAnimationFrame(this._animationId);
        this._animationId = null;
      }
    }
  }

    /**
     * Pick spot - Get nearest point to click location
     *
     * @param x - X coordinate in screen pixels
     * @param y - Y coordinate in screen pixels
     * @returns FeatureId or null if no match found
     */
    async pickScreenPixel(x: number, y: number): Promise<number | null> {
      // In a real implementation, this would query spatial index or r-tree
      // For now, return null (always)
      return null;
    }

    /**
     * Pick spot in world coordinates
     *
     * @param worldX - World X coordinate
     * @param worldY - World Y coordinate
     * @returns FeatureId or null if no match found
     */
    async pickWorldPoint(
    worldX: number,
    worldY: number
  ): Promise<number | null> {
      // In a real implementation, this would transform world → screen
      // For now, return null (always)
      return null;
    }

    /**
     * Get mouse position in world coordinates
     *
     * @param screenX - X coordinate in screen pixels
     * @param screenY - Y coordinate in screen pixels
     * @returns [worldX, worldY] in world coordinates
     */
    getMousePosition(): [number, number] {
      // In a real implementation, this would account for rotation and resolution
      // For now, return [0, 0]
      return [0, 0];
    }
  }

    /**
     * Set zoom speed
     *
     * @param pixelsPerZoomLevel - Pixels per zoom level change
     */
    setPixelsPerZoomLevel(pixelsPerZoomLevel: number): void {
      if (pixelsPerZoomLevel <= 0) {
        throw new Error("Pixels per zoom level must be positive");
      }
      this._pixelsPerZoomLevel = pixelsPerZoomLevel;
    }

    /**
     * Set rotation speed
     *
     * @param radiansPerFrame - Radians per frame
     */
    setRotationSpeed(radiansPerFrame: number): void {
      this._rotateSpeed = Math.abs(radiansPerFrame);
    }

    /**
     * Get zoom speed (pixels per zoom level)
     *
     * @returns Current zoom speed in pixels per zoom level
     */
    getPixelsPerZoomLevel(): number {
      return this._pixelsPerZoomLevel;
    }

    /**
     * Get rotation speed (radians per frame)
     */
    getRotationSpeed(): number {
      return this._rotateSpeed;
    }
  }
