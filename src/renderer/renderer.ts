import type { GeometryBufferView } from "../core/geometry-buffer.js";

/**
 * Minimal frame description; renderer fills in timing/projection later.
 */
export interface RenderFrame {
  readonly timeMs: number;
}

/**
 * Renderer owns GPU resources and draw submission only.
 * It consumes `GeometryBufferView` and must not depend on GeoJSON, WKB, or OL `Feature`.
 */
export interface Renderer {
  /** Apply or replace GPU-resident geometry for the current batch (exact policy TBD). */
  setGeometry(view: GeometryBufferView): void;
  /** Record a frame (no-op until WebGPU is wired). */
  render(frame: RenderFrame): void;
  release(): void;
}
