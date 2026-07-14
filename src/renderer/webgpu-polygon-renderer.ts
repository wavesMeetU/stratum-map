import type { ViewState } from "../core/view-state.js";
import { GpuBufferPool } from "../gpu/gpu-buffer-pool.js";
import { GpuPolygonChunkSlot } from "../gpu/gpu-polygon-chunk-slot.js";
import type { PreparedPolygonGeometry } from "../gpu/polygon-triangulation.js";
import type { GeoJsonWorkerChunkMessage } from "../parser/geojson-worker-messages.js";
import { decodeFeatureIdFromRgba8Bytes } from "../picking/id-pack.js";
import { PICK_POLYGON_UNIFORM_BYTE_LENGTH, PICK_POLYGONS_WGSL } from "../picking/pick-polygons-wgsl.js";
import type { RenderFrame } from "./renderer.js";
import { DEFAULT_POLYGON_STYLE, MAX_POLYGON_STYLES, type PolygonStyle } from "./polygon-style.js";
import { FRAME_UNIFORM_BYTE_LENGTH, POLYGONS_WGSL } from "./polygons-wgsl.js";

export interface WebGpuPolygonRendererOptions {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  /**
   * Used only to size the offscreen pick texture (`canvas.width`/`canvas.height`). This
   * renderer never calls `canvas.getContext("webgpu")` or opens its own swapchain render
   * pass — same precedent as `WebGpuLineRenderer` (Stage 6.2/6.3): it composes into a pass
   * a caller already opened (`encodeRenderPass`).
   */
  readonly canvas: HTMLCanvasElement;
  readonly styles?: readonly PolygonStyle[];
}

export interface IngestPolygonChunkOptions {
  /** Stable id for this GPU chunk. Omit to append an anonymous, non-replaceable chunk. */
  readonly chunkKey?: string;
}

export interface PolygonRendererStats {
  readonly totalTriangles: number;
  readonly chunkCount: number;
  readonly residentBytes: number;
  readonly drawCalls: number;
}

/**
 * Independent WebGPU polygon renderer (Stage 6.6): consumes Stage 6.5's worker-side
 * triangulated `PreparedPolygonGeometry` directly — no triangulation, no projection logic
 * here. Own chunk residency/LRU/byte bookkeeping (mirrors `WebGpuLineRenderer`'s pattern
 * conceptually, implemented independently — no shared base class, no
 * `ChunkedGeometryController` coupling) and its own offscreen pick pass reusing the
 * `FeatureId -> fid+1 -> RGBA8 -> uint32` convention verbatim.
 *
 * `WebGpuPointsRenderer` and `WebGpuLineRenderer` are unmodified and have no awareness of
 * this class.
 *
 * Renders `Polygon` (including holes) via the prepared geometry Stage 6.5 already
 * triangulates correctly. `MultiPolygon` preparation is preserved and triangulated by
 * Stage 6.5, but is not exercised as a public rendering milestone here (Stage 6.6 scope).
 */
export class WebGpuPolygonRenderer {
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly canvas: HTMLCanvasElement;
  private readonly pipeline: GPURenderPipeline;
  private readonly frameUniformBuffer: GPUBuffer;
  private readonly styleStorageBuffer: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;

  private readonly frameUniformStaging = new ArrayBuffer(FRAME_UNIFORM_BYTE_LENGTH);
  private readonly frameF32 = new Float32Array(this.frameUniformStaging, 0, 16);
  private readonly frameU32 = new Uint32Array(this.frameUniformStaging, 64, 4);

  private styles: PolygonStyle[] = [];

  private readonly chunks = new Map<string, GpuPolygonChunkSlot>();
  /** Stable draw order (first draw wins for overlaps); mirrors the point/line renderers' own list. */
  private readonly drawOrder: string[] = [];
  /** Front = least recently touched (eviction candidate). */
  private readonly lruOrder: string[] = [];
  private residentBytes = 0;
  private nextAnonChunkKey = 0;
  gpuBufferPool: GpuBufferPool | null = null;

  private pickPipeline: GPURenderPipeline | null = null;
  private pickBindGroup: GPUBindGroup | null = null;
  private pickUniformBuffer: GPUBuffer | null = null;
  private pickTexture: GPUTexture | null = null;
  private pickTextureView: GPUTextureView | null = null;
  private readbackBuffer: GPUBuffer | null = null;
  private pickTexW = 0;
  private pickTexH = 0;
  private pendingPickPromise: Promise<number | null> | null = null;

