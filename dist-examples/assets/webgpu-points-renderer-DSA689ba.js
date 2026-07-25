(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))r(i);new MutationObserver(i=>{for(const s of i)if(s.type==="childList")for(const o of s.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&r(o)}).observe(document,{childList:!0,subtree:!0});function t(i){const s={};return i.integrity&&(s.integrity=i.integrity),i.referrerPolicy&&(s.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?s.credentials="include":i.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function r(i){if(i.ep)return;i.ep=!0;const s=t(i);fetch(i.href,s)}})();class p{constructor(e,t,r,i,s){if(this.center=e,this.zoom=t,this.rotation=r,this.viewportSize=i,this.resolution=s,i[0]<=0||i[1]<=0)throw new Error("Viewport dimensions must be positive")}static getResolutionFromZoom(e){return 156543.03392804103/Math.pow(2,e)}getResolution(){return this.resolution??p.getResolutionFromZoom(this.zoom)}hasExplicitResolution(){return this.resolution!==void 0}getClipMatrix(){const[e,t]=this.center,[r,i]=this.viewportSize,s=this.getResolution(),o=Math.cos(-this.rotation),u=Math.sin(-this.rotation),n=new Float32Array(16);return n[0]=o/s*(2/r),n[1]=u/s*(2/r),n[2]=0,n[3]=0,n[4]=-u/s*(2/i),n[5]=o/s*(2/i),n[6]=0,n[7]=0,n[8]=0,n[9]=0,n[10]=1,n[11]=0,n[12]=(-e*o-t*u)/s*(2/r),n[13]=(e*u-t*o)/s*(2/i),n[14]=0,n[15]=1,n}pan(e,t){return new p([this.center[0]+e,this.center[1]+t],this.zoom,this.rotation,this.viewportSize,this.resolution)}zoomBy(e){const t=this.resolution!==void 0?this.resolution/Math.pow(2,e):void 0;return new p(this.center,this.zoom+e,this.rotation,this.viewportSize,t)}rotateBy(e){return new p(this.center,this.zoom,this.rotation+e,this.viewportSize,this.resolution)}resize(e,t){return new p(this.center,this.zoom,this.rotation,[e,t],this.resolution)}equals(e,t=1e-10){return Math.abs(this.center[0]-e.center[0])<t&&Math.abs(this.center[1]-e.center[1])<t&&Math.abs(this.zoom-e.zoom)<t&&Math.abs(this.rotation-e.rotation)<t&&this.viewportSize[0]===e.viewportSize[0]&&this.viewportSize[1]===e.viewportSize[1]&&Math.abs(this.getResolution()-e.getResolution())<t}toString(){return`ViewState(center=[${this.center[0].toFixed(2)}, ${this.center[1].toFixed(2)}], zoom=${this.zoom.toFixed(2)}, rotation=${this.rotation.toFixed(2)}rad, viewport=${this.viewportSize[0]}x${this.viewportSize[1]})`}}function I(h,e,t){const r=h.getResolution(),i=Math.cos(h.rotation),s=Math.sin(h.rotation),o=(e*i-t*s)*r,u=(e*s+t*i)*r;return h.pan(o,u)}function U(h,e,t,r){const i=t??h.center[0],s=r??h.center[1],o=[i-(i-h.center[0])/e,s-(s-h.center[1])/e],n=h.getResolution()/e,f=Math.log2(156543.03392804103/n);return new p(o,f,h.rotation,h.viewportSize,h.hasExplicitResolution()?n:void 0)}const b=GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST;class m{vertexCount;positionBuffer;styleIdBuffer;featureIdBuffer;static byteSizesForVertexCount(e){const t=e*8,r=e*4,i=e*4;return{positionBytes:t,styleGpuBytes:r,featureIdBytes:i}}constructor(e,t,r){const{vertexCount:i}=t;if(i<0)throw new Error("vertexCount must be non-negative");this.vertexCount=i;const{positionBytes:s,styleGpuBytes:o,featureIdBytes:u}=m.byteSizesForVertexCount(i);if(t.positions.byteLength<s)throw new Error("positions ArrayBuffer smaller than vertexCount * 8");if(t.styleIds.byteLength<i*2)throw new Error("styleIds ArrayBuffer smaller than vertexCount * 2");if(t.featureIds.byteLength<u)throw new Error("featureIds ArrayBuffer smaller than vertexCount * 4");const n=a=>r!==void 0?r.acquire(a):e.createBuffer({size:Math.max(a,4),usage:b});this.positionBuffer=n(s),this.styleIdBuffer=n(o),this.featureIdBuffer=n(u);const f=e.queue;if(s>0&&f.writeBuffer(this.positionBuffer,0,t.positions,0,s),o>0){const a=new Uint8Array(o);a.set(new Uint8Array(t.styleIds,0,i*2),0),f.writeBuffer(this.styleIdBuffer,0,a.buffer,0,o)}u>0&&f.writeBuffer(this.featureIdBuffer,0,t.featureIds,0,u)}writePositionRange(e,t,r){if(r.length%2!==0)throw new Error("xy length must be a multiple of 2");const i=r.length/2,s=t*8,o=i*8;if(s+o>this.positionBuffer.size)throw new Error("writePositionRange exceeds chunk position buffer");if(t+i>this.vertexCount)throw new Error("writePositionRange exceeds chunk vertexCount");e.writeBuffer(this.positionBuffer,s,r.buffer,r.byteOffset,o)}writeFeatureIdRange(e,t,r){const i=r.length,s=t*4,o=i*4;if(s+o>this.featureIdBuffer.size)throw new Error("writeFeatureIdRange exceeds chunk featureId buffer");if(t+i>this.vertexCount)throw new Error("writeFeatureIdRange exceeds chunk vertexCount");e.writeBuffer(this.featureIdBuffer,s,r.buffer,r.byteOffset,o)}writeStyleIdRange(e,t,r){const i=r.length,s=t*4,o=i*4;if(s+o>this.styleIdBuffer.size)throw new Error("writeStyleIdRange exceeds chunk styleId buffer");if(t+i>this.vertexCount)throw new Error("writeStyleIdRange exceeds chunk vertexCount");const u=new Uint8Array(o),n=new Uint16Array(r.buffer,r.byteOffset,i);for(let f=0;f<i;f++){const a=f*4,c=n[f];u[a]=c&255,u[a+1]=c>>8&255}e.writeBuffer(this.styleIdBuffer,s,u.buffer,0,o)}destroy(e){e!==void 0?(e.release(this.positionBuffer),e.release(this.styleIdBuffer),e.release(this.featureIdBuffer)):(this.positionBuffer.destroy(),this.styleIdBuffer.destroy(),this.featureIdBuffer.destroy())}}function S(h,e=0){if(h.length-e<4)return null;const t=(h[e]|h[e+1]<<8|h[e+2]<<16|h[e+3]<<24)>>>0;return t===0?null:t-1}const _=`
struct PickUniforms {
  view_proj: mat4x4<f32>,
  viewport_px: vec2<f32>,
  _pad0: vec2<f32>,
  params: vec4<f32>,
}

@group(0) @binding(0) var<uniform> pick_u: PickUniforms;

struct VsPickOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) @interpolate(flat) fid: u32,
}

@vertex
fn vs_pick(
  @location(0) corner: vec2<f32>,
  @location(1) pos: vec2<f32>,
  @location(2) fid: u32,
) -> VsPickOut {
  let c = pick_u.view_proj * vec4<f32>(pos.x, pos.y, 0.0, 1.0);
  let ndc = c.xy / c.w;
  let half_px = max(pick_u.params.x * 0.5, 0.5);
  let vx = max(pick_u.viewport_px.x, 1.0);
  let vy = max(pick_u.viewport_px.y, 1.0);
  let ext_x = half_px * (2.0 / vx);
  let ext_y = half_px * (2.0 / vy);
  let ndc_out = ndc + vec2<f32>(corner.x * ext_x, -corner.y * ext_y);
  var o: VsPickOut;
  o.clip = vec4<f32>(ndc_out * c.w, c.zw);
  o.fid = fid;
  return o;
}

@fragment
fn fs_pick(@location(0) @interpolate(flat) fid: u32) -> @location(0) vec4<f32> {
  let packed = fid + 1u;
  let r = f32(packed & 255u) / 255.0;
  let g = f32((packed >> 8u) & 255u) / 255.0;
  let b = f32((packed >> 16u) & 255u) / 255.0;
  let a = f32((packed >> 24u) & 255u) / 255.0;
  return vec4<f32>(r, g, b, a);
}
`,w=96,B={color:[.1,.5,1,1],sizePx:6},x=256,P=`
struct FrameUniforms {
  view_proj: mat4x4<f32>,
  viewport_px: vec2<f32>,
  _pad_vp: vec2<f32>,
  style_meta: vec4<u32>,
  lod_stride: f32,
  _pad_lod: vec3<f32>,
}

/**
 * No trailing pad field: a trailing \`vec3<f32>\` has 16-byte ALIGNMENT (not just 12-byte
 * size) per the WGSL memory layout rules, which pushes it out to offset 32 and inflates
 * this struct to 48 bytes — silently mismatching the JS-side upload code's 32-byte stride
 * (\`webgpu-points-renderer.ts\`'s \`setStyleTable\`), corrupting every style entry beyond
 * index 0 (\`style_table[1]\` would read starting at byte 48, landing on style 0's padding
 * and style 1's own tail instead of style 1's actual color/size). Left bare, \`{color:
 * vec4<f32>, size_px: f32}\` already rounds up to exactly 32 bytes on its own (struct size
 * rounds up to its own 16-byte alignment), which is what the JS side assumes. Mirrors the
 * fix already applied to the analogous \`GpuLineStyle\` in \`lines-wgsl.ts\`.
 */
struct GpuStyle {
  color: vec4<f32>,
  size_px: f32,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<storage, read> style_table: array<GpuStyle>;

struct VsOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) size_px: f32,
}

@vertex
fn vs_main(
  @location(0) corner: vec2<f32>,
  @location(1) pos: vec2<f32>,
  @location(2) style_id: u32,
  @location(3) instance_index: u32,
) -> VsOut {
  // LOD: Skip instances based on stride
  let stride = u32(frame.lod_stride);
  if (stride > 1u && (instance_index % stride != 0u)) {
    // Move point outside clip space to cull it
    var o: VsOut;
    o.clip_pos = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    o.color = vec4<f32>(0.0);
    o.uv = vec2<f32>(0.0);
    o.size_px = 0.0;
    return o;
  }

  let n_styles = frame.style_meta.x;
  let sid = select(0u, min(style_id, n_styles - 1u), n_styles > 0u);
  let st = style_table[sid];

  let center = frame.view_proj * vec4<f32>(pos.x, pos.y, 0.0, 1.0);
  let ndc = center.xy / center.w;
  let half_px = max(st.size_px * 0.5, 0.5);
  let vx = max(frame.viewport_px.x, 1.0);
  let vy = max(frame.viewport_px.y, 1.0);
  let ext_x = half_px * (2.0 / vx);
  let ext_y = half_px * (2.0 / vy);
  let ndc_out = ndc + vec2<f32>(corner.x * ext_x, -corner.y * ext_y);

  var o: VsOut;
  o.clip_pos = vec4<f32>(ndc_out * center.w, center.zw);
  o.color = st.color;
  o.uv = corner * 0.5 + vec2<f32>(0.5, 0.5);
  o.size_px = st.size_px;
  return o;
}

@fragment
fn fs_main(
  @location(0) color: vec4<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) size_px: f32,
) -> @location(0) vec4<f32> {
  let center = vec2<f32>(0.5, 0.5);
  let d = length(uv - center) * 2.0;

  // Soft circular falloff with glow
  // Core: bright center, smooth edge
  let core_radius = 0.6;
  let glow_radius = 1.0;

  if (d > glow_radius) {
    discard;
  }

  // Anti-aliased core
  let aa = clamp(fwidth(d), 0.02, 0.15);
  let core_alpha = 1.0 - smoothstep(core_radius - aa, core_radius, d);

  // Outer glow falloff
  let glow_falloff = smoothstep(glow_radius, core_radius, d);
  let glow_alpha = glow_falloff * glow_falloff;

  // Combine core and glow
  let combined_alpha = max(core_alpha, glow_alpha * 0.4);

  // Boost brightness in center for "hot" appearance
  let center_boost = 1.0 - smoothstep(0.0, 0.3, d);
  let brightness = 1.0 + center_boost * 0.3;

  return vec4<f32>(
    color.rgb * brightness,
    color.a * combined_alpha
  );
}
`,k=128;class d{canvas;context;device;format;pipeline;frameUniformBuffer;styleStorageBuffer;bindGroup;quadVertexBuffer;frameUniformStaging=new ArrayBuffer(k);frameF32=new Float32Array(this.frameUniformStaging,0,16);frameViewport=new Float32Array(this.frameUniformStaging,64,2);frameU32=new Uint32Array(this.frameUniformStaging,80,4);frameLodStride=new Float32Array(this.frameUniformStaging,96,1);positionBuffer=null;styleIdBuffer=null;instanceIndexBuffer=null;featureIdBuffer=null;capacityVertices=0;vertexCount=0;pickPipeline=null;pickBindGroup=null;pickUniformBuffer=null;pickTexture=null;pickTextureView=null;readbackBuffer=null;pickTexW=0;pickTexH=0;pickPointDiameterPx=8;pendingPickPromise=null;currentViewState=null;mapToClip=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);styles=[];alphaMode="premultiplied";clearColor;geometryLayout="single";chunkedChunks=new Map;chunkDrawOrder=[];chunkLruOrder=[];residentBytes=0;nextAnonChunkKey=0;gpuBufferPool=null;constructor(e,t,r,i,s,o,u,n,f,a,c){this.canvas=e,this.context=t,this.device=r,this.format=i,this.pipeline=s,this.frameUniformBuffer=o,this.styleStorageBuffer=u,this.bindGroup=n,this.quadVertexBuffer=f,this.clearColor=c,this.setStyleTable(a.length>0?a:[B])}static async create(e){const{canvas:t,alphaMode:r="premultiplied",additiveBlending:i=!1,clearColor:s={r:0,g:0,b:0,a:0}}=e,o=t.getContext("webgpu");if(!o)throw new Error("WebGPU not available (no GPUCanvasContext)");const u=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!u)throw new Error("WebGPU adapter not available");const n=e.device??await u.requestDevice({requiredFeatures:[],requiredLimits:{}}),f=navigator.gpu.getPreferredCanvasFormat(),a=d.createPipeline(n,f,i),c=new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),y=n.createBuffer({size:c.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});n.queue.writeBuffer(y,0,c);const l=n.createBuffer({size:k,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),v=n.createBuffer({size:x*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),C=n.createBindGroup({layout:a.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:l}},{binding:1,resource:{buffer:v}}]}),g=new d(t,o,n,f,a,l,v,C,y,e.styles??[B],s);return g.alphaMode=r,g.configureContext(r),g.gpuBufferPool=e.gpuBufferPool??null,g}static createPipeline(e,t,r){const i=e.createShaderModule({code:P});return e.createRenderPipeline({layout:"auto",vertex:{module:i,entryPoint:"vs_main",buffers:[{arrayStride:8,stepMode:"vertex",attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]},{arrayStride:8,stepMode:"instance",attributes:[{shaderLocation:1,offset:0,format:"float32x2"}]},{arrayStride:4,stepMode:"instance",attributes:[{shaderLocation:2,offset:0,format:"uint16"}]},{arrayStride:4,stepMode:"instance",attributes:[{shaderLocation:3,offset:0,format:"uint32"}]}]},fragment:{module:i,entryPoint:"fs_main",targets:[{format:t,blend:r?{color:{srcFactor:"src-alpha",dstFactor:"one",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}})}configureContext(e){this.alphaMode=e,this.context.configure({device:this.device,format:this.format,alphaMode:e,usage:GPUTextureUsage.RENDER_ATTACHMENT})}getDevice(){return this.device}getCanvas(){return this.canvas}getContext(){return this.context}getCanvasFormat(){return this.format}encodeRenderPass(e,t){const r=this.currentViewState?.getClipMatrix()??this.mapToClip;if(this.frameF32.set(r),this.frameViewport[0]=Math.max(this.canvas.width,1),this.frameViewport[1]=Math.max(this.canvas.height,1),this.frameU32[0]=this.styles.length,this.frameU32[1]=0,this.frameU32[2]=0,this.frameU32[3]=0,this.device.queue.writeBuffer(this.frameUniformBuffer,0,this.frameUniformStaging),e.setPipeline(this.pipeline),e.setBindGroup(0,this.bindGroup),this.geometryLayout==="chunks")for(const i of this.chunkDrawOrder){const s=this.chunkedChunks.get(i);s===void 0||s.vertexCount<=0||(e.setVertexBuffer(0,this.quadVertexBuffer,0,48),e.setVertexBuffer(1,s.positionBuffer,0,s.vertexCount*8),e.setVertexBuffer(2,s.styleIdBuffer,0,s.vertexCount*4),e.draw(6,s.vertexCount,0,0))}else this.vertexCount>0&&this.positionBuffer&&this.styleIdBuffer&&this.instanceIndexBuffer&&(e.setVertexBuffer(0,this.quadVertexBuffer,0,48),e.setVertexBuffer(1,this.positionBuffer,0,this.vertexCount*8),e.setVertexBuffer(2,this.styleIdBuffer,0,this.vertexCount*4),e.setVertexBuffer(3,this.instanceIndexBuffer,0,this.vertexCount*4),e.draw(6,this.vertexCount,0,0));t.timeMs}useSingleGeometryLayout(){this.geometryLayout="single",this.clearChunkedGeometry()}useChunkedGeometryLayout(){this.geometryLayout="chunks",this.vertexCount=0,this.clearChunkedGeometry()}ingestTransferredWorkerChunk(e,t){if(this.geometryLayout!=="chunks")throw new Error("ingestTransferredWorkerChunk requires useChunkedGeometryLayout()");const r=t?.chunkKey??`__anon:${this.nextAnonChunkKey++}`,i=this.chunkedChunks.get(r),s=this.gpuBufferPool??void 0;if(e.vertexCount===0){i!==void 0&&(i.destroy(s),this.residentBytes-=d.chunkByteSize(i),this.chunkedChunks.delete(r),this.spliceKeyFromOrders(r));return}i!==void 0&&(i.destroy(s),this.residentBytes-=d.chunkByteSize(i));const o=new m(this.device,e,s);this.chunkedChunks.set(r,o),this.residentBytes+=d.chunkByteSize(o),i===void 0&&this.chunkDrawOrder.push(r),this.touchChunkLru(r)}removeChunkByKey(e){const t=this.chunkedChunks.get(e);return t===void 0?!1:(t.destroy(this.gpuBufferPool??void 0),this.residentBytes-=d.chunkByteSize(t),this.chunkedChunks.delete(e),this.spliceKeyFromOrders(e),!0)}evictOldestChunk(){for(;this.chunkLruOrder.length>0;){const e=this.chunkLruOrder.shift();if(this.chunkedChunks.has(e))return this.removeChunkByKey(e),e}}evictOldestChunks(e){const t=[];for(let r=0;r<e;r++){const i=this.evictOldestChunk();if(i===void 0)break;t.push(i)}return t}getChunkKeys(){return[...this.chunkDrawOrder]}clearChunkedGeometry(){const e=this.gpuBufferPool??void 0;for(const t of this.chunkedChunks.values())t.destroy(e);this.chunkedChunks.clear(),this.chunkDrawOrder.length=0,this.chunkLruOrder.length=0,this.residentBytes=0}getChunkCount(){return this.chunkedChunks.size}getResidentBytes(){return this.residentBytes}getChunkByteSize(e){const t=this.chunkedChunks.get(e);return t===void 0?0:d.chunkByteSize(t)}static chunkByteSize(e){return e.positionBuffer.size+e.styleIdBuffer.size+e.featureIdBuffer.size}getStats(){const e=this.vertexCount,t=this.frameLodStride[0],r=t>=1?Math.floor(e/t):e,i=this.chunkedChunks.size,s=this.geometryLayout==="chunks"?this.chunkDrawOrder.length:e>0?1:0;return{totalInstances:e,visibleInstances:r,chunkCount:i,residentBytes:this.residentBytes,drawCalls:s,lodStride:t,geometryLayout:this.geometryLayout}}touchChunkLru(e){const t=this.chunkLruOrder.indexOf(e);t>=0&&this.chunkLruOrder.splice(t,1),this.chunkLruOrder.push(e)}spliceKeyFromOrders(e){const t=this.chunkDrawOrder.indexOf(e);t>=0&&this.chunkDrawOrder.splice(t,1);const r=this.chunkLruOrder.indexOf(e);r>=0&&this.chunkLruOrder.splice(r,1)}setMapToClipMatrix(e){if(e.length!==16)throw new Error("Expected 16 floats (column-major 4x4)");this.mapToClip.set(e),this.currentViewState=null}setPickPointDiameterPx(e){this.pickPointDiameterPx=Math.max(1,e)}async pickFeatureIdAtCanvasPixel(e,t){await this.pendingPickPromise;const r=this.performPickOperation(e,t);this.pendingPickPromise=r;try{return await r}finally{this.pendingPickPromise=null}}async performPickOperation(e,t){const r=this.canvas.width,i=this.canvas.height;if(r<=0||i<=0)return null;const s=Math.floor(e),o=Math.floor(t);if(s<0||o<0||s>=r||o>=i)return null;this.ensurePickResources(),this.ensurePickTextureSize(r,i);const u=this.currentViewState?.getClipMatrix()??this.mapToClip,n=new ArrayBuffer(w);new Float32Array(n,0,16).set(u),new Float32Array(n,64,2).set([Math.max(r,1),Math.max(i,1)]),new Float32Array(n,80,4).set([this.pickPointDiameterPx,0,0,0]),this.device.queue.writeBuffer(this.pickUniformBuffer,0,n);const f=this.device.createCommandEncoder(),a=f.beginRenderPass({colorAttachments:[{view:this.pickTextureView,clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});if(a.setPipeline(this.pickPipeline),a.setBindGroup(0,this.pickBindGroup),a.setViewport(0,0,r,i,0,1),a.setScissorRect(s,o,1,1),this.geometryLayout==="chunks")for(const y of this.chunkDrawOrder){const l=this.chunkedChunks.get(y);l===void 0||l.vertexCount<=0||(a.setVertexBuffer(0,this.quadVertexBuffer,0,48),a.setVertexBuffer(1,l.positionBuffer,0,l.vertexCount*8),a.setVertexBuffer(2,l.featureIdBuffer,0,l.vertexCount*4),a.draw(6,l.vertexCount,0,0))}else this.vertexCount>0&&this.positionBuffer&&this.featureIdBuffer&&(a.setVertexBuffer(0,this.quadVertexBuffer,0,48),a.setVertexBuffer(1,this.positionBuffer,0,this.vertexCount*8),a.setVertexBuffer(2,this.featureIdBuffer,0,this.vertexCount*4),a.draw(6,this.vertexCount,0,0));a.end(),f.copyTextureToBuffer({texture:this.pickTexture,origin:{x:s,y:o,z:0}},{buffer:this.readbackBuffer,bytesPerRow:256,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.device.queue.submit([f.finish()]),await this.device.queue.onSubmittedWorkDone();const c=this.readbackBuffer;await c.mapAsync(GPUMapMode.READ);try{const y=new Uint8Array(c.getMappedRange(0,4));return S(y,0)}finally{c.unmap()}}ensurePickResources(){if(this.pickPipeline)return;const e=this.device.createShaderModule({code:_});this.pickPipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:e,entryPoint:"vs_pick",buffers:[{arrayStride:8,stepMode:"vertex",attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]},{arrayStride:8,stepMode:"instance",attributes:[{shaderLocation:1,offset:0,format:"float32x2"}]},{arrayStride:4,stepMode:"instance",attributes:[{shaderLocation:2,offset:0,format:"uint32"}]}]},fragment:{module:e,entryPoint:"fs_pick",targets:[{format:"rgba8unorm"}]},primitive:{topology:"triangle-list"}}),this.pickUniformBuffer=this.device.createBuffer({size:w,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.pickBindGroup=this.device.createBindGroup({layout:this.pickPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.pickUniformBuffer}}]}),this.readbackBuffer=this.device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})}ensurePickTextureSize(e,t){this.pickTexture&&this.pickTexW===e&&this.pickTexH===t||(this.pickTexture?.destroy(),this.pickTexture=this.device.createTexture({size:{width:e,height:t,depthOrArrayLayers:1},format:"rgba8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.pickTextureView=this.pickTexture.createView(),this.pickTexW=e,this.pickTexH=t)}setStyleTable(e){if(e.length===0)throw new Error("At least one style is required");if(e.length>x)throw new Error(`At most ${x} styles`);this.styles=e.map(r=>({...r,color:[...r.color]}));const t=new Float32Array(x*8);for(let r=0;r<this.styles.length;r++){const i=this.styles[r],s=r*8;t[s+0]=i.color[0],t[s+1]=i.color[1],t[s+2]=i.color[2],t[s+3]=i.color[3],t[s+4]=i.sizePx}this.device.queue.writeBuffer(this.styleStorageBuffer,0,t.buffer,0,this.styles.length*32)}setLodStride(e){if(e<1)throw new Error("LOD stride must be >= 1.0");this.frameLodStride[0]=e}setGeometry(e){if(this.geometryLayout!=="single")throw new Error("setGeometry is unavailable in chunked layout; use useSingleGeometryLayout()");const{buffer:t,vertexCount:r}=e;if(r<0)throw new Error("vertexCount must be non-negative");if(r===0){this.vertexCount=0;return}const i=r*2;if(t.positions.length<i)throw new Error("positions Float32Array shorter than vertexCount * 2");if(t.featureIds.length<r)throw new Error("featureIds shorter than vertexCount");if(t.styleIds.length<r)throw new Error("styleIds shorter than vertexCount");this.ensureVertexCapacity(r),this.vertexCount=r,this.device.queue.writeBuffer(this.positionBuffer,0,t.positions.buffer,t.positions.byteOffset,r*8);const s=r*4;if(t.styleIds.byteOffset+r*2>t.styleIds.buffer.byteLength)throw new Error("styleIds shorter than vertexCount (including padding)");const o=new Uint8Array(s);d.packStyleIdsToGpuStride(t.styleIds,r,o),this.device.queue.writeBuffer(this.styleIdBuffer,0,o.buffer,0,s),this.device.queue.writeBuffer(this.featureIdBuffer,0,t.featureIds.buffer,t.featureIds.byteOffset,r*4)}writeStyleIdsForSingleLayout(e,t){if(this.geometryLayout!=="single")throw new Error("writeStyleIdsForSingleLayout requires useSingleGeometryLayout()");if(t<=0)return;if(!this.styleIdBuffer||this.vertexCount!==t)throw new Error("writeStyleIdsForSingleLayout: call setGeometry first with the same vertexCount");if(e.length<t)throw new Error("styleIds shorter than vertexCount");const r=t*4,i=new Uint8Array(r);d.packStyleIdsToGpuStride(e,t,i),this.device.queue.writeBuffer(this.styleIdBuffer,0,i.buffer,0,r)}static packStyleIdsToGpuStride(e,t,r){for(let i=0;i<t;i++){const s=e[i],o=i*4;r[o]=s&255,r[o+1]=s>>8&255}}ensureVertexCapacity(e){if(e<=this.capacityVertices&&this.positionBuffer&&this.styleIdBuffer&&this.featureIdBuffer&&this.instanceIndexBuffer)return;const t=Math.max(e,this.capacityVertices>0?Math.ceil(this.capacityVertices*1.5):0,1024),r=t*8,i=t*4,s=t*4,o=t*4,u=this.gpuBufferPool,n=c=>{c!=null&&(u!==null?u.release(c):c.destroy())};n(this.positionBuffer),n(this.styleIdBuffer),n(this.featureIdBuffer),n(this.instanceIndexBuffer);const f=c=>u!==null?u.acquire(c):this.device.createBuffer({size:Math.max(c,4),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});this.positionBuffer=f(r),this.styleIdBuffer=f(i),this.featureIdBuffer=f(s),this.instanceIndexBuffer=f(o);const a=new Uint32Array(t);for(let c=0;c<t;c++)a[c]=c;this.device.queue.writeBuffer(this.instanceIndexBuffer,0,a.buffer,0,o),this.capacityVertices=t}resizeBackingStore(e,t){this.canvas.width=Math.max(1,Math.floor(e)),this.canvas.height=Math.max(1,Math.floor(t)),this.configureContext(this.alphaMode)}resizeToDisplaySize(e=globalThis.devicePixelRatio??1){const t=this.canvas.clientWidth*e,r=this.canvas.clientHeight*e;this.resizeBackingStore(t,r)}render(e){const t=this.context.getCurrentTexture().createView(),r=this.device.createCommandEncoder(),i=r.beginRenderPass({colorAttachments:[{view:t,clearValue:this.clearColor,loadOp:"clear",storeOp:"store"}]});this.encodeRenderPass(i,e),i.end(),this.device.queue.submit([r.finish()])}renderWithViewState(e,t){this.currentViewState=e,this.render(t)}release(){this.clearChunkedGeometry(),this.quadVertexBuffer.destroy(),this.positionBuffer?.destroy(),this.styleIdBuffer?.destroy(),this.featureIdBuffer?.destroy(),this.instanceIndexBuffer?.destroy(),this.pickTexture?.destroy(),this.readbackBuffer?.destroy(),this.pickUniformBuffer?.destroy(),this.pickPipeline?.destroy?.(),this.frameUniformBuffer.destroy(),this.styleStorageBuffer.destroy(),this.pipeline?.destroy?.(),this.context.unconfigure(),this.pickPipeline=null,this.pickBindGroup=null,this.pickUniformBuffer=null,this.pickTexture=null,this.pickTextureView=null,this.readbackBuffer=null,this.pickTexW=0,this.pickTexH=0}}export{p as V,d as W,S as d,I as p,U as z};
//# sourceMappingURL=webgpu-points-renderer-DSA689ba.js.map
