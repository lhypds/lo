import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // mapbox-gl is ~1.9 MB minified and changes far less often than app
        // code, so give it its own long-lived cacheable chunk.
        manualChunks: {
          mapbox: ["mapbox-gl"],
        },
      },
    },
  },
});
