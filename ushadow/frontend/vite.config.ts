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
      // Use the external port for HMR WebSocket connection
      // In dev mode, browser connects to localhost:3000, but needs to know
      // that WebSocket should also use port 3000 (which Docker maps to 5173)
      clientPort: process.env.VITE_HMR_PORT ? parseInt(process.env.VITE_HMR_PORT) : 5173,
    },
    watch: {
      usePolling: true, // Required for Docker volume mounts
      interval: 1000, // Poll every 1 second for faster detection
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
