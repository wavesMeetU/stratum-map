import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "examples/pan-zoom-bench"),
  build: {
    outDir: resolve(__dirname, "dist-bench"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
});
