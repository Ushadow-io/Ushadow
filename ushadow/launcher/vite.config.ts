import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Alias to import shared components from main frontend
      '@shared': path.resolve(__dirname, '../frontend/src/components'),
    },
  },
  // Tauri expects a fixed port during development
  server: {
    port: 1421,
    strictPort: true,
  },
  // Build to dist folder for Tauri
  build: {
    outDir: 'dist',
    emptyDirOnBuild: true,
  },
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,
})
