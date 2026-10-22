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
        // id = the start_url browsers already derived for existing installs, so they stay the same app.
        id: '/?app=1',
        description: 'Free credit book for small shops. Works offline once opened.',
        categories: ['finance', 'business', 'productivity'],
        shortcuts: [
          {
            name: 'Add customer',
            short_name: 'Add customer',
            url: '/?app=1#/customers/new',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Reports',
            short_name: 'Reports',
            url: '/?app=1#/reports',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Pay me (bank details)',
            short_name: 'Pay me',
            url: '/?app=1#/pay-details',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
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
        // The app is hash-routed on "/" only; any other path goes to the network (SEO pages, real 404s).
        navigateFallbackAllowlist: [/^\/(index\.html)?(\?.*)?$/],
        // Static SEO page + crawler files are served by the network, never the app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/kippa-alternative/, /^\/credit-book-app/, /^\/(robots\.txt|sitemap\.xml)$/],
        globIgnores: ['**/kippa-alternative.html', '**/credit-book-app.html', '**/404.html'],
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
