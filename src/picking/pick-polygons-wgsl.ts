/**
 * Offscreen pick pass for polygons: draws the exact same indexed triangle mesh as the
 * visual pass (`polygons-wgsl.ts`) — no separate hit-width/tolerance concept exists for a
 * filled area the way it does for points (diameter) or lines (pick width): the polygon's
 * own triangulated interior IS the hit region. `fid + 1` is encoded into `rgba8unorm` with
 * no blending, mirroring `pick-points-wgsl.ts`/`pick-lines-wgsl.ts` exactly.
 */
export const PICK_POLYGONS_WGSL = /* wgsl */ `
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
`;

/** \`mat4x4<f32>\` only — 64 bytes, already 16-byte-aligned. */
export const PICK_POLYGON_UNIFORM_BYTE_LENGTH = 64;
