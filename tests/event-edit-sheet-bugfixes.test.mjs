import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('src/components/calendar/EventEditSheet.tsx'), 'utf8')

test('enrichment save is awaited before closing so failures block close and surface an error, not silently swallowed', () => {
  assert.doesNotMatch(
    source,
    /save\.mutateAsync\(\{ eventId: enrichmentEventId, fields: patch \}\)\.catch\(\(\) => \{\}\)/,
    'enrichment save must not be fire-and-forget with swallowed errors'
  )
  assert.match(
    source,
    /const enrichmentSavePromise = save\.mutateAsync\(\{ eventId: enrichmentEventId, fields: patch \}\)/,
    'enrichment save must be kicked off and its promise retained'
  )
  assert.match(
    source,
    /await enrichmentSavePromise/,
    'enrichment save promise must be awaited before the save path completes'
  )
})

test('switchToReminder preserves the existing time/all-day state instead of zeroing to midnight', () => {
  const fn = source.match(/const switchToReminder = \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
  assert.ok(fn, 'switchToReminder function not found')
  assert.doesNotMatch(fn, /setStartDT\(`\$\{datePart\}T00:00`\)/, 'must not force start time to midnight')
  assert.doesNotMatch(fn, /setEndDT\(`\$\{datePart\}T00:00`\)/, 'must not force end time to midnight')
  assert.match(fn, /setEventType\('reminder'\)/)
})

test('markDirty tracks real dirty state instead of being a no-op', () => {
  assert.doesNotMatch(source, /const markDirty = \(\) => \{\}/, 'markDirty must no longer be a no-op')
})

test('all enrichment and category field edits participate in dirty tracking', () => {
  assert.match(
    source,
    /const set = \(field: string, value: string\) => \{[\s\S]*?setForm\([\s\S]*?markDirty\(\)[\s\S]*?\}/,
    'the shared enrichment-field setter must mark the form dirty',
  )
  assert.match(
    source,
    /const handleCategoryChange = \(cat: string\) => \{[\s\S]*?markDirty\(\)[\s\S]*?\n  \}/,
    'changing category must mark the form dirty',
  )
})

test('closing with unsaved changes shows a discard-changes confirmation instead of closing immediately', () => {
  assert.match(source, /Discard changes/i)
  assert.match(source, /isDirtyRef/)
})

test('late recurring data hydration cannot overwrite edits or clear dirty state', () => {
  assert.match(source, /const initializedEventIdRef = useRef<string \| null>\(null\)/)
  assert.match(source, /if \(!open\) \{\s*initializedEventIdRef\.current = null\s*return\s*\}/)
  assert.match(source, /const eventChanged = initializedEventIdRef\.current !== event\.id/)
  assert.match(source, /if \(!eventChanged && isDirtyRef\.current\) return/)
})

test('the loaded editor sheet has dialog accessibility attributes', () => {
  const sheetBlock = source.slice(source.indexOf("key=\"edit-sheet\""), source.indexOf("key=\"edit-sheet\"") + 1200)
  assert.match(sheetBlock, /role=\{inline \? 'region' : 'dialog'\}/)
  assert.match(sheetBlock, /aria-modal=\{inline \? undefined : true\}/)
})

test('date/time wheel commits mark the form dirty without prematurely closing the editor sheet', () => {
  assert.match(source, /const handleDateTimeInteraction = useCallback\(\(\) => \{/)
  assert.match(source, /onInteraction=\{handleDateTimeInteraction\}/)
  assert.match(source, /markDirty\(\)/)
})

test('successful saves refresh the event caches immediately before the sheet closes', () => {
  assert.match(source, /publishEventAggregatePatch\(qc, event\.id, optimisticPatch\)/)
  assert.match(source, /members: buildOptimisticMembers\(\)/)
  assert.match(source, /qc\.invalidateQueries\(\{ queryKey: \['event-transportation-plans'\] \}\)/)
})

test('DateTimeDial supports direct option click selection and flushes preview values on collapse or unmount', () => {
  const dialSource = readFileSync(resolve('src/components/ui/DateTimeDial.tsx'), 'utf8')
  assert.match(dialSource, /const handleOptionClick = /)
  assert.match(dialSource, /onClick=\{\(\) => handleOptionClick\(index, item\.value\)\}/)
  assert.match(dialSource, /const handleToggleExpanded = useCallback\(/)
  assert.match(dialSource, /if \(previewStart && previewStart !== startValue\)/)
  assert.match(dialSource, /if \(previewEnd && previewEnd !== endValue\)/)
  assert.match(dialSource, /onStartChange\(previewStart\)/)
  assert.match(dialSource, /onEndChange\(previewEnd\)/)
})

