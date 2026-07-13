/**
 * Screen-space segment extrusion (Stage 6.1/6.2): each segment is drawn as an instanced
 * quad (6 vertices via `corner`, exactly like `points-wgsl.ts`'s point sprite technique),
 * extruded perpendicular to the segment's on-screen direction by a pixel half-width.
 *
 * `corner.x` selects which endpoint (-1 = start, +1 = end); `corner.y` selects which side
 * of the segment (-1/+1). No projection logic — `view_proj` is consumed opaquely, exactly
 * as in the point shader.
 */
export const LINES_WGSL = /* wgsl */ `
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
`;

export const LINE_FRAME_UNIFORM_BYTE_LENGTH = 96;
