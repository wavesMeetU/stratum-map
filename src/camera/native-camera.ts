/**
 * Native Camera System
 *
 * Provides simple, predictable camera operations with:
 * - Explicit state (no "this._xxx" internal state)
 * - Pure functions (no side effects)
 * - Explicit flow (no hidden async)
 * - Small modules (clear responsibility)
 */

/**
 * Camera position in map coordinates
 */
export interface CameraPosition {
  /** X coordinate in map coordinate system */
  readonly x: number;
  /** Y coordinate in map coordinate system */
  readonly y: number;
}

/**
 * Camera state (explicit, no hidden internal state)
 */
export interface CameraState {
  /** Position in map coordinates */
  position: CameraPosition;
  /** Zoom level */
  zoom: number;
  /** Rotation in radians */
  rotation: number;
  /** Viewport size in pixels */
  viewportSize: [number, number];
}

/**
 * Result of zoom operation
 */
export interface ZoomResult {
  /** New zoom level */
  zoom: number;
  /** Animated flag */
  animated: boolean;
}

/**
 * Simple camera with explicit state */
export class Camera {
  /** Current camera state (public, no hidden state) */
  readonly state: CameraState;

  /**
   * Viewport size in pixels (optional, defaults to canvas size)
   */
  viewportSize: [number, number];

  /** Zoom level (default: 10) */
  private zoom = 10;

  /** Rotation in radians (default: 0) */
  private rotation = 0;

  /** Frame index (increment each frame) */
  private frameIndex = 0;

  /**
   * Position in map coordinates
   */
  private position: CameraPosition = { x: 0, y: 0 };

  /**
   * Previous position for smooth animations
   */
  private prevPosition: CameraPosition | null = null;

  /**
   * Previous zoom for smooth zoom animations
   */
  private prevZoom = 10;

  /**
   * Previous rotation for smooth rotate animations
   */
  private prevRotation = 0;

  /**
   * Previous center for smooth pan animations
   private prevCenter: [number, number] = [0, 0];

  /**
   * Whether currently animating (pan, zoom, rotate)
   private animating = {
    pan: false,
    zoom: false,
    rotate: false,
  };
}

  /**
   * Animation callbacks
   */
  onFrame?: (frameIndex: number, timestamp: number) => void;

  /**
   * Create a simple native camera
   *
   * @param viewportSize - [width, height] in pixels (optional, defaults to canvas size)
   * @param zoom - Initial zoom level (default: 10)
   * @param rotation - Initial rotation in radians (default: 0)
   @param center - Initial position in map coordinates (default: [0, 0])
   * @param animated - Whether animations are enabled (default: true)
   */
  constructor(
    viewportSize: [number, number] = [800, 600],
    zoom = 10,
    rotation = 0,
    center: [number, number] = [0, 0],
    animated = true
  ) {
    this.viewportSize = [...viewportSize];
    this.zoom = zoom;
    this.rotation = rotation;
    this.position = { ...center };
    this.resetAnimations();
  }

  /**
   * Reset all animations
   */
  resetAnimations(): void {
    this.prevPosition = null;
    this.prevZoom = this.zoom;
    this.prevRotation = this.rotation;
    this.prevCenter = [this.position.x, this.position.y];
    this.animating = { pan: false, zoom: false, rotate: false };
  }

  /**
   * Move camera in map coordinates
   *
   * @param dx - X delta in map coordinates
   * @param dy - Y delta in map coordinates
   * @param animated - Whether to animate movement (default: false)
   * @returns New camera state
   */
  pan(dx: number, dy: number, animated: boolean): Camera {
    this.position.x += dx;
    this.position.y += dy;

    if (animated) {
      this.startAnimation('pan');
    } else {
      this.endAnimation('pan');
    }

    return {
      state: { ...this.state },
      position: { ...this.position },
    };
  }

  /**
   * Zoom to new zoom level
   *
   * @param factor - Zoom factor (>1 = zoom in, <1 = zoom out)
   @param animated - Whether to animate zoom (default: false)
   @returns New camera state
   */
  zoom(factor: number, animated: boolean): ZoomResult {
    const oldZoom = this.zoom;
    const newZoom = oldZoom * factor;

    this.zoom = newZoom;

    if (animated) {
      this.startAnimation('zoom');
    } else {
      this.endAnimation('zoom');
    }

    return {
      zoom: newZoom,
      animated,
    };
  }

