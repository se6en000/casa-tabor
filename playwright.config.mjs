import { defineConfig } from '@playwright/test'
import { VISUAL_MATRIX } from './visual-regression/matrix.mjs'

export default defineConfig({
  testDir: './visual-regression',
  testMatch: '*.spec.mjs',
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },
  projects: VISUAL_MATRIX.map((profile) => ({
    name: profile.name,
    metadata: {
      theme: profile.theme,
      density: profile.density,
    },
    use: {
      viewport: profile.viewport,
      hasTouch: profile.hasTouch,
      isMobile: profile.isMobile,
    },
  })),
  webServer: {
    command: 'VITE_VISUAL_TEST_MODE=true npm run dev -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174/__visual-regression',
    reuseExistingServer: !process.env.CI,
  },
})
