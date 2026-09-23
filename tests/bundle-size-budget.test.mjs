import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { findMainBundleFile, MAIN_BUNDLE_BUDGET_BYTES } from '../scripts/check-bundle-size.mjs'

test('the budget sits between the pre-code-splitting size (2930KB) and the post-split size (2081KB), catching a real regression', () => {
  const kb = MAIN_BUNDLE_BUDGET_BYTES / 1024
  assert.ok(kb > 2081, 'budget must have headroom above the current measured size')
  assert.ok(kb < 2930, 'budget must be tighter than the old, pre-code-splitting size it exists to prevent regressing to')
})

test('identifies the main entry chunk (index-*.js) among a directory of mixed lazy-route chunks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-size-test-'))
  try {
    writeFileSync(join(dir, 'index-abc123.js'), 'x'.repeat(500))
    writeFileSync(join(dir, 'GroceryPage-def456.js'), 'x'.repeat(999999)) // a large lazy chunk must NOT be picked
    writeFileSync(join(dir, 'index.json'), 'not js')
    const result = findMainBundleFile(dir)
    assert.equal(result.file, 'index-abc123.js')
    assert.equal(result.size, 500)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('throws a clear error if no dist build exists yet, rather than a confusing crash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-size-test-empty-'))
  try {
    assert.throws(() => findMainBundleFile(dir), /No main entry bundle/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
