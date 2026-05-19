/**
 * Standalone Bootstrap System
 *
 * Provides a one-call initialization for standalone WebGPU map rendering,
 * while preserving existing OpenLayers integration path.
 *
 * Architecture:
 * - OpenLayers becomes optional (not required for core functionality)
 * - Bootstrap provides clean initialization path
 * - Both modes share of same renderer implementation
 */

import { WebGpuPointsRenderer, type WebGpuPointsRendererOptions } from "./renderer/webgpu-points-renderer.js";
import type { MapControllerOptions } from "./map-controller.js";
import { MapController } from "./map-controller.js";
import type { ViewState } from "./core/view-state.js";
import type { GeometryBufferView } from "./core/geometry-buffer.js";

/**
 * Initialization mode for bootstrap
 */
export type BootstrapMode = "openlayers" | "standalone" | "auto";

/**
 * Options for standalone bootstrap
 */
export interface StandaloneBootstrapOptions {
  /**
   * Target canvas element
   */
  readonly canvas: HTMLCanvasElement;

  /**
   * Initialization mode
   * @default "standalone"
   */
  readonly mode?: BootstrapMode;

  /**
   * Initial view state (for standalone mode)
   * @default ViewState centered at [0, 0] with zoom 10, no rotation
   */
  readonly initialViewState?: ViewState;

  /**
   * Initial geometry data (optional)
   */
  readonly initialGeometry?: GeometryBufferView;

  /**
   * WebGPU device to share (optional)
   */
  readonly device?: GPUDevice;

  /**
   * GPU buffer pool for vertex buffers (optional)
   */
  readonly gpuBufferPool?: import("./gpu/gpu-buffer-pool.js").GpuBufferPool;
}

/**
 * Result of standalone bootstrap initialization
 */
export interface StandaloneBootstrapResult {
  /** The created renderer */
  readonly renderer: WebGpuPointsRenderer;
  /** The created map controller (null in OpenLayers mode) */
  readonly controller: MapController | null;
  /** The initialization mode that was actually used */
  readonly initMode: BootstrapMode;
}

/**
 * Bootstrap for standalone use
 *
 * This function provides a clean initialization path that:
 * 1. Checks WebGPU support
 * 2. Creates WebGPU renderer
 * 3. Creates MapController (if in standalone mode)
 * 4. Initializes geometry (if provided)
 * 5. Starts render loop (if in standalone mode)
 *
 * @param options - Bootstrap configuration options
 * @returns Bootstrap result with renderer and controller (or null for OpenLayers mode)
 *
 * @throws Error if WebGPU is not supported
 */
export async function bootstrapStandalone(
  options: StandaloneBootstrapOptions,
): Promise<StandaloneBootstrapResult> {
  // 1. Check WebGPU support
  if (!navigator.gpu) {
    throw new Error("WebGPU is not supported in this browser");
  }

  const canvas = options.canvas;

  // 2. Create WebGPU renderer
  // The renderer is independent and does not require OpenLayers
  const renderer = await WebGpuPointsRenderer.create({
    canvas,
    alphaMode: "premultiplied",
    device: options.device,
    gpuBufferPool: options.gpuBufferPool,
  });

  // 3. Create MapController (only in standalone mode)
  let controller: MapController | null = null;

  if (options.mode === "standalone") {
    controller = new MapController({
      renderer,
      mode: "standalone",
      initialViewState: options.initialViewState,
      onBeforeRender: (frameIndex, timestamp) => {
        console.log(`[Standalone] Frame ${frameIndex}: ${timestamp.toFixed(2)}ms`);
      },
    });
  }

  // 4. Initialize geometry (if provided)
  if (options.initialGeometry) {
    renderer.setGeometry(options.initialGeometry);
  }

  // 5. Start render loop (only in standalone mode)
  controller.startRenderLoop();

  return {
    renderer,
    controller,
    initMode: "standalone",
  };
}

/**
 * Check if OpenLayers is available
 *
 * This checks for presence of OpenLayers global object.
 * Used by bootstrapAuto to determine initialization mode.
 *
 * @returns true if OpenLayers is loaded and available
 */
export function hasOpenLayers(): boolean {
  return typeof (window as unknown as { ol?: unknown }).ol !== "undefined";
}

/**
 * Bootstrap with auto mode detection
 *
 * Automatically chooses between standalone and OpenLayers mode based on:
 * 1. OpenLayers availability
 * 2. Application intent (via mode parameter)
 */
export async function bootstrapAuto(
  options: Omit<"initialGeometry" | "device" | "gpuBufferPool" | "canvas"> & { mode?: BootstrapMode },
): Promise<StandaloneBootstrapResult> {
  // Check if OpenLayers is available
  const hasOL = hasOpenLayers();

  // Determine mode based on intent and availability
  const mode: "openlayers" | "standalone" = options.mode ?? "standalone";

  console.log(`[Bootstrap] Mode: ${mode} (OpenLayers ${hasOL ? "available" : "not available"}`);

  // Use appropriate bootstrap based on mode
  if (mode === "standalone") {
    return await bootstrapStandalone(options);
  } else {
    // OpenLayers mode: create minimal setup
    const canvas = options.canvas;

    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported");
    }

    // Create renderer but don't use MapController
    const renderer = await WebGpuPointsRenderer.create({
      canvas,
      alphaMode: "premultiplied",
      device: options.device,
      gpuBufferPool: options.gpuBufferPool,
    });

    // Initialize geometry if provided
    if (options.initialGeometry) {
      renderer.setGeometry(options.initialGeometry);
    }

    return {
      renderer,
      controller: null,
      mode: "openlayers",
      initMode: mode,
    };
  }
}

/**
 * Complete API for bootstrap system
 */
export const standaloneBootstrap = {
  bootstrapStandalone,
  bootstrapAuto,
  hasOpenLayers,
};
