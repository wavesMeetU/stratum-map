import { resolve } from "node:path";
import { defineConfig } from "vite";

/** GPU text labels demo → `website/static/demos/text/` */
export default defineConfig({
  root: resolve(__dirname, "demo-pages/text"),
  base: "./",
  publicDir: resolve(__dirname, "demo-pages/text/public"),
  build: {
    outDir: resolve(__dirname, "static/demos/text"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "demo-pages/text/index.html"),
    },
  },
  resolve: {
    alias: {
      "stratum-map": resolve(__dirname, "../dist/index.js"),
    },
  },
});
