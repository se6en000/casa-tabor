import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('syncAndMaterializeRecurringSeries is exported from eventMutations.ts and integrated across UI components', () => {
  const mutationsFile = resolve('src/lib/eventMutations.ts')
  const mutationsContent = readFileSync(mutationsFile, 'utf8')

  assert.match(
    mutationsContent,
    /export async function syncAndMaterializeRecurringSeries/,
    'eventMutations.ts must export syncAndMaterializeRecurringSeries'
  )

  const editSheetFile = resolve('src/components/calendar/EventEditSheet.tsx')
  const editSheetContent = readFileSync(editSheetFile, 'utf8')

  assert.match(
    editSheetContent,
    /syncAndMaterializeRecurringSeries/,
    'EventEditSheet.tsx must call syncAndMaterializeRecurringSeries when saving recurring events'
  )

  const quickCreateFile = resolve('src/components/shared/QuickCreateSheet.tsx')
  const quickCreateContent = readFileSync(quickCreateFile, 'utf8')

  assert.match(
    quickCreateContent,
    /syncAndMaterializeRecurringSeries/,
    'QuickCreateSheet.tsx must call syncAndMaterializeRecurringSeries when creating recurring events'
  )

  const livingFlowFile = resolve('src/components/calendar/living-flow/hooks/useLivingFlowState.ts')
  const livingFlowContent = readFileSync(livingFlowFile, 'utf8')

  assert.match(
    livingFlowContent,
    /syncAndMaterializeRecurringSeries/,
    'useLivingFlowState.ts must call syncAndMaterializeRecurringSeries when setting recurrence rule'
  )
})

test('syncAndMaterializeRecurringSeries prunes stale occurrences no longer matching the updated recurrence rule', () => {
  const mutationsFile = resolve('src/lib/eventMutations.ts')
  const mutationsContent = readFileSync(mutationsFile, 'utf8')

  assert.match(
    mutationsContent,
    /pruneStaleOccurrences|\.delete\(\)[\s\S]*?!\s*validKeys\.has/m,
    'syncAndMaterializeRecurringSeries must delete occurrence rows that are no longer valid under the updated RRULE'
  )
})
