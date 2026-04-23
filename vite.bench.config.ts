import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "examples/pan-zoom-bench"),
  build: {
    outDir: resolve(__dirname, "dist-bench"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "examples/pan-zoom-bench/index.html"),
        geojsonWorkerTest: resolve(__dirname, "examples/pan-zoom-bench/geojson-worker-test.html"),
      },
    },
  },
});
