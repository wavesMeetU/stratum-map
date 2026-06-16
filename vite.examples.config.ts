import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Vite configuration for building example projects for smoke testing.
 *
 * Builds complete examples (those with both index.html and main.ts) into dist-examples/.
 * Serves on port 4179 for smoke test execution.
 *
 * Usage:
 *   npm run build:examples
 *   npm run test:smoke
 */
export default defineConfig({
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, "dist-examples"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    minify: "esbuild",
    rollupOptions: {
      input: {
        "index": resolve(__dirname, "examples/index.html"),
        "global-cell-towers": resolve(__dirname, "examples/global-cell-towers/index.html"),
        "minimal-native": resolve(__dirname, "examples/minimal-native/index.html"),
        "standalone-rendering": resolve(__dirname, "examples/standalone-rendering/index.html"),
      },
    },
  },
  // Disable HMR for production builds to prevent WebSocket 404 errors
  server: {
    hmr: false,
  },
});
