import{d as we,W as Ue,V as Se,p as Ie,z as Oe}from"./webgpu-points-renderer-DSA689ba.js";import"./geoarrow.es-CduQfizF.js";const oe={color:[1,.55,.15,1],widthPx:3},D=256;class ie{segmentCount;startPosBuffer;endPosBuffer;featureIdBuffer;styleIdBuffer;static byteSizesForSegmentCount(e){const t=e*8,n=e*8,i=e*4,s=e*4;return{startPosBytes:t,endPosBytes:n,featureIdBytes:i,styleGpuBytes:s}}constructor(e,t,n){const{segmentCount:i}=t;if(i<0)throw new Error("segmentCount must be non-negative");this.segmentCount=i;const{startPosBytes:s,endPosBytes:o,featureIdBytes:a,styleGpuBytes:f}=ie.byteSizesForSegmentCount(i);if(t.startPositions.byteLength<s)throw new Error("startPositions ArrayBuffer smaller than segmentCount * 8");if(t.endPositions.byteLength<o)throw new Error("endPositions ArrayBuffer smaller than segmentCount * 8");if(t.featureIds.byteLength<a)throw new Error("featureIds ArrayBuffer smaller than segmentCount * 4");if(t.styleIds.byteLength<i*2)throw new Error("styleIds ArrayBuffer smaller than segmentCount * 2");const u=GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,h=d=>n!==void 0?n.acquire(d):e.createBuffer({size:Math.max(d,4),usage:u});this.startPosBuffer=h(s),this.endPosBuffer=h(o),this.featureIdBuffer=h(a),this.styleIdBuffer=h(f);const c=e.queue;if(s>0){c.writeBuffer(this.startPosBuffer,0,t.startPositions.buffer,t.startPositions.byteOffset,s),c.writeBuffer(this.endPosBuffer,0,t.endPositions.buffer,t.endPositions.byteOffset,o),c.writeBuffer(this.featureIdBuffer,0,t.featureIds.buffer,t.featureIds.byteOffset,a);const d=new Uint8Array(f);for(let p=0;p<i;p++){const l=t.styleIds[p],y=p*4;d[y]=l&255,d[y+1]=l>>8&255}c.writeBuffer(this.styleIdBuffer,0,d.buffer,0,f)}}destroy(e){e!==void 0?(e.release(this.startPosBuffer),e.release(this.endPosBuffer),e.release(this.featureIdBuffer),e.release(this.styleIdBuffer)):(this.startPosBuffer.destroy(),this.endPosBuffer.destroy(),this.featureIdBuffer.destroy(),this.styleIdBuffer.destroy())}}const Ae=`
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

fn extrude_ndc(
  start_pos: vec2<f32>,
  end_pos: vec2<f32>,
  corner: vec2<f32>,
  half_width_px: f32,
  view_proj: mat4x4<f32>,
  viewport_px: vec2<f32>,
) -> vec4<f32> {
  let c0 = view_proj * vec4<f32>(start_pos, 0.0, 1.0);
  let c1 = view_proj * vec4<f32>(end_pos, 0.0, 1.0);
  let ndc0 = c0.xy / c0.w;
  let ndc1 = c1.xy / c1.w;

  let half_px = vec2<f32>(max(viewport_px.x, 1.0) * 0.5, max(viewport_px.y, 1.0) * 0.5);

  let d_px = (ndc1 - ndc0) * half_px;
  let len_px = max(length(d_px), 1e-6);
  let dir_px = d_px / len_px;
  let perp_px = vec2<f32>(-dir_px.y, dir_px.x);

  let off_px = perp_px * half_width_px;
  let off_ndc = off_px / half_px;

  let is_end = corner.x > 0.0;
  let base_ndc = select(ndc0, ndc1, is_end);
  let base_w = select(c0.w, c1.w, is_end);
  let base_zw = select(c0.zw, c1.zw, is_end);

  let ndc_out = base_ndc + off_ndc * corner.y;
  return vec4<f32>(ndc_out * base_w, base_zw);
}

@vertex
fn vs_pick(
  @location(0) corner: vec2<f32>,
  @location(1) start_pos: vec2<f32>,
  @location(2) end_pos: vec2<f32>,
  @location(3) fid: u32,
) -> VsPickOut {
  let half_w = max(pick_u.params.x * 0.5, 0.5);
  var o: VsPickOut;
  o.clip = extrude_ndc(start_pos, end_pos, corner, half_w, pick_u.view_proj, pick_u.viewport_px);
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
`,ae=96,Te=`
struct FrameUniforms {
  view_proj: mat4x4<f32>,
  viewport_px: vec2<f32>,
  _pad_vp: vec2<f32>,
  style_meta: vec4<u32>,
}

/**
 * No trailing pad field: a trailing \`vec3<f32>\` has 16-byte ALIGNMENT (not just 12-byte
 * size) per the WGSL memory layout rules, which pushes it out to offset 32 and inflates
 * this struct to 48 bytes — silently mismatching the JS-side upload code's 32-byte
 * stride (\`webgpu-line-renderer.ts\`'s \`setStyleTable\`), corrupting every style entry
 * beyond index 0. Left bare, \`{color: vec4<f32>, width_px: f32}\` already rounds up to
 * exactly 32 bytes on its own (struct size rounds up to its own 16-byte alignment), which
 * is what the JS side assumes — verified empirically (Stage 6.2): this exact struct shape
 * with an explicit vec3 pad reproduced a real bug that was also present in
 * \`WebGpuPointsRenderer\`'s identically-shaped \`GpuStyle\`, where any style index >= 1
 * rendered fully transparent. Fixed here by omitting the field that causes it; the same fix
 * was later applied to \`GpuStyle\` in \`points-wgsl.ts\` (Stage 6.2.1).
 */
struct GpuLineStyle {
  color: vec4<f32>,
  width_px: f32,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<storage, read> style_table: array<GpuLineStyle>;

struct VsOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) color: vec4<f32>,
}

fn extrude_ndc(
  start_pos: vec2<f32>,
  end_pos: vec2<f32>,
  corner: vec2<f32>,
  half_width_px: f32,
  view_proj: mat4x4<f32>,
  viewport_px: vec2<f32>,
) -> vec4<f32> {
  let c0 = view_proj * vec4<f32>(start_pos, 0.0, 1.0);
  let c1 = view_proj * vec4<f32>(end_pos, 0.0, 1.0);
  let ndc0 = c0.xy / c0.w;
  let ndc1 = c1.xy / c1.w;

  let half_px = vec2<f32>(max(viewport_px.x, 1.0) * 0.5, max(viewport_px.y, 1.0) * 0.5);

  // NDC delta -> actual pixel-space delta, per axis (required for non-square viewports —
  // verified numerically in Stage 6.1; a naive NDC-space perpendicular skews width by the
  // viewport aspect ratio).
  let d_px = (ndc1 - ndc0) * half_px;
  let len_px = max(length(d_px), 1e-6); // degenerate zero-length segment guard
  let dir_px = d_px / len_px;
  let perp_px = vec2<f32>(-dir_px.y, dir_px.x);

  let off_px = perp_px * half_width_px;
  let off_ndc = off_px / half_px;

  let is_end = corner.x > 0.0;
  let base_ndc = select(ndc0, ndc1, is_end);
  let base_w = select(c0.w, c1.w, is_end);
  let base_zw = select(c0.zw, c1.zw, is_end);

  let ndc_out = base_ndc + off_ndc * corner.y;
  return vec4<f32>(ndc_out * base_w, base_zw);
}

@vertex
fn vs_main(
  @location(0) corner: vec2<f32>,
  @location(1) start_pos: vec2<f32>,
  @location(2) end_pos: vec2<f32>,
  @location(3) style_id: u32,
) -> VsOut {
  let n_styles = frame.style_meta.x;
  let sid = select(0u, min(style_id, n_styles - 1u), n_styles > 0u);
  let st = style_table[sid];
  let half_w = max(st.width_px * 0.5, 0.5);

  var o: VsOut;
  o.clip_pos = extrude_ndc(start_pos, end_pos, corner, half_w, frame.view_proj, frame.viewport_px);
  o.color = st.color;
  return o;
}

@fragment
fn fs_main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
  return color;
}
`,fe=96;class S{device;format;canvas;pipeline;frameUniformBuffer;styleStorageBuffer;bindGroup;quadVertexBuffer;frameUniformStaging=new ArrayBuffer(fe);frameF32=new Float32Array(this.frameUniformStaging,0,16);frameViewport=new Float32Array(this.frameUniformStaging,64,2);frameU32=new Uint32Array(this.frameUniformStaging,80,4);styles=[];chunks=new Map;drawOrder=[];lruOrder=[];residentBytes=0;nextAnonChunkKey=0;gpuBufferPool=null;pickPipeline=null;pickBindGroup=null;pickUniformBuffer=null;pickTexture=null;pickTextureView=null;readbackBuffer=null;pickTexW=0;pickTexH=0;pickWidthPx=8;pendingPickPromise=null;constructor(e,t,n,i,s,o,a,f,u){this.device=e,this.format=t,this.canvas=n,this.pipeline=i,this.frameUniformBuffer=s,this.styleStorageBuffer=o,this.bindGroup=a,this.quadVertexBuffer=f,this.setStyleTable(u.length>0?u:[oe])}static async create(e){const{device:t,format:n,canvas:i}=e,s=S.createPipeline(t,n),o=new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),a=t.createBuffer({size:o.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});t.queue.writeBuffer(a,0,o);const f=t.createBuffer({size:fe,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),u=t.createBuffer({size:D*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),h=t.createBindGroup({layout:s.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:f}},{binding:1,resource:{buffer:u}}]});return new S(t,n,i,s,f,u,h,a,e.styles??[oe])}static createPipeline(e,t){const n=e.createShaderModule({code:Te});return e.createRenderPipeline({layout:"auto",vertex:{module:n,entryPoint:"vs_main",buffers:[{arrayStride:8,stepMode:"vertex",attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]},{arrayStride:8,stepMode:"instance",attributes:[{shaderLocation:1,offset:0,format:"float32x2"}]},{arrayStride:8,stepMode:"instance",attributes:[{shaderLocation:2,offset:0,format:"float32x2"}]},{arrayStride:4,stepMode:"instance",attributes:[{shaderLocation:3,offset:0,format:"uint16"}]}]},fragment:{module:n,entryPoint:"fs_main",targets:[{format:t,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}})}getDevice(){return this.device}getCanvasFormat(){return this.format}setStyleTable(e){if(e.length===0)throw new Error("At least one style is required");if(e.length>D)throw new Error(`At most ${D} styles`);this.styles=e.map(n=>({...n,color:[...n.color]}));const t=new Float32Array(D*8);for(let n=0;n<this.styles.length;n++){const i=this.styles[n],s=n*8;t[s+0]=i.color[0],t[s+1]=i.color[1],t[s+2]=i.color[2],t[s+3]=i.color[3],t[s+4]=i.widthPx}this.device.queue.writeBuffer(this.styleStorageBuffer,0,t.buffer,0,this.styles.length*32)}setPickWidthPx(e){this.pickWidthPx=Math.max(1,e)}ingestLineSegments(e,t){const n=t?.chunkKey??`__anon:${this.nextAnonChunkKey++}`,i=this.chunks.get(n),s=this.gpuBufferPool??void 0;if(e.segmentCount===0){i!==void 0&&(i.destroy(s),this.residentBytes-=S.chunkByteSize(i),this.chunks.delete(n),this.spliceKeyFromOrders(n));return}i!==void 0&&(i.destroy(s),this.residentBytes-=S.chunkByteSize(i));const o=new ie(this.device,e,s);this.chunks.set(n,o),this.residentBytes+=S.chunkByteSize(o),i===void 0&&this.drawOrder.push(n),this.touchLru(n)}removeChunkByKey(e){const t=this.chunks.get(e);return t===void 0?!1:(t.destroy(this.gpuBufferPool??void 0),this.residentBytes-=S.chunkByteSize(t),this.chunks.delete(e),this.spliceKeyFromOrders(e),!0)}evictOldestChunk(){for(;this.lruOrder.length>0;){const e=this.lruOrder.shift();if(this.chunks.has(e))return this.removeChunkByKey(e),e}}evictOldestChunks(e){const t=[];for(let n=0;n<e;n++){const i=this.evictOldestChunk();if(i===void 0)break;t.push(i)}return t}clearChunks(){const e=this.gpuBufferPool??void 0;for(const t of this.chunks.values())t.destroy(e);this.chunks.clear(),this.drawOrder.length=0,this.lruOrder.length=0,this.residentBytes=0}getChunkCount(){return this.chunks.size}getChunkKeys(){return[...this.drawOrder]}getResidentBytes(){return this.residentBytes}getChunkByteSize(e){const t=this.chunks.get(e);return t===void 0?0:S.chunkByteSize(t)}getStats(){let e=0;for(const t of this.chunks.values())e+=t.segmentCount;return{totalSegments:e,chunkCount:this.chunks.size,residentBytes:this.residentBytes,drawCalls:this.drawOrder.length}}static chunkByteSize(e){return e.startPosBuffer.size+e.endPosBuffer.size+e.featureIdBuffer.size+e.styleIdBuffer.size}touchLru(e){const t=this.lruOrder.indexOf(e);t>=0&&this.lruOrder.splice(t,1),this.lruOrder.push(e)}spliceKeyFromOrders(e){const t=this.drawOrder.indexOf(e);t>=0&&this.drawOrder.splice(t,1);const n=this.lruOrder.indexOf(e);n>=0&&this.lruOrder.splice(n,1)}encodeRenderPass(e,t,n){const i=t.getClipMatrix();this.frameF32.set(i),this.frameViewport[0]=Math.max(this.canvas.width,1),this.frameViewport[1]=Math.max(this.canvas.height,1),this.frameU32[0]=this.styles.length,this.frameU32[1]=0,this.frameU32[2]=0,this.frameU32[3]=0,this.device.queue.writeBuffer(this.frameUniformBuffer,0,this.frameUniformStaging),e.setPipeline(this.pipeline),e.setBindGroup(0,this.bindGroup);for(const s of this.drawOrder){const o=this.chunks.get(s);o===void 0||o.segmentCount<=0||(e.setVertexBuffer(0,this.quadVertexBuffer,0,48),e.setVertexBuffer(1,o.startPosBuffer,0,o.segmentCount*8),e.setVertexBuffer(2,o.endPosBuffer,0,o.segmentCount*8),e.setVertexBuffer(3,o.styleIdBuffer,0,o.segmentCount*4),e.draw(6,o.segmentCount,0,0))}n.timeMs}async pickFeatureIdAtCanvasPixel(e,t,n){await this.pendingPickPromise;const i=this.performPickOperation(e,t,n);this.pendingPickPromise=i;try{return await i}finally{this.pendingPickPromise=null}}async performPickOperation(e,t,n){const i=this.canvas.width,s=this.canvas.height;if(i<=0||s<=0)return null;const o=Math.floor(e),a=Math.floor(t);if(o<0||a<0||o>=i||a>=s)return null;this.ensurePickResources(),this.ensurePickTextureSize(i,s);const f=n.getClipMatrix(),u=new ArrayBuffer(ae);new Float32Array(u,0,16).set(f),new Float32Array(u,64,2).set([Math.max(i,1),Math.max(s,1)]),new Float32Array(u,80,4).set([this.pickWidthPx,0,0,0]),this.device.queue.writeBuffer(this.pickUniformBuffer,0,u);const h=this.device.createCommandEncoder(),c=h.beginRenderPass({colorAttachments:[{view:this.pickTextureView,clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});c.setPipeline(this.pickPipeline),c.setBindGroup(0,this.pickBindGroup),c.setViewport(0,0,i,s,0,1),c.setScissorRect(o,a,1,1);for(const p of this.drawOrder){const l=this.chunks.get(p);l===void 0||l.segmentCount<=0||(c.setVertexBuffer(0,this.quadVertexBuffer,0,48),c.setVertexBuffer(1,l.startPosBuffer,0,l.segmentCount*8),c.setVertexBuffer(2,l.endPosBuffer,0,l.segmentCount*8),c.setVertexBuffer(3,l.featureIdBuffer,0,l.segmentCount*4),c.draw(6,l.segmentCount,0,0))}c.end(),h.copyTextureToBuffer({texture:this.pickTexture,origin:{x:o,y:a,z:0}},{buffer:this.readbackBuffer,bytesPerRow:256,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.device.queue.submit([h.finish()]),await this.device.queue.onSubmittedWorkDone();const d=this.readbackBuffer;await d.mapAsync(GPUMapMode.READ);try{const p=new Uint8Array(d.getMappedRange(0,4));return we(p,0)}finally{d.unmap()}}ensurePickResources(){if(this.pickPipeline)return;const e=this.device.createShaderModule({code:Ae});this.pickPipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:e,entryPoint:"vs_pick",buffers:[{arrayStride:8,stepMode:"vertex",attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]},{arrayStride:8,stepMode:"instance",attributes:[{shaderLocation:1,offset:0,format:"float32x2"}]},{arrayStride:8,stepMode:"instance",attributes:[{shaderLocation:2,offset:0,format:"float32x2"}]},{arrayStride:4,stepMode:"instance",attributes:[{shaderLocation:3,offset:0,format:"uint32"}]}]},fragment:{module:e,entryPoint:"fs_pick",targets:[{format:"rgba8unorm"}]},primitive:{topology:"triangle-list"}}),this.pickUniformBuffer=this.device.createBuffer({size:ae,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.pickBindGroup=this.device.createBindGroup({layout:this.pickPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.pickUniformBuffer}}]}),this.readbackBuffer=this.device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})}ensurePickTextureSize(e,t){this.pickTexture&&this.pickTexW===e&&this.pickTexH===t||(this.pickTexture?.destroy(),this.pickTexture=this.device.createTexture({size:{width:e,height:t,depthOrArrayLayers:1},format:"rgba8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.pickTextureView=this.pickTexture.createView(),this.pickTexW=e,this.pickTexH=t)}release(){this.clearChunks(),this.quadVertexBuffer.destroy(),this.frameUniformBuffer.destroy(),this.styleStorageBuffer.destroy(),this.pickTexture?.destroy(),this.readbackBuffer?.destroy(),this.pickUniformBuffer?.destroy(),this.pickPipeline=null,this.pickBindGroup=null,this.pickUniformBuffer=null,this.pickTexture=null,this.pickTextureView=null,this.readbackBuffer=null,this.pickTexW=0,this.pickTexH=0}}const Me={segmentCount:0,startPositions:new Float32Array(0),endPositions:new Float32Array(0),featureIds:new Uint32Array(0),styleIds:new Uint16Array(0)};function Fe(r,e){let t=0;for(const f of e)f.geometryKind==="line"&&(f.vertexCount<2||(t+=f.vertexCount-1));if(t===0)return Me;const n=new Float32Array(t*2),i=new Float32Array(t*2),s=new Uint32Array(t),o=new Uint16Array(t);let a=0;for(const f of e){if(f.geometryKind!=="line"||f.vertexCount<2)continue;const u=f.vertexStart,h=f.vertexCount-1;for(let c=0;c<h;c++){const d=u+c,p=u+c+1;n[a*2]=r.positions[d*2],n[a*2+1]=r.positions[d*2+1],i[a*2]=r.positions[p*2],i[a*2+1]=r.positions[p*2+1],s[a]=f.id,o[a]=r.styleIds[d],a+=1}}return{segmentCount:t,startPositions:n,endPositions:i,featureIds:s,styleIds:o}}function Ge(r){return{x:r[0],y:r[1]}}function Ee(){return{partRingCounts:[],ringVertexCounts:[]}}function ce(r,e){if(e.length!==0){for(const t of e)r.ringVertexCounts.push(t);r.partRingCounts.push(e.length)}}function Be(r,e,t,n,i,s,o,a){if(r===null)return 0;let f=o;const u=c=>{const{x:d,y:p}=Ge(c);e[f*2]=d,e[f*2+1]=p,t[f]=i,n[f]=s,f+=1},h=c=>{const d=f;for(const p of c)u(p);return f-d};switch(r.type){case"Point":u(r.coordinates);break;case"MultiPoint":for(const c of r.coordinates)u(c);break;case"LineString":h(r.coordinates);break;case"MultiLineString":for(const c of r.coordinates)h(c);break;case"Polygon":{const c=r.coordinates.map(h);a&&ce(a,c);break}case"MultiPolygon":for(const c of r.coordinates){const d=c.map(h);a&&ce(a,d)}break;case"GeometryCollection":{let c=f;for(const d of r.geometries){const p=Be(d,e,t,n,i,s,c,a);c+=p}f=c;break}default:throw new Error(`Unsupported geometry type: ${String(r.type)}`)}return f-o}const L=new Set;let Z=!1;function ze(r,e,t=2){const n=e&&e.length,i=n?e[0]*t:r.length;L.size&&L.clear();let s=ke(r,0,i,t,!0);const o=[];if(!s||s.next===s.prev)return o;let a=0,f=0,u=0;if(n&&(s=Ye(r,e,s,t)),r.length>80*t){a=r[0],f=r[1];let h=a,c=f;for(let d=t;d<i;d+=t){const p=r[d],l=r[d+1];p<a&&(a=p),l<f&&(f=l),p>h&&(h=p),l>c&&(c=l)}u=Math.max(h-a,c-f),u=u!==0?32767/u:0}return X(s,o,a,f,u),o}function ke(r,e,t,n,i){let s=null;if(i===tt(r,e,t,n)>0)for(let o=e;o<t;o+=n)s=de(o/n|0,r[o],r[o+1],s);else for(let o=t-n;o>=e;o-=n)s=de(o/n|0,r[o],r[o+1],s);return s&&V(s,s.next)&&(N(s),s=s.next),s}function F(r,e=r){const t=e===r;let n=r,i;do i=!1,n!==n.next&&(L.size===0||!L.has(n))&&(V(n,n.next)||B(n.prev,n,n.next)===0)?((t||n===e)&&(e=n.prev),Z=!0,N(n),n=n.prev,i=!0):(t||n!==e)&&(n=n.next,i=!t);while(i||n!==e);return e}function X(r,e,t,n,i){i&&Ze(r,t,n,i);let s=r,o=!1;for(;r.prev!==r.next;){const a=r.prev,f=r.next;if(B(a,r,f)<0&&(i?Ve(r,t,n,i):Le(r))){e.push(a.i,r.i,f.i),N(r),r=f,s=f;continue}if(r=f,r===s){if(Z=!1,r=F(r),Z){s=r;continue}if(!o){r=Re(r,e),s=r,o=!0;continue}Ne(r,e,t,n,i);break}}}function Le(r){const e=r.prev,t=r,n=r.next,i=e.x,s=t.x,o=n.x,a=e.y,f=t.y,u=n.y,h=Math.min(i,s,o),c=Math.min(a,f,u),d=Math.max(i,s,o),p=Math.max(a,f,u);let l=n.next;for(;l!==e;){if(l.x>=h&&l.x<=d&&l.y>=c&&l.y<=p&&!(i===l.x&&a===l.y)&&W(i,a,s,f,o,u,l.x,l.y)&&B(l.prev,l,l.next)>=0)return!1;l=l.next}return!0}function Ve(r,e,t,n){const i=r.prev,s=r,o=r.next,a=i.x,f=s.x,u=o.x,h=i.y,c=s.y,d=o.y,p=Math.min(a,f,u),l=Math.min(h,c,d),y=Math.max(a,f,u),P=Math.max(h,c,d),_=ee(p,l,e,t,n),b=ee(y,P,e,t,n);let m=r.prevZ;for(;m&&m.z>=_;){if(m.x>=p&&m.x<=y&&m.y>=l&&m.y<=P&&m!==o&&!(a===m.x&&h===m.y)&&W(a,h,f,c,u,d,m.x,m.y)&&B(m.prev,m,m.next)>=0)return!1;m=m.prevZ}let v=r.nextZ;for(;v&&v.z<=b;){if(v.x>=p&&v.x<=y&&v.y>=l&&v.y<=P&&v!==o&&!(a===v.x&&h===v.y)&&W(a,h,f,c,u,d,v.x,v.y)&&B(v.prev,v,v.next)>=0)return!1;v=v.nextZ}return!0}function Re(r,e){let t=r,n=!1;do{const i=t.prev,s=t.next.next;Ce(i,t,t.next,s,!1)&&R(i,s)&&R(s,i)&&(e.push(i.i,t.i,s.i),N(t),N(t.next),t=r=s,n=!0),t=t.next}while(t!==r);return n?F(t):t}function Ne(r,e,t,n,i){let s=r;do{let o=s.next.next;for(;o!==s.prev;){if(s.i!==o.i&&Je(s,o)){let a=be(s,o);s=F(s,s.next),a=F(a,a.next),X(s,e,t,n,i),X(a,e,t,n,i);return}o=o.next}s=s.next}while(s!==r)}let $=!1;function Ye(r,e,t,n){const i=[];for(let s=0,o=e.length;s<o;s++){const a=e[s]*n,f=s<o-1?e[s+1]*n:r.length,u=ke(r,a,f,n,!1);u===u.next&&L.add(u),i.push($e(u))}i.sort(De),Ke(r.length/n,e.length),_e(t,t),$=!0;for(let s=0;s<i.length;s++)t=He(i[s],t);return $=!1,F(t)}function De(r,e){return r.x-e.x||r.y-e.y||(r.next.y-r.y)/(r.next.x-r.x)-(e.next.y-e.y)/(e.next.x-e.x)}function He(r,e){const t=je(r,e);if(!t)return e;const n=be(t,r),i=n.next;return _e(t,i.next),F(n,n.next),F(t,t.next)}const Pe=16;let w=new Float64Array(0),j=0;const J=[],Q=[];function Ke(r,e){const t=Math.ceil((r+2*e)/Pe)+e+2;w.length<t*4&&(w=new Float64Array(t*4)),j=0}function _e(r,e){let t=r;do{const n=j++;J[n]=t;let i=1/0,s=1/0,o=-1/0,a=-1/0,f=0;do{const h=t.next;t.z=n,t.x<i&&(i=t.x),t.x>o&&(o=t.x),t.y<s&&(s=t.y),t.y>a&&(a=t.y),h.x<i&&(i=h.x),h.x>o&&(o=h.x),h.y<s&&(s=h.y),h.y>a&&(a=h.y),t=h}while(++f<Pe&&t!==e);Q[n]=t;const u=n*4;w[u]=i,w[u+1]=s,w[u+2]=o,w[u+3]=a}while(t!==e)}function qe(r,e){const t=r.z*4;e.x<w[t]&&(w[t]=e.x),e.y<w[t+1]&&(w[t+1]=e.y),e.x>w[t+2]&&(w[t+2]=e.x),e.y>w[t+3]&&(w[t+3]=e.y)}function ue(r){let e=Q[r];for(;e.prev.next!==e;)e=e.next;return Q[r]=e,e}function le(r){let e=J[r];for(;e.prev.next!==e;)e=e.next;return J[r]=e,e}function je(r,e){let t=e;const n=r.x,i=r.y;let s=-1/0,o;if(V(r,t))return t;for(let d=0,p=0;d<j;d++,p+=4){if(i<w[p+1]||i>w[p+3]||w[p]>n||w[p+2]<=s)continue;const l=ue(d);t=le(d);do{if(t.prev.next===t){if(V(r,t.next))return t.next;if(i<=t.y&&i>=t.next.y&&t.next.y!==t.y){const y=t.x+(i-t.y)*(t.next.x-t.x)/(t.next.y-t.y);if(y<=n&&y>s&&(s=y,o=t.x<t.next.x?t:t.next,y===n))return o}}t=t.next}while(t!==l)}if(!o)return null;const a=o.x,f=o.y,u=Math.min(i,f),h=Math.max(i,f);let c=1/0;for(let d=0,p=0;d<j;d++,p+=4){if(w[p+2]<a||w[p]>n||w[p+3]<u||w[p+1]>h)continue;const l=ue(d);t=le(d);do{if(t.prev.next===t&&n>=t.x&&t.x>=a&&n!==t.x&&W(i<f?n:s,i,a,f,i<f?s:n,i,t.x,t.y)){const y=Math.abs(i-t.y)/(n-t.x);(R(t,r)||t.y===i&&t.next.y===i&&t.next.x>n)&&(y<c||y===c&&(t.x>o.x||t.x===o.x&&We(o,t)))&&(o=t,c=y)}t=t.next}while(t!==l)}return o}function We(r,e){return B(r.prev,r,e.prev)<0&&B(e.next,r,r.next)<0}const C=[];let G=[],T=new Uint32Array(0),E=new Uint32Array(0);const z=new Uint32Array(256);function Ze(r,e,t,n){let i=r,s=0;do i.z=ee(i.x,i.y,e,t,n),C[s++]=i,i=i.next;while(i!==r);Xe(s);let o=null;for(let a=0;a<s;a++){const f=C[a];f.prevZ=o,o&&(o.nextZ=f),o=f}o.nextZ=null}function Xe(r){if(r<=32){for(let e=1;e<r;e++){const t=C[e],n=t.z;let i=e-1;for(;i>=0&&C[i].z>n;)C[i+1]=C[i],i--;C[i+1]=t}return}T.length<r&&(T=new Uint32Array(r),E=new Uint32Array(r),G=new Array(r));for(let e=0;e<r;e++)T[e]=C[e].z;H(r,C,T,G,E,0),H(r,G,E,C,T,8),H(r,C,T,G,E,16),H(r,G,E,C,T,24)}function H(r,e,t,n,i,s){z.fill(0);for(let a=0;a<r;a++)z[t[a]>>>s&255]++;let o=0;for(let a=0;a<256;a++){const f=z[a];z[a]=o,o+=f}for(let a=0;a<r;a++){const f=t[a],u=z[f>>>s&255]++;n[u]=e[a],i[u]=f}}function ee(r,e,t,n,i){return r=(r-t)*i|0,e=(e-n)*i|0,r=(r|r<<8)&16711935,r=(r|r<<4)&252645135,r=(r|r<<2)&858993459,r=(r|r<<1)&1431655765,e=(e|e<<8)&16711935,e=(e|e<<4)&252645135,e=(e|e<<2)&858993459,e=(e|e<<1)&1431655765,r|e<<1}function $e(r){let e=r,t=r;do(e.x<t.x||e.x===t.x&&e.y<t.y)&&(t=e),e=e.next;while(e!==r);return t}function W(r,e,t,n,i,s,o,a){return(i-o)*(e-a)>=(r-o)*(s-a)&&(r-o)*(n-a)>=(t-o)*(e-a)&&(t-o)*(s-a)>=(i-o)*(n-a)}function Je(r,e){const t=V(r,e)&&B(r.prev,r,r.next)>0&&B(e.prev,e,e.next)>0;return r.next.i!==e.i&&(t||R(r,e)&&R(e,r)&&(B(r.prev,r,e.prev)!==0||B(r,e.prev,e)!==0))&&!Qe(r,e)&&(t||et(r,e))}function B(r,e,t){return(e.y-r.y)*(t.x-e.x)-(e.x-r.x)*(t.y-e.y)}function V(r,e){return r.x===e.x&&r.y===e.y}function Ce(r,e,t,n,i=!0){const s=B(r,e,t),o=B(r,e,n),a=B(t,n,r),f=B(t,n,e);return(s>0&&o<0||s<0&&o>0)&&(a>0&&f<0||a<0&&f>0)?!0:i?!!(s===0&&K(r,t,e)||o===0&&K(r,n,e)||a===0&&K(t,r,n)||f===0&&K(t,e,n)):!1}function K(r,e,t){return e.x<=Math.max(r.x,t.x)&&e.x>=Math.min(r.x,t.x)&&e.y<=Math.max(r.y,t.y)&&e.y>=Math.min(r.y,t.y)}function Qe(r,e){const t=Math.min(r.x,e.x),n=Math.max(r.x,e.x),i=Math.min(r.y,e.y),s=Math.max(r.y,e.y);let o=r;do{const a=o.next;if(o.x>n&&a.x>n||o.x<t&&a.x<t||o.y>s&&a.y>s||o.y<i&&a.y<i){o=a;continue}if(o.i!==r.i&&a.i!==r.i&&o.i!==e.i&&a.i!==e.i&&Ce(o,a,r,e))return!0;o=a}while(o!==r);return!1}function R(r,e){return B(r.prev,r,r.next)<0?B(r,e,r.next)>=0&&B(r,r.prev,e)>=0:B(r,e,r.prev)<0||B(r,r.next,e)<0}function et(r,e){let t=r,n=!1;const i=(r.x+e.x)/2,s=(r.y+e.y)/2;do{const o=t.next;t.y>s!=o.y>s&&i<(o.x-t.x)*(s-t.y)/(o.y-t.y)+t.x&&(n=!n),t=o}while(t!==r);return n}function be(r,e){const t=te(r.i,r.x,r.y),n=te(e.i,e.x,e.y),i=r.next,s=e.prev;return r.next=e,e.prev=r,t.next=i,i.prev=t,n.next=t,t.prev=n,s.next=n,n.prev=s,n}function de(r,e,t,n){const i=te(r,e,t);return n?(i.next=n.next,i.prev=n,n.next.prev=i,n.next=i):(i.prev=i,i.next=i),i}function N(r){r.next.prev=r.prev,r.prev.next=r.next,r.prevZ&&(r.prevZ.nextZ=r.nextZ),r.nextZ&&(r.nextZ.prevZ=r.prevZ),$&&qe(r.prev,r.next)}function te(r,e,t){return{i:r,x:e,y:t,prev:null,next:null,z:0,prevZ:null,nextZ:null}}function tt(r,e,t,n){let i=0;for(let s=e,o=t-n;s<t;s+=n)i+=(r[o]-r[s])*(r[s+1]+r[o+1]),o=s;return i}function rt(){return{vertexCount:0,indexCount:0,positions:new Float32Array(0),featureIds:new Uint32Array(0),styleIds:new Uint16Array(0),indices:new Uint32Array(0)}}const he=4;function nt(r,e,t,n,i,s){if(s.length===0)return rt();const o=[],a=[],f=[],u=[];for(const h of s){let c=h.ringStart,d=h.vertexStart;for(let p=0;p<h.partCount;p++){const l=n[h.partStart+p],y=[];for(let g=0;g<l;g++){const k=i[c+g];y.push({start:d,len:k}),d+=k}c+=l;const P=y[0];if(P===void 0||P.len<he)continue;const _=y.slice(1).filter(g=>g.len>=he),b=[],m=[],v=o.length/2,Y=g=>{for(let k=0;k<g.len;k++){const U=g.start+k,O=r[U*2],A=r[U*2+1];b.push(O,A),o.push(O,A),a.push(e[U]),f.push(t[U])}};Y(P);for(const g of _)m.push(b.length/2),Y(g);const x=ze(b,m.length>0?m:void 0,2);for(const g of x)u.push(v+g)}}return{vertexCount:o.length/2,indexCount:u.length,positions:Float32Array.from(o),featureIds:Uint32Array.from(a),styleIds:Uint16Array.from(f),indices:Uint32Array.from(u)}}class se{vertexCount;indexCount;positionBuffer;featureIdBuffer;styleIdBuffer;indexBuffer;static byteSizesForCounts(e,t){const n=e*8,i=e*4,s=e*4,o=t*4;return{positionBytes:n,featureIdBytes:i,styleGpuBytes:s,indexBytes:o}}constructor(e,t,n){const{vertexCount:i,indexCount:s}=t;if(i<0)throw new Error("vertexCount must be non-negative");if(s<0)throw new Error("indexCount must be non-negative");this.vertexCount=i,this.indexCount=s;const{positionBytes:o,featureIdBytes:a,styleGpuBytes:f,indexBytes:u}=se.byteSizesForCounts(i,s);if(t.positions.byteLength<o)throw new Error("positions ArrayBuffer smaller than vertexCount * 8");if(t.featureIds.byteLength<a)throw new Error("featureIds ArrayBuffer smaller than vertexCount * 4");if(t.styleIds.byteLength<i*2)throw new Error("styleIds ArrayBuffer smaller than vertexCount * 2");if(t.indices.byteLength<u)throw new Error("indices ArrayBuffer smaller than indexCount * 4");const h=GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,c=GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST,d=l=>n!==void 0?n.acquire(l):e.createBuffer({size:Math.max(l,4),usage:h});this.positionBuffer=d(o),this.featureIdBuffer=d(a),this.styleIdBuffer=d(f),this.indexBuffer=e.createBuffer({size:Math.max(u,4),usage:c});const p=e.queue;if(o>0){p.writeBuffer(this.positionBuffer,0,t.positions.buffer,t.positions.byteOffset,o),p.writeBuffer(this.featureIdBuffer,0,t.featureIds.buffer,t.featureIds.byteOffset,a);const l=new Uint8Array(f);for(let y=0;y<i;y++){const P=t.styleIds[y],_=y*4;l[_]=P&255,l[_+1]=P>>8&255}p.writeBuffer(this.styleIdBuffer,0,l.buffer,0,f)}u>0&&p.writeBuffer(this.indexBuffer,0,t.indices.buffer,t.indices.byteOffset,u)}destroy(e){e!==void 0?(e.release(this.positionBuffer),e.release(this.featureIdBuffer),e.release(this.styleIdBuffer)):(this.positionBuffer.destroy(),this.featureIdBuffer.destroy(),this.styleIdBuffer.destroy()),this.indexBuffer.destroy()}}const it=`
struct PickUniforms {
  view_proj: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> pick_u: PickUniforms;

struct VsPickOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) @interpolate(flat) fid: u32,
}

@vertex
fn vs_pick(
  @location(0) pos: vec2<f32>,
  @location(1) fid: u32,
) -> VsPickOut {
  var o: VsPickOut;
  o.clip = pick_u.view_proj * vec4<f32>(pos.x, pos.y, 0.0, 1.0);
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
`,pe=64,ye={color:[.4,.7,.9,.85]},q=256,st=`
struct FrameUniforms {
  view_proj: mat4x4<f32>,
  style_meta: vec4<u32>,
}

/**
 * CPU/WGSL stride, calculated and documented explicitly (Stage 6.2.1 lesson: never assume
 * a struct's array stride without working through WGSL's alignment rules by hand).
 *
 * Member layout: \`color: vec4<f32>\` — offset 0, size 16 bytes, align 16 bytes. There is no
 * trailing field after it (deliberately — see \`PolygonStyle\`'s doc), so there is nothing
 * whose own alignment could get pushed to an unexpected offset the way \`GpuStyle\`'s old
 * trailing \`vec3<f32>\` pad was in \`points-wgsl.ts\` before Stage 6.2.1. A struct's overall
 * alignment is the max alignment of its members (16 here) and its size rounds up to a
 * multiple of that alignment: raw content size is already 16, which is already a multiple
 * of 16, so no rounding is needed. Struct size == array stride == 16 bytes.
 *
 * The CPU-side style-table packer (\`WebGpuPolygonRenderer.setStyleTable\`) writes exactly
 * 4 \`f32\`s (16 bytes) per style — \`o = i * 4\`, \`f32[o+0..3] = color\` — matching this
 * struct's 16-byte stride exactly, by construction, not by coincidence.
 */
struct GpuPolygonStyle {
  color: vec4<f32>,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<storage, read> style_table: array<GpuPolygonStyle>;

struct VsOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) color: vec4<f32>,
}

/**
 * Real triangulated geometry (Stage 6.5's \`PreparedPolygonGeometry\`, drawn via
 * \`drawIndexed\`) — no instanced quad, no screen-space extrusion, no pixel-space math at
 * all. \`pos\` is a prepared world-coordinate vertex; the only transform applied is the
 * caller-supplied \`view_proj\`. No triangulation or projection logic lives in this shader.
 */
@vertex
fn vs_main(
  @location(0) pos: vec2<f32>,
  @location(1) style_id: u32,
) -> VsOut {
  let n_styles = frame.style_meta.x;
  let sid = select(0u, min(style_id, n_styles - 1u), n_styles > 0u);
  let st = style_table[sid];

  var o: VsOut;
  o.clip_pos = frame.view_proj * vec4<f32>(pos.x, pos.y, 0.0, 1.0);
  o.color = st.color;
  return o;
}

@fragment
fn fs_main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
  return color;
}
`,xe=80;class I{device;format;canvas;pipeline;frameUniformBuffer;styleStorageBuffer;bindGroup;frameUniformStaging=new ArrayBuffer(xe);frameF32=new Float32Array(this.frameUniformStaging,0,16);frameU32=new Uint32Array(this.frameUniformStaging,64,4);styles=[];chunks=new Map;drawOrder=[];lruOrder=[];residentBytes=0;nextAnonChunkKey=0;gpuBufferPool=null;pickPipeline=null;pickBindGroup=null;pickUniformBuffer=null;pickTexture=null;pickTextureView=null;readbackBuffer=null;pickTexW=0;pickTexH=0;pendingPickPromise=null;constructor(e,t,n,i,s,o,a,f){this.device=e,this.format=t,this.canvas=n,this.pipeline=i,this.frameUniformBuffer=s,this.styleStorageBuffer=o,this.bindGroup=a,this.setStyleTable(f.length>0?f:[ye])}static async create(e){const{device:t,format:n,canvas:i}=e,s=I.createPipeline(t,n),o=t.createBuffer({size:xe,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),a=t.createBuffer({size:q*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),f=t.createBindGroup({layout:s.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:o}},{binding:1,resource:{buffer:a}}]});return new I(t,n,i,s,o,a,f,e.styles??[ye])}static createPipeline(e,t){const n=e.createShaderModule({code:st});return e.createRenderPipeline({layout:"auto",vertex:{module:n,entryPoint:"vs_main",buffers:[{arrayStride:8,stepMode:"vertex",attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]},{arrayStride:4,stepMode:"vertex",attributes:[{shaderLocation:1,offset:0,format:"uint16"}]}]},fragment:{module:n,entryPoint:"fs_main",targets:[{format:t,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}})}getDevice(){return this.device}getCanvasFormat(){return this.format}setStyleTable(e){if(e.length===0)throw new Error("At least one style is required");if(e.length>q)throw new Error(`At most ${q} styles`);this.styles=e.map(n=>({...n,color:[...n.color]}));const t=new Float32Array(q*4);for(let n=0;n<this.styles.length;n++){const i=this.styles[n],s=n*4;t[s+0]=i.color[0],t[s+1]=i.color[1],t[s+2]=i.color[2],t[s+3]=i.color[3]}this.device.queue.writeBuffer(this.styleStorageBuffer,0,t.buffer,0,this.styles.length*16)}ingestPolygonGeometry(e,t){const n=t?.chunkKey??`__anon:${this.nextAnonChunkKey++}`,i=this.chunks.get(n),s=this.gpuBufferPool??void 0;if(e.vertexCount===0){i!==void 0&&(i.destroy(s),this.residentBytes-=I.chunkByteSize(i),this.chunks.delete(n),this.spliceKeyFromOrders(n));return}i!==void 0&&(i.destroy(s),this.residentBytes-=I.chunkByteSize(i));const o=new se(this.device,e,s);this.chunks.set(n,o),this.residentBytes+=I.chunkByteSize(o),i===void 0&&this.drawOrder.push(n),this.touchLru(n)}ingestTransferredWorkerPolygonChunk(e,t){const n={vertexCount:e.polygonVertexCount,indexCount:e.polygonIndexCount,positions:new Float32Array(e.polygonPositions,0,e.polygonVertexCount*2),featureIds:new Uint32Array(e.polygonFeatureIds,0,e.polygonVertexCount),styleIds:new Uint16Array(e.polygonStyleIds,0,e.polygonVertexCount),indices:new Uint32Array(e.polygonIndices,0,e.polygonIndexCount)};this.ingestPolygonGeometry(n,t)}removeChunkByKey(e){const t=this.chunks.get(e);return t===void 0?!1:(t.destroy(this.gpuBufferPool??void 0),this.residentBytes-=I.chunkByteSize(t),this.chunks.delete(e),this.spliceKeyFromOrders(e),!0)}evictOldestChunk(){for(;this.lruOrder.length>0;){const e=this.lruOrder.shift();if(this.chunks.has(e))return this.removeChunkByKey(e),e}}evictOldestChunks(e){const t=[];for(let n=0;n<e;n++){const i=this.evictOldestChunk();if(i===void 0)break;t.push(i)}return t}clearChunks(){const e=this.gpuBufferPool??void 0;for(const t of this.chunks.values())t.destroy(e);this.chunks.clear(),this.drawOrder.length=0,this.lruOrder.length=0,this.residentBytes=0}getChunkCount(){return this.chunks.size}getChunkKeys(){return[...this.drawOrder]}getResidentBytes(){return this.residentBytes}getChunkByteSize(e){const t=this.chunks.get(e);return t===void 0?0:I.chunkByteSize(t)}getStats(){let e=0;for(const t of this.chunks.values())e+=t.indexCount/3;return{totalTriangles:e,chunkCount:this.chunks.size,residentBytes:this.residentBytes,drawCalls:this.drawOrder.length}}static chunkByteSize(e){return e.positionBuffer.size+e.featureIdBuffer.size+e.styleIdBuffer.size+e.indexBuffer.size}touchLru(e){const t=this.lruOrder.indexOf(e);t>=0&&this.lruOrder.splice(t,1),this.lruOrder.push(e)}spliceKeyFromOrders(e){const t=this.drawOrder.indexOf(e);t>=0&&this.drawOrder.splice(t,1);const n=this.lruOrder.indexOf(e);n>=0&&this.lruOrder.splice(n,1)}encodeRenderPass(e,t,n){const i=t.getClipMatrix();this.frameF32.set(i),this.frameU32[0]=this.styles.length,this.frameU32[1]=0,this.frameU32[2]=0,this.frameU32[3]=0,this.device.queue.writeBuffer(this.frameUniformBuffer,0,this.frameUniformStaging),e.setPipeline(this.pipeline),e.setBindGroup(0,this.bindGroup);for(const s of this.drawOrder){const o=this.chunks.get(s);o===void 0||o.indexCount<=0||(e.setVertexBuffer(0,o.positionBuffer,0,o.vertexCount*8),e.setVertexBuffer(1,o.styleIdBuffer,0,o.vertexCount*4),e.setIndexBuffer(o.indexBuffer,"uint32",0,o.indexCount*4),e.drawIndexed(o.indexCount,1,0,0,0))}n.timeMs}async pickFeatureIdAtCanvasPixel(e,t,n){await this.pendingPickPromise;const i=this.performPickOperation(e,t,n);this.pendingPickPromise=i;try{return await i}finally{this.pendingPickPromise=null}}async performPickOperation(e,t,n){const i=this.canvas.width,s=this.canvas.height;if(i<=0||s<=0)return null;const o=Math.floor(e),a=Math.floor(t);if(o<0||a<0||o>=i||a>=s)return null;this.ensurePickResources(),this.ensurePickTextureSize(i,s);const f=n.getClipMatrix(),u=new ArrayBuffer(pe);new Float32Array(u,0,16).set(f),this.device.queue.writeBuffer(this.pickUniformBuffer,0,u);const h=this.device.createCommandEncoder(),c=h.beginRenderPass({colorAttachments:[{view:this.pickTextureView,clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});c.setPipeline(this.pickPipeline),c.setBindGroup(0,this.pickBindGroup),c.setViewport(0,0,i,s,0,1),c.setScissorRect(o,a,1,1);for(const p of this.drawOrder){const l=this.chunks.get(p);l===void 0||l.indexCount<=0||(c.setVertexBuffer(0,l.positionBuffer,0,l.vertexCount*8),c.setVertexBuffer(1,l.featureIdBuffer,0,l.vertexCount*4),c.setIndexBuffer(l.indexBuffer,"uint32",0,l.indexCount*4),c.drawIndexed(l.indexCount,1,0,0,0))}c.end(),h.copyTextureToBuffer({texture:this.pickTexture,origin:{x:o,y:a,z:0}},{buffer:this.readbackBuffer,bytesPerRow:256,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.device.queue.submit([h.finish()]),await this.device.queue.onSubmittedWorkDone();const d=this.readbackBuffer;await d.mapAsync(GPUMapMode.READ);try{const p=new Uint8Array(d.getMappedRange(0,4));return we(p,0)}finally{d.unmap()}}ensurePickResources(){if(this.pickPipeline)return;const e=this.device.createShaderModule({code:it});this.pickPipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:e,entryPoint:"vs_pick",buffers:[{arrayStride:8,stepMode:"vertex",attributes:[{shaderLocation:0,offset:0,format:"float32x2"}]},{arrayStride:4,stepMode:"vertex",attributes:[{shaderLocation:1,offset:0,format:"uint32"}]}]},fragment:{module:e,entryPoint:"fs_pick",targets:[{format:"rgba8unorm"}]},primitive:{topology:"triangle-list"}}),this.pickUniformBuffer=this.device.createBuffer({size:pe,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.pickBindGroup=this.device.createBindGroup({layout:this.pickPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.pickUniformBuffer}}]}),this.readbackBuffer=this.device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})}ensurePickTextureSize(e,t){this.pickTexture&&this.pickTexW===e&&this.pickTexH===t||(this.pickTexture?.destroy(),this.pickTexture=this.device.createTexture({size:{width:e,height:t,depthOrArrayLayers:1},format:"rgba8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),this.pickTextureView=this.pickTexture.createView(),this.pickTexW=e,this.pickTexH=t)}release(){this.clearChunks(),this.frameUniformBuffer.destroy(),this.styleStorageBuffer.destroy(),this.pickTexture?.destroy(),this.readbackBuffer?.destroy(),this.pickUniformBuffer?.destroy(),this.pickPipeline=null,this.pickBindGroup=null,this.pickUniformBuffer=null,this.pickTexture=null,this.pickTextureView=null,this.readbackBuffer=null,this.pickTexW=0,this.pickTexH=0}}const M=[{id:0,x:-4e5,y:4e5,label:"NW anchor"},{id:1,x:4e5,y:4e5,label:"NE anchor"},{id:2,x:4e5,y:-4e5,label:"SE anchor"},{id:3,x:-4e5,y:-4e5,label:"SW anchor"},{id:4,x:0,y:0,label:"center"}],re=[{id:100,coords:[[-6e5,2e5],[-2e5,2e5],[0,6e5],[2e5,2e5],[6e5,2e5]],label:"zigzag (north)"},{id:101,coords:[[-6e5,-2e5],[0,-6e5],[6e5,-2e5]],label:"V-shape (south)"}],ge=new Map(M.map(r=>[r.id,r.label])),me=new Map(re.map(r=>[r.id,r.label])),ot=4294967294,ne=[{id:500,styleId:0,label:"square",rings:[[[5e4,3e5],[25e4,3e5],[25e4,45e4],[5e4,45e4],[5e4,3e5]]]},{id:501,styleId:0,label:"L-shape (concave)",rings:[[[-58e4,-58e4],[-38e4,-58e4],[-38e4,-48e4],[-48e4,-48e4],[-48e4,-38e4],[-58e4,-38e4],[-58e4,-58e4]]]},{id:502,styleId:1,label:"frame (hole)",rings:[[[3e5,-58e4],[58e4,-58e4],[58e4,-45e4],[3e5,-45e4],[3e5,-58e4]],[[38e4,-55e4],[5e5,-55e4],[5e5,-48e4],[38e4,-48e4],[38e4,-55e4]]]},{id:ot,styleId:1,label:"high-FeatureId square",rings:[[[-1e5,5e4],[0,5e4],[0,15e4],[-1e5,15e4],[-1e5,5e4]]]}],ve=new Map(ne.map(r=>[r.id,r.label]));function at(){const r=new Float32Array(M.length*2),e=new Uint32Array(M.length),t=new Uint16Array(M.length+M.length%2);return M.forEach((n,i)=>{r[i*2]=n.x,r[i*2+1]=n.y,e[i]=n.id,t[i]=n.id===4?1:0}),{positions:r,featureIds:e,styleIds:t}}function ft(){let r=0;for(const o of re)r+=o.coords.length;const e=new Float32Array(r*2),t=new Uint32Array(r),n=new Uint16Array(r),i=[];let s=0;for(const o of re){const a=s;for(const[f,u]of o.coords)e[s*2]=f,e[s*2+1]=u,t[s]=o.id,n[s]=o.id===101?1:0,s+=1;i.push({id:o.id,geometryKind:"line",vertexStart:a,vertexCount:o.coords.length,properties:{label:o.label}})}return{buffer:{positions:e,featureIds:t,styleIds:n},records:i}}function ct(){let r=0;for(const a of ne)for(const f of a.rings)r+=f.length;const e=new Float32Array(r*2),t=new Uint32Array(r),n=new Uint16Array(r),i=Ee(),s=[];let o=0;for(const a of ne){const f=i.partRingCounts.length,u=i.ringVertexCounts.length,h=Be({type:"Polygon",coordinates:a.rings},e,t,n,a.id,a.styleId,o,i),c=i.partRingCounts.length-f,d=i.ringVertexCounts.length-u;c>0&&s.push({vertexStart:o,ringStart:u,ringCount:d,partStart:f,partCount:c}),o+=h}return nt(e,t,n,i.partRingCounts,i.ringVertexCounts,s)}async function ut(){if(!navigator.gpu){alert("WebGPU is not supported in this browser");return}const r=document.getElementById("map-canvas"),e=document.getElementById("canvas-container"),t=document.getElementById("zoom-display"),n=document.getElementById("rotation-display"),i=document.getElementById("pick-display"),{width:s,height:o}=e.getBoundingClientRect();r.width=s,r.height=o;const a=await Ue.create({canvas:r,alphaMode:"premultiplied",styles:[{color:[.25,.75,1,1],sizePx:14},{color:[1,.85,.2,1],sizePx:20}]});a.useSingleGeometryLayout(),a.setPickPointDiameterPx(20);const f=await S.create({device:a.getDevice(),format:a.getCanvasFormat(),canvas:r,styles:[{color:[1,.55,.15,1],widthPx:6},{color:[.6,1,.5,1],widthPx:6}]});f.setPickWidthPx(14);const u=await I.create({device:a.getDevice(),format:a.getCanvasFormat(),canvas:r,styles:[{color:[.35,.78,.4,.75]},{color:[.75,.4,.85,.75]}]}),h=at();a.setGeometry({buffer:h,vertexCount:M.length});const{buffer:c,records:d}=ft(),p=Fe(c,d);f.ingestLineSegments(p,{chunkKey:"demo-lines"});const l=ct();u.ingestPolygonGeometry(l,{chunkKey:"demo-polygons"});let y=new Se([0,0],6,0,[s,o]);function P(){t.textContent=y.zoom.toFixed(2),n.textContent=(y.rotation*180/Math.PI).toFixed(1)}P();function _(){a.setMapToClipMatrix(y.getClipMatrix());const x=a.getDevice().createCommandEncoder(),g=a.getContext().getCurrentTexture().createView(),k=x.beginRenderPass({colorAttachments:[{view:g,clearValue:{r:.04,g:.06,b:.1,a:1},loadOp:"clear",storeOp:"store"}]});u.encodeRenderPass(k,y,{timeMs:performance.now()}),f.encodeRenderPass(k,y,{timeMs:performance.now()}),a.encodeRenderPass(k,{timeMs:performance.now()}),k.end(),a.getDevice().queue.submit([x.finish()])}let b=!1,m=0,v=0;r.addEventListener("mousedown",x=>{b=!0,m=x.clientX,v=x.clientY}),window.addEventListener("mouseup",()=>{b=!1}),r.addEventListener("mousemove",x=>{if(!b)return;const g=x.clientX-m,k=x.clientY-v;y=Ie(y,-g,k),m=x.clientX,v=x.clientY,P(),_()}),r.addEventListener("wheel",x=>{x.preventDefault();const g=x.deltaY>0?.9:1.1;y=Oe(y,g),P(),_()}),window.addEventListener("keydown",x=>{x.key==="q"||x.key==="Q"?(y=y.rotateBy(-.08),P(),_()):(x.key==="e"||x.key==="E")&&(y=y.rotateBy(.08),P(),_())});function Y(x){const g=r.getBoundingClientRect();return[(x.clientX-g.left)/g.width*r.width,(x.clientY-g.top)/g.height*r.height]}r.addEventListener("click",async x=>{const[g,k]=Y(x),U=await f.pickFeatureIdAtCanvasPixel(g,k,y);if(U!==null&&me.has(U)){i.textContent=`line #${U} (${me.get(U)})`;return}const O=await a.pickFeatureIdAtCanvasPixel(g,k);if(O!==null&&ge.has(O)){i.textContent=`point #${O} (${ge.get(O)})`;return}const A=await u.pickFeatureIdAtCanvasPixel(g,k,y);if(A!==null&&ve.has(A)){i.textContent=`polygon #${A} (${ve.get(A)})`;return}i.textContent="—"}),new ResizeObserver(()=>{const x=e.getBoundingClientRect();r.width=x.width,r.height=x.height,a.resizeBackingStore(x.width,x.height),y=y.resize(x.width,x.height),_()}).observe(e),_()}ut().catch(r=>{console.error("Initialization failed:",r)});
//# sourceMappingURL=points-lines-demo-CjbLTgPx.js.map
