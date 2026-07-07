import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves this repo at /Idle-Survival/, not the domain root. The
// deploy workflow sets GH_PAGES=true; local dev/build/preview stay at '/'.
const base = process.env.GH_PAGES === 'true' ? '/Idle-Survival/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): autoUpdate's generated registerSW code
      // calls window.location.reload() the instant a new SW takes control,
      // with no hook to run first — which can land mid-write and clip the
      // last <1s of unsaved progress (an in-flight IndexedDB save is not
      // guaranteed to finish before a real navigation, unlike backgrounding,
      // which just pauses the page and lets it finish). 'prompt' exposes
      // onNeedRefresh in main.tsx, where we flush the save before reloading
      // — same net effect (silent, automatic update), just save-safe.
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'HALCYON — Frontier Outpost',
        short_name: 'HALCYON',
        description:
          'Command a colony outpost on a hostile alien frontier. Extract, build, and defend against telegraphed incursions — even while away.',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        theme_color: '#000000',
        background_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole app shell so it launches fully offline.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
