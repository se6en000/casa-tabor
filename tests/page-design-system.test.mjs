import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PAGE_PATHS = [
  'src/pages/HomePage.tsx',
  'src/pages/GroceryPage.tsx',
]

for (const pagePath of PAGE_PATHS) {
  const source = readFileSync(resolve(pagePath), 'utf8')

  test(`${pagePath} uses semantic typography roles`, () => {
    assert.doesNotMatch(source, /\btext-\[(?:\d|\.)+(?:px|rem|em)\]/)
    assert.doesNotMatch(source, /\btext-(?:xs|sm|base|lg|xl|2xl)\b/)
  })

  test(`${pagePath} does not hand-roll pill geometry`, () => {
    assert.doesNotMatch(source, /\brounded-pill\b/)
  })
}

test('Design System gallery documents both static and interactive pill contracts', () => {
  const source = readFileSync(resolve('src/pages/DesignSystemGalleryPage.tsx'), 'utf8')
  assert.match(source, />Static badges</)
  assert.match(source, />Interactive action pills</)
  assert.match(source, /<Chip>Suggested<\/Chip>/)
  assert.match(source, /<Chip onClick=\{\.\.\.\}>Add item<\/Chip>/)
  assert.match(source, /selected onClick=/)
  assert.match(source, /onClick=\{\(\) => undefined\} disabled/)
})