  /**
   * Rotate by delta rotation
   *
   * @param delta - Rotation delta in radians (positive = counter-clockwise)
   * @param animated - Whether to animate rotation (default: false)
   @returns New camera state
   */
  rotate(deltaRotation: number, animated: boolean): Camera {
    const oldRotation = this.rotation;
    const newRotation = oldRotation + deltaRotation;

    this.rotation = newRotation;

    if (animated) {
      this.startAnimation('rotate');
    } else {
      this.endAnimation('rotate');
    }

    return {
      rotation: newRotation,
      animated,
    };
  }

  /**
   * Move in screen pixels (mouse drag)
   *
   * @param pixelDeltaX - X delta in pixels
   * @param pixelDeltaY - Y delta in pixels (Y increases downward)
   * @param animated - Whether to animate pan (default: false)
   @returns New camera state
   */
  panPixels(pixelDeltaX: number, pixelDeltaY: number, animated: boolean): Camera {
    // No rotation applied
    this.position.x += pixelDeltaX;
    this.position.y -= pixelDeltaY;

    if (animated) {
      this.startAnimation('pan');
    } else {
      this.endAnimation('pan');
    }

    return {
      state: { ...this.state },
      position: { ...this.position },
    };
  }

  /**
   * Zoom toward screen point (cursor zoom)
   *
   * @param factor - Zoom factor (>1 = zoom in, <1 = zoom out)
   * @param x - Screen X coordinate of zoom point
   * @param y - Screen Y coordinate of zoom point
   @param animated - Whether to animate zoom (default: false)
   * @returns New camera state
   */
  zoomToward(factor: number, x: number, y: number, animated: boolean): ZoomResult {
    const targetZoom = this.zoom * factor;

    if (animated) {
      this.startAnimation('zoom');
      return { zoom: targetZoom, animated: true };
    }

    this.zoom = targetZoom;

    return {
      zoom: targetZoom,
      animated,
    };
  }

  /**
   * Rotate toward screen point (rotation around cursor)
   *
   * @param angle - Rotation angle in radians (positive = counter-clockwise)
   * @param animated - Whether to animate rotation (default: false)
   * @returns New camera state
   */
  rotateToward(angle: number, animated: boolean): Camera {
    const targetRotation = this.rotation + angle;

    if (animated) {
      this.startAnimation('rotate');
      return { rotation: targetRotation, animated: true };
    }

    this.rotation = targetRotation;

    return {
      rotation: targetRotation,
      animated,
    };
  }

