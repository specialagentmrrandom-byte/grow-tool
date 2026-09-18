import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    root: '.',
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['logo.png', 'apple-touch-icon.svg'],
            manifest: {
                name: 'OG Grow Journal Assistant',
                short_name: 'Grow Journal',
                description: 'Track your cannabis grow from seed to harvest',
                theme_color: '#0a0a0a',
                background_color: '#0a0a0a',
                display: 'standalone',
                orientation: 'portrait-primary',
                start_url: '/app.html',
                scope: '/',
                icons: [
                    {
                        src: 'pwa-192x192.svg',
                        sizes: '192x192',
                        type: 'image/svg+xml',
                    },
                    {
                        src: 'pwa-512x512.svg',
                        sizes: '512x512',
                        type: 'image/svg+xml',
                    },
                    {
                        src: 'pwa-512x512.svg',
                        sizes: '512x512',
                        type: 'image/svg+xml',
                        purpose: 'maskable',
                    },
                ],
                categories: ['lifestyle', 'utilities'],
            },
            workbox: {
                // Everything is served from this origin now (emoji SVGs, fonts, the
                // twemoji script), so the first load already works offline and no
                // third-party cache rule is needed.
                globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
                globIgnores: ['**/GJA.png', '**/og-image.png'],
                navigateFallback: null,
                maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
            },
            devOptions: {
                // Keep the service worker out of dev — it caches stale JS/CSS
                // and makes `npm run dev` serve old code. Verify PWA/offline
                // behaviour via `npm run build && npm run preview` instead.
                enabled: false,
            },
        }),
    ],
    build: {
        outDir: 'dist',
        target: 'esnext',
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, 'index.html'),
                app: resolve(import.meta.dirname, 'app.html'),
                help: resolve(import.meta.dirname, 'help.html'),
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        // Unit tests only — e2e/*.spec.ts are Playwright tests (npm run test:e2e)
        include: ['tests/**/*.test.ts'],
    },
});
