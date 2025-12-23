import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    hmr: {
      port: 5173,
      // HMR connects to external port (not internal)
      clientPort: process.env.VITE_HMR_PORT
        ? parseInt(process.env.VITE_HMR_PORT)
        : undefined,
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
