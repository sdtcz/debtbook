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
      includeAssets: ['icons/icon.svg', 'brand/wordmark.svg', 'brand/wordmark-reverse.svg'],
      includeManifestIcons: false,
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
        background_color: '#fffbeb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/?app=1',
        lang: 'en',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        // Shown by Android's richer install sheet. WebP (~60 kB each), fetched only by the install UI.
        screenshots: [
          ['See who owes you, at a glance', 1],
          ['Every sale and payment, in order', 2],
          ['Add a credit sale in seconds', 3],
          ['Remind on WhatsApp in one tap', 4],
          ['Get paid faster', 5],
        ].map(([label, n]) => ({
          src: `screenshots/screenshot-${n}.webp`,
          sizes: '1080x1920',
          type: 'image/webp',
          form_factor: 'narrow' as const,
          label: label as string,
        })),
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // The app is hash-routed on "/" only; any other path goes to the network (SEO pages, real 404s).
        navigateFallbackAllowlist: [/^\/(index\.html)?(\?.*)?$/],
        // Static SEO page + crawler files are served by the network, never the app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/kippa-alternative/, /^\/credit-book-app/, /^\/ng\//, /^\/(robots\.txt|sitemap\.xml)$/],
        // Not precached (saves ~33 kB on every first visit and every update): Hausa / Yoruba strings
        // (fetched when chosen), the marketing landing page, and icons the browser fetches itself.
        // They are cached on first use by the runtime rule below.
        globIgnores: [
          '**/kippa-alternative.html',
          '**/credit-book-app.html',
          '**/ng/*.html',
          '**/404.html',
          '**/assets/ha-*.js',
          '**/assets/yo-*.js',
          '**/assets/LandingPage-*.js',
          '**/assets/LandingPage-*.css',
          'favicon.ico',
          'icons/icon-512.png',
          'icons/icon-192.png',
          'icons/maskable-192.png',
          'icons/icon-maskable-512.png',
          'apple-touch-icon.png',
          'og-image*.png',
          'favicon.svg',
        ],
        runtimeCaching: [
          {
            // Hashed file names never change content, so cache-first is safe.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/.+-[\w-]{8}\.(js|css)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'bb-lazy-assets', expiration: { maxEntries: 30 } },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // The entry keeps a FIXED name (served with must-revalidate, precached by revision), so
        // lazy chunks that import from it keep their hashes when only the entry changes: an update
        // re-downloads the files that really changed instead of every chunk (~90 kB → ~40 kB).
        entryFileNames: 'app.js',
        // Rarely-changing parts of the start-up code get their own hashed chunks, so a deploy
        // doesn't re-send them: the UI library + IndexedDB wrapper, and the English strings.
        manualChunks(id) {
          if (/node_modules\/(preact|idb)\//.test(id)) return 'vendor';
          if (id.endsWith('/src/i18n/locales/en.ts')) return 'en';
          return undefined;
        },
      },
    },
  },
});
