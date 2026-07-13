/**
 * Offscreen pick pass for line segments: same screen-space extrusion as `lines-wgsl.ts`
 * (duplicated here — WebGPU has no cross-shader-module linking, matching the existing
 * `points-wgsl.ts`/`pick-points-wgsl.ts` pattern), with a single pick-only width
 * (`pick_u.params.x`, independent of each line's own visual style width, mirroring
 * `pickPointDiameterPx`) and `fid + 1` encoded into `rgba8unorm` with no blending.
 */
export const PICK_LINES_WGSL = /* wgsl */ `
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
`;

export const PICK_LINE_UNIFORM_BYTE_LENGTH = 96;