  private constructor(
    device: GPUDevice,
    format: GPUTextureFormat,
    canvas: HTMLCanvasElement,
    pipeline: GPURenderPipeline,
    frameUniformBuffer: GPUBuffer,
    styleStorageBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
    initialStyles: readonly PolygonStyle[],
  ) {
    this.device = device;
    this.format = format;
    this.canvas = canvas;
    this.pipeline = pipeline;
    this.frameUniformBuffer = frameUniformBuffer;
    this.styleStorageBuffer = styleStorageBuffer;
    this.bindGroup = bindGroup;
    this.setStyleTable(initialStyles.length > 0 ? initialStyles : [DEFAULT_POLYGON_STYLE]);
  }

  static async create(options: WebGpuPolygonRendererOptions): Promise<WebGpuPolygonRenderer> {
    const { device, format, canvas } = options;
    const pipeline = WebGpuPolygonRenderer.createPipeline(device, format);

    const frameUniformBuffer = device.createBuffer({
      size: FRAME_UNIFORM_BYTE_LENGTH,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const styleStorageBuffer = device.createBuffer({
      size: MAX_POLYGON_STYLES * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuffer } },
        { binding: 1, resource: { buffer: styleStorageBuffer } },
      ],
    });

    return new WebGpuPolygonRenderer(
      device,
      format,
      canvas,
      pipeline,
      frameUniformBuffer,
      styleStorageBuffer,
      bindGroup,
      options.styles ?? [DEFAULT_POLYGON_STYLE],
    );
  }

  private static createPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const module = device.createShaderModule({ code: POLYGONS_WGSL });
    return device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 8,
            stepMode: "vertex",
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
          },
          {
            arrayStride: 4,
            stepMode: "vertex",
            attributes: [{ shaderLocation: 1, offset: 0, format: "uint16" }],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  getDevice(): GPUDevice {
    return this.device;
  }

  getCanvasFormat(): GPUTextureFormat {
    return this.format;
  }

  setStyleTable(styles: readonly PolygonStyle[]): void {
    if (styles.length === 0) {
      throw new Error("At least one style is required");
    }
    if (styles.length > MAX_POLYGON_STYLES) {
      throw new Error(`At most ${MAX_POLYGON_STYLES} styles`);
    }
    this.styles = styles.map((s) => ({ ...s, color: [...s.color] as [number, number, number, number] }));

    const f32 = new Float32Array(MAX_POLYGON_STYLES * 4);
    for (let i = 0; i < this.styles.length; i++) {
      const s = this.styles[i]!;
      const o = i * 4;
      f32[o + 0] = s.color[0];
      f32[o + 1] = s.color[1];
      f32[o + 2] = s.color[2];
      f32[o + 3] = s.color[3];
    }
    this.device.queue.writeBuffer(this.styleStorageBuffer, 0, f32.buffer, 0, this.styles.length * 16);
  }

  // ── chunk residency ──────────────────────────────────────────────────────

  /**
   * Uploads one `PreparedPolygonGeometry` as a new or replacing GPU chunk. Same-key ingest
   * destroys the prior slot for that key exactly once before constructing the new one
   * (mirrors `WebGpuLineRenderer.ingestLineSegments`'s replace semantics — byte accounting
   * always subtracts the old chunk's size before adding the new one, so replacement never
   * double-counts). `vertexCount === 0` removes the chunk for that key.
   */
  ingestPolygonGeometry(geom: PreparedPolygonGeometry, options?: IngestPolygonChunkOptions): void {
    const key = options?.chunkKey ?? `__anon:${this.nextAnonChunkKey++}`;
    const existing = this.chunks.get(key);
    const pool = this.gpuBufferPool ?? undefined;

    if (geom.vertexCount === 0) {
      if (existing !== undefined) {
        existing.destroy(pool);
        this.residentBytes -= WebGpuPolygonRenderer.chunkByteSize(existing);
        this.chunks.delete(key);
        this.spliceKeyFromOrders(key);
      }
      return;
    }

    if (existing !== undefined) {
      existing.destroy(pool);
      this.residentBytes -= WebGpuPolygonRenderer.chunkByteSize(existing);
    }

    const slot = new GpuPolygonChunkSlot(this.device, geom, pool);
    this.chunks.set(key, slot);
    this.residentBytes += WebGpuPolygonRenderer.chunkByteSize(slot);
    if (existing === undefined) {
      this.drawOrder.push(key);
    }
    this.touchLru(key);
  }

  /**
   * Convenience wrapper over `ingestPolygonGeometry`: extracts the polygon-prepared fields
   * already present on a worker chunk message (Stage 6.5) — `polygonPositions`,
   * `polygonFeatureIds`, `polygonStyleIds`, `polygonIndices`, `polygonVertexCount`,
   * `polygonIndexCount` — without re-deriving or reshaping anything. Does not read
   * `msg.positions`/`msg.featureIds`/`msg.styleIds`/`msg.vertexCount` (the point/line
   * portion of the chunk); those are consumed by `WebGpuPointsRenderer`/`WebGpuLineRenderer`
   * independently, unaware of this call.
   */
  ingestTransferredWorkerPolygonChunk(
    msg: GeoJsonWorkerChunkMessage,
    options?: IngestPolygonChunkOptions,
  ): void {
    const geom: PreparedPolygonGeometry = {
      vertexCount: msg.polygonVertexCount,
      indexCount: msg.polygonIndexCount,
      positions: new Float32Array(msg.polygonPositions, 0, msg.polygonVertexCount * 2),
      featureIds: new Uint32Array(msg.polygonFeatureIds, 0, msg.polygonVertexCount),
      styleIds: new Uint16Array(msg.polygonStyleIds, 0, msg.polygonVertexCount),
      indices: new Uint32Array(msg.polygonIndices, 0, msg.polygonIndexCount),
    };
    this.ingestPolygonGeometry(geom, options);
  }

  removeChunkByKey(chunkKey: string): boolean {
    const slot = this.chunks.get(chunkKey);
    if (slot === undefined) {
      return false;
    }
    slot.destroy(this.gpuBufferPool ?? undefined);
    this.residentBytes -= WebGpuPolygonRenderer.chunkByteSize(slot);
    this.chunks.delete(chunkKey);
    this.spliceKeyFromOrders(chunkKey);
    return true;
  }

  evictOldestChunk(): string | undefined {
    while (this.lruOrder.length > 0) {
      const key = this.lruOrder.shift()!;
      if (!this.chunks.has(key)) {
        continue;
      }
      this.removeChunkByKey(key);
      return key;
    }
    return undefined;
  }

  /** Repeatedly evicts LRU chunks until `count` removals or the set is empty. */
  evictOldestChunks(count: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const k = this.evictOldestChunk();
      if (k === undefined) {
        break;
      }
      out.push(k);
    }
    return out;
  }

  clearChunks(): void {
    const pool = this.gpuBufferPool ?? undefined;
    for (const c of this.chunks.values()) {
      c.destroy(pool);
    }
    this.chunks.clear();
    this.drawOrder.length = 0;
    this.lruOrder.length = 0;
    this.residentBytes = 0;
  }

  getChunkCount(): number {
    return this.chunks.size;
  }

  getChunkKeys(): readonly string[] {
    return [...this.drawOrder];
  }

  getResidentBytes(): number {
    return this.residentBytes;
  }

  getChunkByteSize(chunkKey: string): number {
    const slot = this.chunks.get(chunkKey);
    return slot === undefined ? 0 : WebGpuPolygonRenderer.chunkByteSize(slot);
  }

  getStats(): PolygonRendererStats {
    let totalTriangles = 0;
    for (const c of this.chunks.values()) {
      totalTriangles += c.indexCount / 3;
    }
    return {
      totalTriangles,
      chunkCount: this.chunks.size,
      residentBytes: this.residentBytes,
      drawCalls: this.drawOrder.length,
    };
  }

  private static chunkByteSize(slot: GpuPolygonChunkSlot): number {
    return (
      slot.positionBuffer.size +
      slot.featureIdBuffer.size +
      slot.styleIdBuffer.size +
      slot.indexBuffer.size
    );
  }

  private touchLru(key: string): void {
    const i = this.lruOrder.indexOf(key);
    if (i >= 0) {
      this.lruOrder.splice(i, 1);
    }
    this.lruOrder.push(key);
  }

  private spliceKeyFromOrders(key: string): void {
    const di = this.drawOrder.indexOf(key);
    if (di >= 0) {
      this.drawOrder.splice(di, 1);
    }
    const li = this.lruOrder.indexOf(key);
    if (li >= 0) {
      this.lruOrder.splice(li, 1);
    }
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  /**
   * Records polygon draws into an existing render pass (same load/store as caller) —
   * stateless per frame: `viewState` is taken as a parameter, not cached, so this renderer
   * never holds camera state of its own (ViewState remains the single source of truth).
   */
  encodeRenderPass(pass: GPURenderPassEncoder, viewState: ViewState, frame: RenderFrame): void {
    const clipMatrix = viewState.getClipMatrix();
    this.frameF32.set(clipMatrix);
    this.frameU32[0] = this.styles.length;
    this.frameU32[1] = 0;
    this.frameU32[2] = 0;
    this.frameU32[3] = 0;
    this.device.queue.writeBuffer(this.frameUniformBuffer, 0, this.frameUniformStaging);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    for (const key of this.drawOrder) {
      const chunk = this.chunks.get(key);
      if (chunk === undefined || chunk.indexCount <= 0) {
        continue;
      }
      pass.setVertexBuffer(0, chunk.positionBuffer, 0, chunk.vertexCount * 8);
      pass.setVertexBuffer(1, chunk.styleIdBuffer, 0, chunk.vertexCount * 4);
      pass.setIndexBuffer(chunk.indexBuffer, "uint32", 0, chunk.indexCount * 4);
      pass.drawIndexed(chunk.indexCount, 1, 0, 0, 0);
    }

    void frame.timeMs;
  }

  // ── picking ───────────────────────────────────────────────────────────────

  /** `x`/`y` are backing-store pixels, same as `canvas.width`/`canvas.height`. */
  async pickFeatureIdAtCanvasPixel(x: number, y: number, viewState: ViewState): Promise<number | null> {
    await this.pendingPickPromise;
    const op = this.performPickOperation(x, y, viewState);
    this.pendingPickPromise = op;
    try {
      return await op;
    } finally {
      this.pendingPickPromise = null;
    }
  }

  private async performPickOperation(x: number, y: number, viewState: ViewState): Promise<number | null> {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w <= 0 || h <= 0) return null;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return null;

    this.ensurePickResources();
    this.ensurePickTextureSize(w, h);

    const clipMatrix = viewState.getClipMatrix();
    const pu = new ArrayBuffer(PICK_POLYGON_UNIFORM_BYTE_LENGTH);
    new Float32Array(pu, 0, 16).set(clipMatrix);
    this.device.queue.writeBuffer(this.pickUniformBuffer!, 0, pu);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: this.pickTextureView!, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
      ],
    });

    pass.setPipeline(this.pickPipeline!);
    pass.setBindGroup(0, this.pickBindGroup!);
    pass.setViewport(0, 0, w, h, 0, 1);
    pass.setScissorRect(ix, iy, 1, 1);

    for (const key of this.drawOrder) {
      const chunk = this.chunks.get(key);
      if (chunk === undefined || chunk.indexCount <= 0) {
        continue;
      }
      pass.setVertexBuffer(0, chunk.positionBuffer, 0, chunk.vertexCount * 8);
      pass.setVertexBuffer(1, chunk.featureIdBuffer, 0, chunk.vertexCount * 4);
      pass.setIndexBuffer(chunk.indexBuffer, "uint32", 0, chunk.indexCount * 4);
      pass.drawIndexed(chunk.indexCount, 1, 0, 0, 0);
    }

    pass.end();

    encoder.copyTextureToBuffer(
      { texture: this.pickTexture!, origin: { x: ix, y: iy, z: 0 } },
      { buffer: this.readbackBuffer!, bytesPerRow: 256, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );

    this.device.queue.submit([encoder.finish()]);
    await this.device.queue.onSubmittedWorkDone();

    const readback = this.readbackBuffer!;
    await readback.mapAsync(GPUMapMode.READ);
    try {
      const u8 = new Uint8Array(readback.getMappedRange(0, 4));
      return decodeFeatureIdFromRgba8Bytes(u8, 0);
    } finally {
      readback.unmap();
    }
  }

  private ensurePickResources(): void {
    if (this.pickPipeline) return;

    const module = this.device.createShaderModule({ code: PICK_POLYGONS_WGSL });
    this.pickPipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs_pick",
        buffers: [
          { arrayStride: 8, stepMode: "vertex", attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
          { arrayStride: 4, stepMode: "vertex", attributes: [{ shaderLocation: 1, offset: 0, format: "uint32" }] },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs_pick",
        targets: [{ format: "rgba8unorm" }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.pickUniformBuffer = this.device.createBuffer({
      size: PICK_POLYGON_UNIFORM_BYTE_LENGTH,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.pickBindGroup = this.device.createBindGroup({
      layout: this.pickPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.pickUniformBuffer } }],
    });

    this.readbackBuffer = this.device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  private ensurePickTextureSize(width: number, height: number): void {
    if (this.pickTexture && this.pickTexW === width && this.pickTexH === height) {
      return;
    }
    this.pickTexture?.destroy();
    this.pickTexture = this.device.createTexture({
      size: { width, height, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    this.pickTextureView = this.pickTexture.createView();
    this.pickTexW = width;
    this.pickTexH = height;
  }

  release(): void {
    this.clearChunks();
    this.frameUniformBuffer.destroy();
    this.styleStorageBuffer.destroy();
    this.pickTexture?.destroy();
    this.readbackBuffer?.destroy();
    this.pickUniformBuffer?.destroy();
    this.pickPipeline = null;
    this.pickBindGroup = null;
    this.pickUniformBuffer = null;
    this.pickTexture = null;
    this.pickTextureView = null;
    this.readbackBuffer = null;
    this.pickTexW = 0;
    this.pickTexH = 0;
  }
}

export async function createWebGpuPolygonRenderer(
  options: WebGpuPolygonRendererOptions,
): Promise<WebGpuPolygonRenderer> {
  return WebGpuPolygonRenderer.create(options);
}
