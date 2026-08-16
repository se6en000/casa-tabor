import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

test('LivingFlowSidecar & useLivingFlowState recurrence deletion and Google sync verification', async (t) => {
  const root = process.cwd()
  const useLivingFlowStateSrc = await fs.readFile(
    path.join(root, 'src/components/calendar/living-flow/hooks/useLivingFlowState.ts'),
    'utf-8'
  )
  const livingFlowSidecarSrc = await fs.readFile(
    path.join(root, 'src/components/calendar/living-flow/LivingFlowSidecar.tsx'),
    'utf-8'
  )

  await t.test('useLivingFlowState does not use browser confirm()', () => {
    assert.doesNotMatch(
      useLivingFlowStateSrc,
      /\bconfirm\s*\(/,
      'useLivingFlowState must never invoke native browser confirm()'
    )
  })

  await t.test('useLivingFlowState loads recurring context for canonical occurrences', () => {
    assert.match(
      useLivingFlowStateSrc,
      /loadRecurringEditorContext/,
      'useLivingFlowState must import and call loadRecurringEditorContext'
    )
    assert.match(
      useLivingFlowStateSrc,
      /deleteRecurringEditorMutation/,
      'useLivingFlowState must import and execute deleteRecurringEditorMutation for recurring deletions'
    )
    assert.match(
      useLivingFlowStateSrc,
      /announceRecurringDelete/,
      'useLivingFlowState must announce recurring deletion for undo/toast sync'
    )
  })

  await t.test('LivingFlowSidecar renders RecurrenceScopeDialog and ConfirmationDialog', () => {
    assert.match(
      livingFlowSidecarSrc,
      /<RecurrenceScopeDialog/,
      'LivingFlowSidecar must render RecurrenceScopeDialog'
    )
    assert.match(
      livingFlowSidecarSrc,
      /<ConfirmationDialog/,
      'LivingFlowSidecar must render ConfirmationDialog'
    )
    assert.match(
      livingFlowSidecarSrc,
      /operation="delete"/,
      'RecurrenceScopeDialog must be configured for delete operation'
    )
  })

  await t.test('Single event delete calls deleteCalendarEvent and invokes delete-google-event', async () => {
    const eventMutationsSrc = await fs.readFile(
      path.join(root, 'src/lib/eventMutations.ts'),
      'utf-8'
    )
    assert.match(
      eventMutationsSrc,
      /supabase\.functions\.invoke\('delete-google-event'/,
      'deleteCalendarEvent must trigger delete-google-event function for connected Google events'
    )
  })

  await t.test('SidecarCompanion auto-collapses on event deletion without flipping to AI', async () => {
    const sidecarCompanionSrc = await fs.readFile(
      path.join(root, 'src/components/shared/SidecarCompanion.tsx'),
      'utf-8'
    )
    assert.match(
      sidecarCompanionSrc,
      /const isFlippedToAi = sidecarTab === 'ai'/,
      'SidecarCompanion must only flip to AI when sidecarTab is explicitly "ai"'
    )
    assert.match(
      sidecarCompanionSrc,
      /closeSidecar\(\)/,
      'SidecarCompanion must auto-close sidecar when deleted event is no longer present'
    )
  })
})

