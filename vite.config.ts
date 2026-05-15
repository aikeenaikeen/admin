/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Most of the weight is Element Plus + icons + socket.io.
    // Splitting them out keeps view chunks small and lets the
    // browser cache the vendor bundle across deploys.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('element-plus')) return 'vendor-element-plus'
            if (id.includes('@element-plus/icons-vue')) return 'vendor-element-plus'
            if (id.includes('socket.io-client') || id.includes('engine.io-client')) return 'vendor-realtime'
            if (id.includes('dayjs')) return 'vendor-dayjs'
            if (id.includes('vue-router') || id.includes('pinia') || id.includes('vue-i18n')) return 'vendor-vue-core'
            return 'vendor'
          }
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
  },
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})








