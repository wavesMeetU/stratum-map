import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Bundles the flagship OL + WebGPU demo into `website/static/demo/`
 * for GitHub Pages (any subpath — assets use relative URLs).
 */
export default defineConfig({
  root: resolve(__dirname, "demo-pages/flagship"),
  base: "./",
  build: {
    outDir: resolve(__dirname, "static/demos/flagship"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "demo-pages/flagship/index.html"),
    },
  },
  resolve: {
    alias: {
      "stratum-map": resolve(__dirname, "../dist/index.js"),
    },
  },
});
