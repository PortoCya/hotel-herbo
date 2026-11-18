import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O painel roda em http://localhost:5173 e encaminha API, mídia e WebSocket
// para o Django (daphne) em http://localhost:8000.
const BACKEND = process.env.VITE_BACKEND_URL || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/media": { target: BACKEND, changeOrigin: true },
      "/ws": { target: BACKEND.replace(/^http/, "ws"), ws: true, changeOrigin: true },
    },
  },
});
