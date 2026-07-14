export const POLYGONS_WGSL = /* wgsl */ `
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
`;

/** \`mat4x4<f32>\` (64 bytes) + \`vec4<u32>\` (16 bytes) — both already 16-byte-aligned, no padding needed. */
export const FRAME_UNIFORM_BYTE_LENGTH = 80;