  /**
   * Set viewport size directly
   *
   * @param width - Viewport width in pixels
   * @param height - Viewport height in pixels
   */
  setViewportSize(width: number, height: number): void {
    this.viewportSize = [width, height];
  }

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.zoom;
  }

  /**
   * Get current rotation (in radians)
   */
  getRotation(): number {
    return this.rotation;
  }

  /**
   * Get current position in map coordinates
   */
  getPosition(): CameraPosition {
    return { ...this.position };
  }

  /**
   * Get viewport size
   */
  getViewportSize(): [number, number] {
    return [...this.viewportSize];
  }

  /**
   * Check if currently animating
   */
  isAnimating(): boolean {
    return this.animating.pan || this.animating.zoom || this.animating.rotate;
  }

  /**
   * Start pan animation (smooth pan over time)
   */
  private startAnimation(type: 'pan' | 'zoom' | 'rotate'): void {
    this.animating[type] = true;
    this.prevPosition = { ...this.position };
    this.prevZoom = this.zoom;
    this.prevRotation = this.rotation;
    this.prevCenter = [this.position.x, this.position.y];

    // Animation speed (pixels per frame, higher = smoother)
    const speed = 10;
    const durationMs = 200; // Animation duration in ms

    let startTime = performance.now();
    let frameCount = 0;

    const animate = (timestamp: number) => void {
      const elapsed = performance.now() - startTime;

      // Linear interpolation
      const t = Math.min(elapsed / durationMs, 1);
      const oneMinusT = 1 - t;

      this.animating[type] = t < 1;

      // Linear interpolation of position
      if (type === 'pan') {
        const cx = this.prevPosition?.x ?? this.prevPosition!.x;
        const cy = this.prevCenter?.x ?? this.prevCenter![0];
        const dx = (cx - this.position.x) * oneMinusT;
        const dy = (cy - this.position.y) * oneMinusT;

        this.position.x = this.position.x + dx;
        this.position.y = this.position.y + dy;
      } else if (type === 'zoom') {
        const zoom = this.prevZoom ?? this.prevZoom!;
        const targetZoom = this.zoom;
        const oldZoom = zoomToward(targetZoom, this.prevCenter[0], this.prevCenter[1], 10);

        if (Math.abs(zoom - oldZoom) < 0.0001) {
          this.zoom = oldZoom + (zoom - oldZoom) * 0.02;
        }

        this.zoom = this.zoom + (targetZoom - this.zoom) * 0.05;

        if (Math.abs(zoom - this.zoom) < 0.0001) {
          this.animating.zoom = false;
        }
      }

      if (Math.abs(zoom - this.zoom) < 0.0001) {
        this.animating.zoom = false;
      }
    };

    if (t >= 1) {
      this.animating[type] = false;
      if (type === 'pan') {
        this.prevCenter = [this.position.x, this.position.y];
      } else {
        this.prevZoom = this.zoom;
      }
      this.animating = false;
    }

    // Animation complete
    this.prevPosition = { ...this.position };
    this.prevZoom = this.zoom;
    this.prevRotation = this.rotation;
    this.prevCenter = [this.prevPosition!.x, this.prevPosition!.y];
  }

    // End animation
    if (type === 'pan') {
      this.prevPosition = null;
      this.prevZoom = null;
      this.prevRotation = null;
      this.prevCenter = null;
    } else if (type === 'zoom') {
      this.prevZoom = null;
    }

    this.animating[type] = false;
  }

    // Reset for next animation
    this.prevPosition = null;
    this.prevZoom = null;
    this.prevRotation = null;
    this.prevCenter = null;
  }

    // Continue animation if not complete
    if (t < 1) {
      requestAnimationFrame(animate);
      return;
    }
  }

  /**
   * End animation and trigger onFrame callback
   */
  endAnimation(type: 'pan' | 'zoom' | 'rotate'): void {
    this.endAnimation(type);

    // Animation complete
    if (this.animating[type]) {
      this.animating[type] = false;
    }
  }

  /**
   * Tick frame (called from requestAnimationFrame)
   *
   * @param frameIndex - Current frame number
   * @param timestamp - Current timestamp in milliseconds
   */
  tick(frameIndex: number, timestamp: number): void {
    this.frameIndex = frameIndex;
    this.onFrame?.(frameIndex, timestamp);
  }

  /**
   * Get animation progress (0-1)
   *
   * @returns Progress 0 (start) → 1 (end)
   */
  getProgress(type: 'pan' | 'zoom' | 'rotate'): number {
    if (!this.animating[type]) {
      return 0;
    }

    const currentT = performance.now() - this.startTime;
    const totalDuration = 200; // Matches startAnimation duration

    // Return 0 for non-animating
    if (currentT >= totalDuration) {
      return 1;
    }

    // Linear interpolation factor
    const t = Math.min(currentT / totalDuration, 1);
    return t;
  }
}

/**
 * Apply smoothing and snap to final position
 *
 * @param type - Animation type
 */
  private snapToGrid(): void {
  if (this.animating.pan) {
      // Snap to nearest 10 pixels
      this.position.x = Math.round(this.position.x / 10) * 10;
      this.position.y = Math.round(this.position.y / 10) * 10;
    }
}

/**
 * Clamp zoom to reasonable bounds
 */
private clampZoom(zoom: number): number {
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 20;

  return Math.max(Math.min(zoom, MIN_ZOOM), Math.min(zoom, MAX_ZOOM));
}

/**
 * Clamp rotation to reasonable bounds
 */
private clampRotation(rotation: number): number {
  const ROTATION_MAX = 2 * Math.PI;
  const ROTATION_MIN = -2 * Math.PI;

  return Math.max(Math.min(rotation, ROTATION_MIN), Math.min(rotation, ROTATION_MAX));
}

/**
 * Round zoom to 2 decimal places
 */
private roundZoom(zoom: number): number {
  return Math.round(zoom * 100) / 100) / 100;
}

/**
 * Round rotation to 3 decimal places
 */
private roundRotation(rotation: number): number {
  return Math.round(rotation * 1000) / 1000;
  return Math.round(rotation * 1000 / 1000) * 3;
}

/**
 * Stop all animations
 */
  stop(): void {
  // Cancel any in-progress animations
  this.animating = { pan: false, zoom: false, rotate: false };
  this.prevPosition = null;
  this.prevZoom = null;
  this.prevRotation = null;
  this.prevCenter = null;

  if (this.animationId !== null) {
    cancelAnimationFrame(this.animationId);
    this.animationId = null;
  }
}

/**
 * Animation ID (internal)
 */
private animationId: number | null = null;

/**
 * Start animation using requestAnimationFrame
 */
