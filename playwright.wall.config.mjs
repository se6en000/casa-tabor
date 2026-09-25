import { defineConfig } from '@playwright/test'

// Screenshot guard for the Family Wall (P2.6): one 1920x1080 kiosk profile.
// Baselines are per platform, since font rendering differs between Linux and macOS.
export default defineConfig({
  testDir: './visual-regression',
  testMatch: 'wall.spec.mjs',
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}-{platform}{ext}',
  reporter: 'line',
  retries: 1,
  // Tight on purpose: a block moved by 1px changes ~1,600 pixels; font antialiasing noise stays well under 300.
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixels: 300 } },
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    viewport: { width: 1920, height: 1080 },
  },
  webServer: {
    command: 'VITE_VISUAL_TEST_MODE=true npx vite --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/__wall-fixture',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
