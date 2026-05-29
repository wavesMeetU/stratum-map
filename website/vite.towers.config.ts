import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Bundles the Global Cell Towers demo into `website/static/demos/towers/`
 * for GitHub Pages. Demonstrates massive-scale WebGPU point rendering
 * with custom binary format, Cloudflare R2 delivery, and GPU-native architecture.
 */
export default defineConfig({
  root: resolve(__dirname, "../examples/global-cell-towers"),
  base: "./",
  build: {
    outDir: resolve(__dirname, "static/demos/towers"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "../examples/global-cell-towers/index.html"),
    },
  },
  resolve: {
    alias: {
      "stratum-map": resolve(__dirname, "../dist/index.js"),
    },
  },
  server: {
    port: 4176,
    host: "127.0.0.1",
  },
});