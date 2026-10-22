import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'BashiBook',
        short_name: 'BashiBook',
        description: 'Offline customer credit ledger for African shopkeepers',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/?app=1',
        lang: 'en',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // Static SEO page + crawler files are served by the network, never the app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/kippa-alternative/, /^\/(robots\.txt|sitemap\.xml)$/],
        globIgnores: ['**/kippa-alternative.html'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
  },
});
