import type { GeometryBufferView } from "../core/geometry-buffer.js";
import type { GeoJsonWorkerChunkMessage } from "../parser/geojson-worker-messages.js";
import { alignTo4Bytes } from "../gpu/byte-align.js";
import { GpuBufferPool } from "../gpu/gpu-buffer-pool.js";
import { GpuPointChunkSlot } from "../gpu/gpu-point-chunk-slot.js";
import { decodeFeatureIdFromRgba8Bytes } from "../picking/id-pack.js";
import { PICK_POINTS_WGSL, PICK_UNIFORM_BYTE_LENGTH } from "../picking/pick-points-wgsl.js";
import type { RenderFrame } from "./renderer.js";
import type { PointStyle } from "./point-style.js";
import { DEFAULT_POINT_STYLE, MAX_POINT_STYLES } from "./point-style.js";
import { FRAME_UNIFORM_BYTE_LENGTH, POINTS_WGSL } from "./points-wgsl.js";

export interface WebGpuPointsRendererOptions {
  readonly canvas: HTMLCanvasElement;
  /** Premultiplied alpha works better with HTML canvas compositing. */
  readonly alphaMode?: GPUCanvasAlphaMode;
  /** Device for sharing; if omitted, one is requested. */
  readonly device?: GPUDevice;
  /** Initial style table (defaults to one blue style). */
  readonly styles?: readonly PointStyle[];
  /**
   * Optional pool for vertex buffers (chunked layout + single-buffer growth).
   * Caller owns the pool; renderer returns buffers here on destroy/evict when set.
   */
  readonly gpuBufferPool?: GpuBufferPool;
}

/** Options for keyed chunk ingest / replace / tombstone (vertexCount 0 removes the key). */
export interface IngestTransferredWorkerChunkOptions {
  /**
   * Stable id for this GPU chunk (tile id, batch id, etc.).
   * Omit to append an anonymous chunk (not replaceable; still participates in LRU eviction).
   */
  readonly chunkKey?: string;
}

/**
 * WebGPU point renderer: `point-list`, circular sprites, small style table.
 * Pass a **column-major** 4×4 map→clip matrix each frame (typical OpenLayers WebGL-style frame).
 */
