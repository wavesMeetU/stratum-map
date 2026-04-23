/**
 * Placeholder for future in-browser MSDF generation (e.g. wasm msdfgen).
 * Prefer prebuilt JSON+PNG (`MsdfGlyphAtlas.fromJsonAndImageBitmap`) or offline CLI today.
 */
export function isWasmMsdfAtlasAvailable(): boolean {
  return false;
}

export async function generateMsdfAtlasWasm(): Promise<never> {
  throw new Error(
    "WASM MSDF generation is not bundled yet. Use scripts/gen-demo-msdf-atlas.mjs or msdf-atlas-gen offline.",
  );
}
