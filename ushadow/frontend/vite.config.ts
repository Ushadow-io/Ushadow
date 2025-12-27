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
      // Disable HMR for remote access (Tailscale, production, etc.)
      // HMR only works on localhost or when explicitly configured
      clientPort: process.env.VITE_HMR_PORT
        ? parseInt(process.env.VITE_HMR_PORT)
        : 5173,
      host: 'localhost', // Force HMR to localhost only
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