export class WebGpuPointsRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: GPUCanvasContext;
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly pipeline: GPURenderPipeline;
  private readonly frameUniformBuffer: GPUBuffer;
  private readonly styleStorageBuffer: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;
  private readonly frameUniformStaging = new ArrayBuffer(FRAME_UNIFORM_BYTE_LENGTH);
  private readonly frameF32 = new Float32Array(this.frameUniformStaging, 0, 16);
  private readonly frameU32 = new Uint32Array(this.frameUniformStaging, 64, 4);

  private positionBuffer: GPUBuffer | null = null;
  private styleIdBuffer: GPUBuffer | null = null;
  private featureIdBuffer: GPUBuffer | null = null;
  private capacityVertices = 0;
  private vertexCount = 0;

  private pickPipeline: GPURenderPipeline | null = null;
  private pickBindGroup: GPUBindGroup | null = null;
  private pickUniformBuffer: GPUBuffer | null = null;
  private pickTexture: GPUTexture | null = null;
  private pickTextureView: GPUTextureView | null = null;
  private readbackBuffer: GPUBuffer | null = null;
  private pickTexW = 0;
  private pickTexH = 0;
  private pickPointDiameterPx = 8;

  private mapToClip = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
  private styles: PointStyle[] = [];

  private alphaMode: GPUCanvasAlphaMode = "premultiplied";
  private geometryLayout: "single" | "chunks" = "single";
  private readonly chunkedChunks = new Map<string, GpuPointChunkSlot>();
  /** Stable draw order (first draw wins for overlaps). */
  private readonly chunkDrawOrder: string[] = [];
  /** Front = least recently touched (eviction candidate). */
  private readonly chunkLruOrder: string[] = [];
  private nextAnonChunkKey = 0;
  gpuBufferPool: GpuBufferPool | null = null;

  private constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    format: GPUTextureFormat,
    pipeline: GPURenderPipeline,
    frameUniformBuffer: GPUBuffer,
    styleStorageBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
    initialStyles: readonly PointStyle[],
  ) {
    this.canvas = canvas;
    this.context = context;
    this.device = device;
    this.format = format;
    this.pipeline = pipeline;
    this.frameUniformBuffer = frameUniformBuffer;
    this.styleStorageBuffer = styleStorageBuffer;
    this.bindGroup = bindGroup;
    this.setStyleTable(initialStyles.length > 0 ? initialStyles : [DEFAULT_POINT_STYLE]);
  }

  static async create(options: WebGpuPointsRendererOptions): Promise<WebGpuPointsRenderer> {
    const { canvas, alphaMode = "premultiplied" } = options;
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error("WebGPU not available (no GPUCanvasContext)");
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      throw new Error("WebGPU adapter not available");
    }

    const device =
      options.device ??
      (await adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {},
      }));

    const format = navigator.gpu.getPreferredCanvasFormat();
    const pipeline = WebGpuPointsRenderer.createPipeline(device, format);

    const frameUniformBuffer = device.createBuffer({
      size: FRAME_UNIFORM_BYTE_LENGTH,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const styleStorageBuffer = device.createBuffer({
      size: MAX_POINT_STYLES * 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuffer } },
        { binding: 1, resource: { buffer: styleStorageBuffer } },
      ],
    });

    const renderer = new WebGpuPointsRenderer(
      canvas,
      context,
      device,
      format,
      pipeline,
      frameUniformBuffer,
      styleStorageBuffer,
      bindGroup,
      options.styles ?? [DEFAULT_POINT_STYLE],
    );

    renderer.alphaMode = alphaMode;
    renderer.configureContext(alphaMode);
    renderer.gpuBufferPool = options.gpuBufferPool ?? null;
    return renderer;
  }

  private static createPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const module = device.createShaderModule({ code: POINTS_WGSL });
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
            arrayStride: 2,
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
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "point-list",
      },
    });
  }

  private configureContext(alphaMode: GPUCanvasAlphaMode): void {
    this.alphaMode = alphaMode;
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  getDevice(): GPUDevice {
    return this.device;
  }

  /**
   * Draw monolithic geometry from `setGeometry` (default).
   * Clears any chunked GPU buffers.
   */
  useSingleGeometryLayout(): void {
    this.geometryLayout = "single";
    this.clearChunkedGeometry();
  }

  /**
   * Draw one GPU buffer pair per worker chunk (partial uploads, incremental draws).
   * `setGeometry` is disabled until `useSingleGeometryLayout()` is called.
   */
  useChunkedGeometryLayout(): void {
    this.geometryLayout = "chunks";
    this.vertexCount = 0;
    this.clearChunkedGeometry();
  }

  /**
   * Upload one transferred chunk straight to new vertex buffers (no CPU merge).
   * Requires `useChunkedGeometryLayout()` first.
   *
   * With `chunkKey`, replaces the prior chunk for that key (same GPU slot in draw order).
   * `vertexCount === 0` removes the chunk for that key when `chunkKey` is set.
   */
  ingestTransferredWorkerChunk(
    msg: GeoJsonWorkerChunkMessage,
    options?: IngestTransferredWorkerChunkOptions,
  ): void {
    if (this.geometryLayout !== "chunks") {
      throw new Error("ingestTransferredWorkerChunk requires useChunkedGeometryLayout()");
    }
    const key = options?.chunkKey ?? `__anon:${this.nextAnonChunkKey++}`;
    const existing = this.chunkedChunks.get(key);
    const pool = this.gpuBufferPool ?? undefined;

    if (msg.vertexCount === 0) {
      if (existing !== undefined) {
        existing.destroy(pool);
        this.chunkedChunks.delete(key);
        this.spliceKeyFromOrders(key);
      }
      return;
    }

    if (existing !== undefined) {
      existing.destroy(pool);
    }

    const slot = new GpuPointChunkSlot(this.device, msg, pool);
    this.chunkedChunks.set(key, slot);
    if (existing === undefined) {
      this.chunkDrawOrder.push(key);
    }
    this.touchChunkLru(key);
  }

  /** Removes one keyed chunk from the GPU. Returns false if the key was unknown. */
  removeChunkByKey(chunkKey: string): boolean {
    const slot = this.chunkedChunks.get(chunkKey);
    if (slot === undefined) {
      return false;
    }
    slot.destroy(this.gpuBufferPool ?? undefined);
    this.chunkedChunks.delete(chunkKey);
    this.spliceKeyFromOrders(chunkKey);
    return true;
  }

  /**
   * Evicts the least recently updated chunk (by ingest / replace touch).
   * Returns the removed key, or undefined if empty.
   */
  evictOldestChunk(): string | undefined {
    while (this.chunkLruOrder.length > 0) {
      const key = this.chunkLruOrder.shift()!;
      if (!this.chunkedChunks.has(key)) {
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

  /** Current draw order keys (new chunks append; replace keeps position). */
  getChunkKeys(): readonly string[] {
    return [...this.chunkDrawOrder];
  }

  clearChunkedGeometry(): void {
    const pool = this.gpuBufferPool ?? undefined;
    for (const c of this.chunkedChunks.values()) {
      c.destroy(pool);
    }
    this.chunkedChunks.clear();
    this.chunkDrawOrder.length = 0;
    this.chunkLruOrder.length = 0;
  }

  getChunkCount(): number {
    return this.chunkedChunks.size;
  }

  private touchChunkLru(key: string): void {
    const i = this.chunkLruOrder.indexOf(key);
    if (i >= 0) {
      this.chunkLruOrder.splice(i, 1);
    }
    this.chunkLruOrder.push(key);
  }

  private spliceKeyFromOrders(key: string): void {
    const di = this.chunkDrawOrder.indexOf(key);
    if (di >= 0) {
      this.chunkDrawOrder.splice(di, 1);
    }
    const li = this.chunkLruOrder.indexOf(key);
    if (li >= 0) {
      this.chunkLruOrder.splice(li, 1);
    }
  }

  /**
   * Column-major 4×4: transforms `[mapX, mapY, 0, 1]` into clip space `[-1, 1]`.
   * Build from OpenLayers frame state (same convention as OL WebGL custom layers).
   */
  setMapToClipMatrix(columnMajor4x4: Float32Array): void {
    if (columnMajor4x4.length !== 16) {
      throw new Error("Expected 16 floats (column-major 4x4)");
    }
    this.mapToClip.set(columnMajor4x4);
  }

  /**
   * Point diameter used for the offscreen id pass (match visual size for reliable hits).
   */
  setPickPointDiameterPx(px: number): void {
    this.pickPointDiameterPx = Math.max(1, px);
  }

  /**
   * Offscreen RGBA8 pick: encodes `featureId + 1` per pixel (exact integer, no float precision loss).
   * `x`/`y` are **backing-store** pixels (same as `canvas.width` / `canvas.height`).
   */
  async pickFeatureIdAtCanvasPixel(x: number, y: number): Promise<number | null> {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w <= 0 || h <= 0) return null;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return null;

    this.ensurePickResources();
    this.ensurePickTextureSize(w, h);

    const pu = new ArrayBuffer(PICK_UNIFORM_BYTE_LENGTH);
    new Float32Array(pu, 0, 16).set(this.mapToClip);
    new Float32Array(pu, 64, 4).set([this.pickPointDiameterPx, 0, 0, 0]);
    this.device.queue.writeBuffer(this.pickUniformBuffer!, 0, pu);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.pickTextureView!,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    pass.setPipeline(this.pickPipeline!);
    pass.setBindGroup(0, this.pickBindGroup!);
    pass.setViewport(ix, iy, 1, 1, 0, 1);
    pass.setScissorRect(ix, iy, 1, 1);

    if (this.geometryLayout === "chunks") {
      for (const key of this.chunkDrawOrder) {
        const chunk = this.chunkedChunks.get(key);
        if (chunk === undefined || chunk.vertexCount <= 0) {
          continue;
        }
        pass.setVertexBuffer(0, chunk.positionBuffer, 0, chunk.vertexCount * 8);
        pass.setVertexBuffer(1, chunk.featureIdBuffer, 0, chunk.vertexCount * 4);
        pass.draw(chunk.vertexCount, 1, 0, 0);
      }
    } else if (this.vertexCount > 0 && this.positionBuffer && this.featureIdBuffer) {
      pass.setVertexBuffer(0, this.positionBuffer, 0, this.vertexCount * 8);
      pass.setVertexBuffer(1, this.featureIdBuffer, 0, this.vertexCount * 4);
      pass.draw(this.vertexCount, 1, 0, 0);
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

    const module = this.device.createShaderModule({ code: PICK_POINTS_WGSL });
    this.pickPipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs_pick",
        buffers: [
          {
            arrayStride: 8,
            stepMode: "vertex",
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
          },
          {
            arrayStride: 4,
            stepMode: "vertex",
            attributes: [{ shaderLocation: 1, offset: 0, format: "uint32" }],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs_pick",
        targets: [{ format: "rgba8unorm" }],
      },
      primitive: {
        topology: "point-list",
      },
    });

    this.pickUniformBuffer = this.device.createBuffer({
      size: PICK_UNIFORM_BYTE_LENGTH,
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

  setStyleTable(styles: readonly PointStyle[]): void {
    if (styles.length === 0) {
      throw new Error("At least one style is required");
    }
    if (styles.length > MAX_POINT_STYLES) {
      throw new Error(`At most ${MAX_POINT_STYLES} styles`);
    }
    this.styles = styles.map((s) => ({ ...s, color: [...s.color] as [number, number, number, number] }));

    const f32 = new Float32Array(MAX_POINT_STYLES * 8);
    for (let i = 0; i < this.styles.length; i++) {
      const s = this.styles[i];
      const o = i * 8;
      f32[o + 0] = s.color[0];
      f32[o + 1] = s.color[1];
      f32[o + 2] = s.color[2];
      f32[o + 3] = s.color[3];
      f32[o + 4] = s.sizePx;
    }
    this.device.queue.writeBuffer(this.styleStorageBuffer, 0, f32.buffer, 0, this.styles.length * 32);
  }

  /** @inheritdoc */
  setGeometry(view: GeometryBufferView): void {
    if (this.geometryLayout !== "single") {
      throw new Error("setGeometry is unavailable in chunked layout; use useSingleGeometryLayout()");
    }
    const { buffer, vertexCount } = view;
    if (vertexCount < 0) {
      throw new Error("vertexCount must be non-negative");
    }
    if (vertexCount === 0) {
      this.vertexCount = 0;
      return;
    }

    const posNeeded = vertexCount * 2;
    if (buffer.positions.length < posNeeded) {
      throw new Error("positions Float32Array shorter than vertexCount * 2");
    }
    if (buffer.featureIds.length < vertexCount) {
      throw new Error("featureIds shorter than vertexCount");
    }
    if (buffer.styleIds.length < vertexCount) {
      throw new Error("styleIds shorter than vertexCount");
    }

    this.ensureVertexCapacity(vertexCount);
    this.vertexCount = vertexCount;

    this.device.queue.writeBuffer(
      this.positionBuffer!,
      0,
      buffer.positions.buffer,
      buffer.positions.byteOffset,
      vertexCount * 8,
    );
    const styleRawBytes = vertexCount * 2;
    const styleWriteBytes = alignTo4Bytes(styleRawBytes);
    if (buffer.styleIds.byteOffset + styleRawBytes > buffer.styleIds.buffer.byteLength) {
      throw new Error("styleIds shorter than vertexCount (including padding)");
    }
    if (buffer.styleIds.byteOffset + styleWriteBytes <= buffer.styleIds.buffer.byteLength) {
      this.device.queue.writeBuffer(
        this.styleIdBuffer!,
        0,
        buffer.styleIds.buffer,
        buffer.styleIds.byteOffset,
        styleWriteBytes,
      );
    } else {
      const tmp = new Uint8Array(styleWriteBytes);
      tmp.set(
        new Uint8Array(buffer.styleIds.buffer, buffer.styleIds.byteOffset, styleRawBytes),
        0,
      );
      this.device.queue.writeBuffer(this.styleIdBuffer!, 0, tmp.buffer, 0, styleWriteBytes);
    }
    this.device.queue.writeBuffer(
      this.featureIdBuffer!,
      0,
      buffer.featureIds.buffer,
      buffer.featureIds.byteOffset,
      vertexCount * 4,
    );
  }

  private ensureVertexCapacity(n: number): void {
    if (n <= this.capacityVertices && this.positionBuffer && this.styleIdBuffer && this.featureIdBuffer) {
      return;
    }
    const newCap = Math.max(
      n,
      this.capacityVertices > 0 ? Math.ceil(this.capacityVertices * 1.5) : 0,
      1024,
    );
    const posBytes = newCap * 8;
    const styleBytes = alignTo4Bytes(newCap * 2);
    const featBytes = newCap * 4;

    const pool = this.gpuBufferPool;
    const dispose = (b: GPUBuffer | null | undefined) => {
      if (b === null || b === undefined) {
        return;
      }
      if (pool !== null) {
        pool.release(b);
      } else {
        b.destroy();
      }
    };

    dispose(this.positionBuffer);
    dispose(this.styleIdBuffer);
    dispose(this.featureIdBuffer);

    const alloc = (minBytes: number): GPUBuffer =>
      pool !== null
        ? pool.acquire(minBytes)
        : this.device.createBuffer({
            size: Math.max(minBytes, 4),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          });

    this.positionBuffer = alloc(posBytes);
    this.styleIdBuffer = alloc(styleBytes);
    this.featureIdBuffer = alloc(featBytes);
    this.capacityVertices = newCap;
  }

  /** Call when canvas backing store size should change (DPR / resize). */
  resizeBackingStore(widthPx: number, heightPx: number): void {
    this.canvas.width = Math.max(1, Math.floor(widthPx));
    this.canvas.height = Math.max(1, Math.floor(heightPx));
    this.configureContext(this.alphaMode);
  }

  /** Convenience: `clientWidth/clientHeight * devicePixelRatio`. */
  resizeToDisplaySize(dpr = globalThis.devicePixelRatio ?? 1): void {
    const w = this.canvas.clientWidth * dpr;
    const h = this.canvas.clientHeight * dpr;
    this.resizeBackingStore(w, h);
  }

  render(frame: RenderFrame): void {
    this.frameF32.set(this.mapToClip);
    this.frameU32[0] = this.styles.length;
    this.frameU32[1] = 0;
    this.frameU32[2] = 0;
    this.frameU32[3] = 0;
    this.device.queue.writeBuffer(this.frameUniformBuffer, 0, this.frameUniformStaging);

    const textureView = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    if (this.geometryLayout === "chunks") {
      for (const key of this.chunkDrawOrder) {
        const chunk = this.chunkedChunks.get(key);
        if (chunk === undefined || chunk.vertexCount <= 0) {
          continue;
        }
        pass.setVertexBuffer(0, chunk.positionBuffer, 0, chunk.vertexCount * 8);
        pass.setVertexBuffer(1, chunk.styleIdBuffer, 0, chunk.vertexCount * 2);
        pass.draw(chunk.vertexCount, 1, 0, 0);
      }
    } else if (this.vertexCount > 0 && this.positionBuffer && this.styleIdBuffer) {
      pass.setVertexBuffer(0, this.positionBuffer, 0, this.vertexCount * 8);
      pass.setVertexBuffer(1, this.styleIdBuffer, 0, this.vertexCount * 2);
      pass.draw(this.vertexCount, 1, 0, 0);
    }
    pass.end();

    this.device.queue.submit([encoder.finish()]);

    void frame.timeMs;
  }

  release(): void {
    this.clearChunkedGeometry();
    this.positionBuffer?.destroy();
    this.styleIdBuffer?.destroy();
    this.featureIdBuffer?.destroy();
    this.pickTexture?.destroy();
    this.readbackBuffer?.destroy();
    this.pickUniformBuffer?.destroy();
    (this.pickPipeline as unknown as { destroy?: () => void } | null)?.destroy?.();
    this.frameUniformBuffer.destroy();
    this.styleStorageBuffer.destroy();
    (this.pipeline as unknown as { destroy?: () => void } | null)?.destroy?.();
    this.context.unconfigure();
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

export async function createWebGpuPointsRenderer(
  options: WebGpuPointsRendererOptions,
): Promise<WebGpuPointsRenderer> {
  return WebGpuPointsRenderer.create(options);
}
