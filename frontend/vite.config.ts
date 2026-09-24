import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  // Path alias for @/ imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Development server configuration
  server: {
    port: 5173,
    watch: {
      ignored: ['**/test_artifacts/**', '**/test-results/**', '**/playwright-report/**', '**/.auth/**'],
    },
    // Proxy API requests to Django backend
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      // Proxy Django Admin, Rosetta, and i18n requests (including optional language prefix and trailing slash)
      '^/([a-z]{2}/)?(admin|rosetta|i18n)($|/)': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      // Also proxy media files if needed
      '/media': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Build configuration - output to Django static folder
  build: {
    // Output to backend/static/dist
    outDir: '../backend/static/dist',
    // Clean the output directory before building
    emptyOutDir: true,
    // Generate source maps for debugging
    sourcemap: true,
    // Rollup options
    rollupOptions: {
      output: {
        // Consistent file naming for Django integration
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
})
