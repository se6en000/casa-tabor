import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const banner = readFileSync(new URL('../src/components/shared/OfflineBanner.tsx', import.meta.url), 'utf8')

test('renders nothing while online (no persistent chrome for the common case)', () => {
  assert.match(banner, /useOnlineStatus/)
  assert.match(banner, /if \(isOnline\) return null/)
})

test('is announced to assistive tech and uses the warning color tokens (not alarmist danger/red)', () => {
  assert.match(banner, /aria-live/)
  assert.match(banner, /casa-warning/)
})

test('uses a real design-system z-index token, not an arbitrary value (certify:experience gates on this)', () => {
  assert.doesNotMatch(banner, /z-\[\d+\]/)
  assert.match(banner, /z-toast|z-modal|z-popover|z-debug/)
})

test('is wired into the app shell so it shows regardless of which page is active', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /<OfflineBanner/)
})
