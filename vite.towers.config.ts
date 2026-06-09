import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "examples/global-cell-towers"),
  build: {
    outDir: resolve(__dirname, "dist-towers"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
  server: {
    port: 4175,
    host: "127.0.0.1",
  },
});
