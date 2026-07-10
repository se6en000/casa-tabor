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

test('Grocery suggestion review uses an overlay instead of expanding its item row', () => {
  const source = readFileSync(resolve('src/pages/GroceryPage.tsx'), 'utf8')
  assert.match(source, /open=\{reviewingItem !== null\}/)
  assert.match(source, /The grocery list stays fixed behind this overlay/)
  assert.doesNotMatch(source, /isReviewing &&/)
  assert.doesNotMatch(source, />Quick recategorize</)
})

test('Design System gallery covers every P0 touch contract', () => {
  const source = readFileSync(resolve('src/pages/DesignSystemGalleryPage.tsx'), 'utf8')
  for (const contract of [
    'Selection controls',
    'Select and combobox',
    'Alerts and banners',
    'Progress',
    'Toast / action confirmation',
    'Skeleton loading',
    'Nothing here yet',
    'Could not load',
  ]) {
    assert.match(source, new RegExp(contract))
  }
})

test('P0 primitives are exported from the shared UI entrypoint', () => {
  const source = readFileSync(resolve('src/components/ui/index.ts'), 'utf8')
  for (const component of ['Switch', 'Checkbox', 'Radio', 'Combobox', 'Alert', 'Toast', 'Progress', 'Skeleton', 'EmptyState']) {
    assert.match(source, new RegExp(`export \\{[^\\n]*\\b${component}\\b`))
  }
})

test('P0 controls preserve native and ARIA semantics', () => {
  const selectionSource = readFileSync(resolve('src/components/ui/SelectionControls.tsx'), 'utf8')
  const comboboxSource = readFileSync(resolve('src/components/ui/Combobox.tsx'), 'utf8')
  const feedbackSource = readFileSync(resolve('src/components/ui/Toast.tsx'), 'utf8')
  assert.match(selectionSource, /role="switch"/)
  assert.match(selectionSource, /type="checkbox"/)
  assert.match(selectionSource, /type="radio"/)
  assert.match(comboboxSource, /role="listbox"/)
  assert.match(comboboxSource, /role="option"/)
  assert.match(feedbackSource, /role=\{tone === 'danger' \? 'alert' : 'status'\}/)
})

test('Progress uses native progress semantics without layout-fragile inline widths', () => {
  const source = readFileSync(resolve('src/components/ui/Progress.tsx'), 'utf8')
  assert.match(source, /<progress/)
  assert.doesNotMatch(source, /style=\{\{/)
})

test('event create and edit workflows use shared design-system contracts', () => {
  const quickCreate = readFileSync(resolve('src/components/shared/QuickCreateSheet.tsx'), 'utf8')
  const eventEdit = readFileSync(resolve('src/components/calendar/EventEditSheet.tsx'), 'utf8')
  const eventDetail = readFileSync(resolve('src/components/calendar/EventDetailPanel.tsx'), 'utf8')
  assert.match(quickCreate, /<Sheet/)
  assert.match(quickCreate, /<Field label="Event title"/)
  assert.match(quickCreate, /<Button/)
  assert.match(quickCreate, /<Alert tone="danger"/)
  assert.doesNotMatch(quickCreate, /z-\[\d+\]/)
  assert.match(eventEdit, /<SegmentedControl/)
  assert.match(eventEdit, /<Switch/)
  assert.match(eventEdit, /<Select/)
  assert.match(eventEdit, /<Modal/)
  assert.match(eventEdit, /<Alert /)
  assert.doesNotMatch(eventEdit, /\btext-\[(?:\d|\.)+(?:px|rem|em)\]/)
  assert.doesNotMatch(eventEdit, /z-\[\d+\]/)
  assert.match(eventDetail, /\{event && !showEdit && \(/)
})

test('inline calendar uses density-aware controls and semantic layering', () => {
  const source = readFileSync(resolve('src/components/shared/InlineCalendarPicker.tsx'), 'utf8')
  assert.match(source, /<IconButton/)
  assert.match(source, /min-h-control-sm/)
  assert.match(source, /z-popover/)
  assert.doesNotMatch(source, /\bh-8\b/)
  assert.doesNotMatch(source, /z-\[\d+\]/)
})
