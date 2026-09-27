/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/run-tracker/',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0') },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', '.nojekyll'],
      manifest: {
        name: 'Run Tracker',
        short_name: 'Run Tracker',
        description: 'Mobile-first GPS run tracker. Km splits, pace, maps and GPX export.',
        start_url: '/run-tracker/',
        scope: '/run-tracker/',
        display: 'standalone',
        lang: 'en-AU',
        orientation: 'portrait',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Cache map tiles you've already viewed (tiles still need network the first time).
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
