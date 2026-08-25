import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      // Keep peak memory down so the build survives on the small VPS.
      maxParallelFileOps: 2,
      output: {
        manualChunks: {
          mapbox: ["mapbox-gl"],
        },
      },
    },
  },
});
