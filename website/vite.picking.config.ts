import { resolve } from "node:path";
import { defineConfig } from "vite";

/** GPU picking demo → `website/static/demos/picking/` */
export default defineConfig({
  root: resolve(__dirname, "demo-pages/picking"),
  base: "./",
  build: {
    outDir: resolve(__dirname, "static/demos/picking"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "demo-pages/picking/index.html"),
    },
  },
  resolve: {
    alias: {
      "stratum-map": resolve(__dirname, "../dist/index.js"),
    },
  },
});
