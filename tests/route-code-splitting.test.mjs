import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-23: one 2.9MB JS bundle -- every page load (even just opening
// Grocery List) downloaded the entire app, AI assistant/recipe importer/music
// player included. Home and Calendar (the two pages actually used most of the
// time on this kiosk) stay eagerly imported so the common case has zero
// loading flicker; everything else is route-based code-split.
//
// Real risk this must guard against: a lazy chunk import can fail after a
// fresh deploy replaces the built asset files a stale-loaded index.html still
// references ("Failed to fetch dynamically imported module") -- exactly the
// class of bug this repo has hit before with build-id mismatches (see
// scripts/ship.sh's own history). A failed lazy import must trigger a reload
// to pick up the new build, not crash to a raw error boundary.
const source = readFileSync(new URL('../src/components/shared/AnimatedRoutes.tsx', import.meta.url), 'utf8')

test('the two most-visited pages (Home, Calendar) stay eagerly imported -- no loading flicker for the common case', () => {
  assert.match(source, /^import HomePage from '\.\.\/\.\.\/pages\/HomePage'$/m)
  assert.match(source, /^import CalendarPage from '\.\.\/\.\.\/pages\/CalendarPage'$/m)
})

test('secondary pages are lazy-loaded, not bundled eagerly', () => {
  for (const page of [
    'GroceryPage', 'MusicPage', 'CookPage', 'BriefingPage', 'ActionHubPage',
    'TripDetailPage', 'AdminOpsPage', 'DesignSystemGalleryPage', 'StatusDashboardPage',
    'DataAnalyticsPage', 'SettingsShell',
  ]) {
    assert.match(source, new RegExp(`const ${page} = lazyWithReload\\(`), `${page} should be lazy-loaded`)
  }
})

test('routes are wrapped in a single Suspense boundary with a real fallback', () => {
  assert.match(source, /<Suspense fallback=/)
})

test('a failed lazy-chunk load (stale build after a fresh deploy) reloads once instead of crashing', () => {
  const helper = readFileSync(new URL('../src/utils/lazyWithReload.ts', import.meta.url), 'utf8')
  assert.match(helper, /\.catch\(/)
  assert.match(helper, /window\.location\.reload\(\)/)
  assert.match(helper, /sessionStorage/) // guards against an infinite reload loop on a genuine, persistent failure
})
