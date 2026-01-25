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
      // Don't set clientPort - let Vite auto-detect from page URL
      // This works for both localhost:3400 and Tailscale HTTPS (port 443)
      // VITE_HMR_PORT env var is ignored to support both access methods
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
