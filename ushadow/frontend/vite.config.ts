import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    // Disable host check - we're behind Tailscale auth
    allowedHosts: true,
    hmr: {
      // Don't specify clientPort or host - Vite auto-detects from window.location
      // This allows HMR to work on localhost:3100 AND via Tailscale (port 443)
      // Tailscale proxies WebSocket through the same port as HTTPS
    },
    watch: {
      usePolling: true, // Required for Docker volume mounts
    },
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
