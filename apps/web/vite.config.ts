/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import securityHeaders from '../../security-headers.json';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Preload the two Latin font files the home heading uses, so the largest paint is not held up. */
function preloadFonts(): Plugin {
  return {
    name: 'afb-preload-fonts',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      const files = Object.keys(ctx.bundle ?? {}).filter((f) => /(fraunces-latin-full-normal|figtree-latin-wght-normal)-[\w-]+\.woff2$/.test(f));
      return {
        html,
        tags: files.map((f) => ({ tag: 'link', injectTo: 'head', attrs: { rel: 'preload', href: `/${f}`, as: 'font', type: 'font/woff2', crossorigin: '' } })),
      };
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    // Measured: preloading fonts competes with the scripts on slow 4G and made LCP worse (2.9 s vs 2.2 s).
    // Kept available but off; the text renders in the fallback font first (font-display: swap).
    ...(process.env.AFB_PRELOAD_FONTS === '1' ? [preloadFonts()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered from src/lib/pwa.ts so it never blocks first paint
      includeAssets: ['favicon.svg', 'robots.txt', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'Africa Food Basket',
        short_name: 'Food Basket',
        description:
          'Production, consumption, trade, diets and projections for 34 foods in 54 African countries, every figure sourced.',
        lang: 'en',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FBF3E6',
        theme_color: '#C22E16',
        categories: ['education', 'business', 'food'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Precache only the scripts the five languages use; other font subsets load on demand.
        globIgnores: [
          '**/*-{vietnamese,cyrillic,cyrillic-ext,greek,greek-ext,math}-*.woff2',
          // Per-language phrase dictionaries: cached when that language is first used, not on install.
          '**/assets/legacy-*.js',
          '**/assets/names-*.js',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
        cleanupOutdatedCaches: true,
        // Reference data: served from cache at once, refreshed in the background (works offline once seen).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/data/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'afb-data', expiration: { maxEntries: 60 } },
          },
          {
            urlPattern: ({ url }) => /\/assets\/(legacy|names)-[\w-]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'afb-i18n', expiration: { maxEntries: 20 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@locales': fileURLToPath(new URL('../../locales', import.meta.url)),
    },
  },
  server: { port: 5173, fs: { allow: [repoRoot] } },
  // The production build is previewed (and tested end to end) under the same security headers Hosting
  // sends, so a Content Security Policy violation fails the journeys before it reaches users.
  // The emulator journeys run under the same policy, with the local emulator origins allowed.
  preview: {
    headers:
      process.env.AFB_EMULATOR_PREVIEW === '1'
        ? {
            ...securityHeaders,
            'Content-Security-Policy': securityHeaders['Content-Security-Policy'].replace('connect-src ', 'connect-src http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* '),
          }
        : securityHeaders,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
