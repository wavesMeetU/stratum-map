/**
 * Run: npm run build && node --test tests/msdf-text.spec.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { parseMsdfAtlasJson } from "../dist/text/msdf-atlas-loader.js";
import { isWasmMsdfAtlasAvailable, generateMsdfAtlasWasm } from "../dist/text/msdf-wasm-stub.js";
import { TEXT_WGSL } from "../dist/text/shaders/text-wgsl.js";

describe("MSDF atlas JSON", () => {
  it("parses shipped demo atlas.json", () => {
    const json = readFileSync(resolve("examples/demo/public/msdf/atlas.json"), "utf8");
    const parsed = parseMsdfAtlasJson(json);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.atlas.width, 512);
    assert.equal(parsed.atlas.height, 192);
    assert.equal(parsed.metrics.emSize, 32);
    assert.ok(parsed.glyphs.length > 80);
  });

  it("rejects unsupported version", () => {
    assert.throws(() => parseMsdfAtlasJson(JSON.stringify({ version: 2, atlas: {}, metrics: {}, glyphs: [] })));
  });
});

describe("MSDF wasm stub", () => {
  it("reports wasm path unavailable until bundled", () => {
    assert.equal(isWasmMsdfAtlasAvailable(), false);
  });

  it("generateMsdfAtlasWasm throws with actionable message", async () => {
    await assert.rejects(generateMsdfAtlasWasm(), /WASM MSDF generation is not bundled/);
  });
});

describe("text.wgsl (MSDF path)", () => {
  it("embeds median MSDF decode and atlas_mode branching", () => {
    assert.match(TEXT_WGSL, /fn median3/);
    assert.match(TEXT_WGSL, /atlas_mode/);
    assert.match(TEXT_WGSL, /median3\(t\.r, t\.g, t\.b\)/);
    assert.match(TEXT_WGSL, /screen_px_range/);
  });
});
