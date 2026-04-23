#!/usr/bin/env node
/**
 * Builds a portable ASCII (32–126) atlas for the demo without native msdfgen.
 * Per-cell 32×32 masks + Euclidean signed distance; encodes distance in R=G=B (mono-MSDF, median-safe).
 *
 * Output: examples/demo/public/msdf/atlas.png + atlas.json
 */
import { createCanvas, ImageData } from "canvas";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "examples/demo/public/msdf");

const ASCII_FIRST = 32;
const ASCII_LAST = 126;
const COLS = 16;
const ROWS = 6;
const CELL = 32;
const RANGE = 6;

function cellSdfRgba(w, h, drawFn) {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  drawFn(ctx, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    a[i] = img.data[i * 4 + 3];
  }
  const inside = (i) => a[i] > 140;
  const dist = (i, j) => {
    const x1 = i % w;
    const y1 = Math.floor(i / w);
    const x2 = j % w;
    const y2 = Math.floor(j / w);
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let best = 1e9;
    const ins = inside(i);
    for (let j = 0; j < w * h; j++) {
      if (inside(j) === ins) {
        continue;
      }
      const d = dist(i, j);
      if (d < best) {
        best = d;
      }
    }
    if (best > 1e8) {
      best = 0;
    }
    const sd = ins ? best : -best;
    const t = Math.max(-1, Math.min(1, sd / RANGE));
    const b = Math.round(128 + 127 * t);
    const o = i * 4;
    out[o] = b;
    out[o + 1] = b;
    out[o + 2] = b;
    out[o + 3] = 255;
  }
  return out;
}

function drawChar(ctx, w, h, ch) {
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = `${Math.floor(h * 0.58)}px monospace`;
  ctx.fillText(ch, w * 0.5, h * 0.52);
}

function encodePng(width, height, rgba) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const id = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(id, 0, 0);
  return canvas.toBuffer("image/png");
}

const atlasW = COLS * CELL;
const atlasH = ROWS * CELL;
const rgba = new Uint8Array(atlasW * atlasH * 4);
for (let i = 0; i < atlasW * atlasH; i++) {
  rgba[i * 4 + 3] = 255;
}

const glyphs = [];
for (let code = ASCII_FIRST; code <= ASCII_LAST; code++) {
  const idx = code - ASCII_FIRST;
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  const cellRgba = cellSdfRgba(CELL, CELL, (ctx, w, h) => drawChar(ctx, w, h, String.fromCharCode(code)));
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const ax = col * CELL + x;
      const ay = row * CELL + y;
      const si = (y * CELL + x) * 4;
      const di = (ay * atlasW + ax) * 4;
      rgba[di] = cellRgba[si];
      rgba[di + 1] = cellRgba[si + 1];
      rgba[di + 2] = cellRgba[si + 2];
      rgba[di + 3] = cellRgba[si + 3];
    }
  }
  glyphs.push({
    unicode: code,
    advance: CELL * 0.52,
    atlasBounds: {
      left: col * CELL,
      top: row * CELL,
      right: (col + 1) * CELL,
      bottom: (row + 1) * CELL,
    },
  });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const png = encodePng(atlasW, atlasH, rgba);
fs.writeFileSync(path.join(OUT_DIR, "atlas.png"), png);

const json = {
  version: 1,
  atlas: {
    type: "msdf",
    width: atlasW,
    height: atlasH,
    distanceRange: RANGE,
  },
  metrics: {
    emSize: CELL,
    lineHeight: CELL,
  },
  glyphs,
};
fs.writeFileSync(path.join(OUT_DIR, "atlas.json"), JSON.stringify(json, null, 2));
console.log(`Wrote ${OUT_DIR}/atlas.png (${atlasW}x${atlasH}) and atlas.json`);
