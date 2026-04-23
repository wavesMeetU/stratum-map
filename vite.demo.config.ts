import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "examples/demo"),
  build: {
    outDir: resolve(__dirname, "dist-demo"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      input: resolve(__dirname, "examples/demo/index.html"),
    },
  },
});
