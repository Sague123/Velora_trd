import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    strictPort: true,
    // Bind all interfaces, not just localhost, so the dev server is reachable
    // from other devices on the same LAN (e.g. http://<this-machine-ip>:5000).
    host: true,
  },
});
