import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
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
          { src: 'pwa-192x192.png',        sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',        sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        categories: ['utilities', 'productivity', 'social'],
        share_target: {
          action: '/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text:  'text',
            url:   'url',
            files: [{
              name:   'files',
              accept: [
                'image/*', 'video/*', 'audio/*',
                'application/pdf', '.pdf',
                'application/zip', 'application/x-zip-compressed', '.zip',
                'application/octet-stream',
                'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.doc', '.docx',
                'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls', '.xlsx',
                'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.ppt', '.pptx',
                'text/*', '.txt', '.csv',
              ]
            }]
          }
        }
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,mp3}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
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
      '/peerjs': {
        target: 'http://localhost:9000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
