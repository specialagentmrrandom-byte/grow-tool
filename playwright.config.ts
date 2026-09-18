import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test config — runs the full suite twice: once at a desktop viewport and
 * once at a mobile (iPhone-class) viewport, per the app's "works everywhere"
 * requirement from the landing page.
 *
 * Run with: npx playwright test          (starts the vite dev server itself)
 *      or: npx playwright test --ui     (interactive)
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'desktop',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
        },
        {
            // Pixel 7 is Chromium-based, so `npx playwright install chromium`
            // suffices (iPhone devices would require the WebKit browser).
            name: 'mobile',
            use: { ...devices['Pixel 7'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 30_000,
    },
});