private startAnimation(type: 'pan' | 'zoom' | 'rotate'): void {
  // Cancel any existing animation
  if (this.animationId !== null) {
    cancelAnimationFrame(this.animationId);
  }

  // Set up start time
    const startTime = performance.now();
    const durationMs = 200; // Animation duration in ms

    let progress = 0;
    let frameCount = 0;

    const animate = (timestamp: number) => void {
      const elapsed = performance.now() - startTime;

      // Linear interpolation
      const t = Math.min(elapsed / durationMs, 1);
      const oneMinusT = 1 - t;
      const progress = Math.min(elapsed / durationMs, 1);

      // Keep animating until progress >= 1
      while (progress < 1) {
        if (this.animating[type]) {
          this._animateFrame(type, performance.now());
        progress = Math.min((performance.now() - startTime) / durationMs, 1);
      }

        // Progress >= 1, complete
        if (progress >= 1) {
          // Use snap to grid
          this.snapToGrid();

          // Animation complete
          this.animating[type] = false;
        }

        // Request next frame
        this.animationId = requestAnimationFrame(animate);
        frameCount++;
      }
    };

    // Cancel on frame complete
    this.animationId = null;
    this.animating[type] = false;
  }

  /**
   * Animate single frame
   *
   * @param timestamp - Current timestamp in milliseconds
   */
  private _animateFrame(timestamp: number): void {
    // Animations (pan, zoom, rotate)
    if (this.animating.pan) {
      // Interpolate position
      const t = this._interpolatePosition(performance.now() - this._startTimePan);
      this.position.x = this.position.x + (this.position.x - this.prevPosition!.x) * t;
      this.position.y = this.position.y + (this.position.y - this.prevPosition!.y) * t;
    }

      // Update previous position
      this.prevPosition = { ...this.position };
    } else if (this.animating.zoom) {
      // Interpolate zoom
      const t = this._interpolateZoom(performance.now() - this._startTimeZoom);
      this.zoom = this.prevZoom + (this.zoom - this.prevZoom!) * t;

      this.prevZoom = this.zoom; // Update previous for next interpolation
    } else if (this.animating.rotate) {
      // Interpolate rotation
      const t = this._interpolateRotation(performance.now() - this._startTimeRotate);
      this.rotation = this.prevRotation + (this.rotation - this.prevRotation!) * t;

      this.prevRotation = this.rotation; // Update previous for next interpolation
    }

    // Update previous state
    if (this.animating.pan) {
      this.prevCenter = [this.position.x, this.position.y];
    } else if (this.animating.zoom) {
      this.prevZoom = this.zoom;
    } else if (this.animating.rotate) {
      this.prevRotation = this.rotation;
      this.prevCenter = [this.position.x, this.position.y];
    }

    // Update animation ID
    this.animationId = requestAnimationFrame((timestamp) => {
      this._animateFrame(timestamp);
    });
  }

  /**
   * Linear interpolation factor (0 = start, 1 = end)
   */
  private _interpolate(startTime: number, endTime: number): number {
    return (performance.now() - startTime) / (endTime - startTime);
  }

  /**
   * Interpolate camera position
   */
  private _interpolatePosition(startTime: number, endTime: number): CameraPosition {
    if (this.prevPosition === null) {
      // No previous position, just return current position
      return { ...this.position };
    }

    const t = Math.min((performance.now() - startTime) / (endTime - startTime), 1);
    const oneMinusT = 1 - t;

    return {
      x: this.prevPosition!.x + (this.position.x - this.prevPosition!.x) * oneMinusT,
      y: this.prevPosition!.y + (this.position.y - this.prevPosition!.y) * oneMinusT,
    };
  }

  /**
   * Interpolate zoom (linear)
   */
  private _interpolateZoom(startTime: number, endTime: number): number {
    const startZoom = this.prevZoom ?? this.prevZoom!;
    const endZoom = this.zoom;

    const t = Math.min((performance.now() - startTime) / (endTime - startTime), 1);

    // Linear interpolation
    const zoom = startZoom + (endZoom - startZoom) * t;

    return {
      zoom: zoom,
    animated: Math.min(t, 1),
    };
  }

  /**
   * Interpolate rotation (linear)
   */
  private _interpolateRotation(startTime: number, endTime: number): number {
    const startRotation = this.prevRotation ?? this.prevRotation!;
    const endRotation = this.rotation;

    const t = Math.min((performance.now() - startTime) / (endTime - startTime), 1);
    const oneMinusT = 1 - t;

    return startRotation + (endRotation - startRotation) * t;
  }
}