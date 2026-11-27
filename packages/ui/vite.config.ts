/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    assetsDir: "assets",
  },
  base: process.env.ELECTRON_BUILD ? "./" : "/",
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Child processes, not worker threads: a test that switches the timezone
    // (process.env.TZ) only takes effect in a process of its own.
    pool: "forks",
    env: {
      VITE_API_URL: "http://localhost:3011",
    },
  },
});
