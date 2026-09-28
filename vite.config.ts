import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'share-target-sw.js'],
      manifest: {
        id: '/mosaic-ippatsu/',
        name: 'モザイク一発',
        short_name: 'モザイク',
        description: '写真の一部をモザイク・ぼかし。端末内だけで処理。無料・広告なし・ログイン不要。',
        lang: 'ja',
        theme_color: '#17131F',
        background_color: '#17131F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: './share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [{ name: 'image', accept: ['image/*', '.png', '.jpg', '.jpeg', '.webp'] }],
          },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        importScripts: ['share-target-sw.js'],
      },
    }),
  ],
});
