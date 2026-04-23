/** Offscreen pick pass: encodes `(featureId + 1)` into `rgba8unorm` with no blending. */
export const PICK_POINTS_WGSL = /* wgsl */ `
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
`;

export const PICK_UNIFORM_BYTE_LENGTH = 96;
