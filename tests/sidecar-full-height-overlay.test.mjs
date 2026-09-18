import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sidecarSource = readFileSync(
  new URL('../src/components/shared/SidecarCompanion.tsx', import.meta.url),
  'utf8',
)
const appSource = readFileSync(
  new URL('../src/App.tsx', import.meta.url),
  'utf8',
)

// 2026-09-18: per direct user feedback, the desktop sidecar previously sat
// below the top nav bar (bounded by app-shell-main's height, and at a lower
// z-index than the nav bar's z-sticky), creating a visual seam. Now it's
// fixed to the full viewport height and layered above the nav bar, while the
// main content reserves space for it via padding driven by the same
// --ai-sidecar-width CSS variable the sidecar already used for its own width.
test('desktop sidecar is fixed full-height and layered above the top nav bar', () => {
  const idx = sidecarSource.indexOf("key=\"sidecar-desktop-companion\"")
  const block = sidecarSource.slice(idx, idx + 800)
  assert.match(block, /fixed top-0 bottom-0 right-0/)
  assert.match(block, /z-modal/)
  assert.doesNotMatch(block, /\bh-full\b/)
})

test('main content reserves space for the sidecar via the shared CSS variable, not a flex sibling', () => {
  const idx = appSource.indexOf('<AnimatedRoutes />')
  const block = appSource.slice(Math.max(0, idx - 300), idx)
  assert.match(block, /pr-\[var\(--ai-sidecar-width,0px\)\]/)
})
