import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png', 'caller.mp3', 'ring.mp3', 'ringtone.mp3'],
      manifest: {
        name: 'Share by Air — Your data never leaves your hands.',
        short_name: 'Share by Air',
        description: 'Share files and messages directly between devices on your Wi-Fi — no cloud, no server, no internet needed.',
        theme_color: '#667eea',
        background_color: '#f1f5f9',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        categories: ['utilities', 'productivity', 'social']
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,mp3}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true // Enable PWA in development mode for testing
      }
    })
  ],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy all PeerJS HTTP + WebSocket traffic to the Node server in dev
      '/peerjs': {
        target: 'http://localhost:9000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
