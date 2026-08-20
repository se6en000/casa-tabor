import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

test('Recurring Sync & Scope Auto-Switch Verification', async (t) => {
  const root = process.cwd()
  const useLivingFlowStateSrc = await fs.readFile(
    path.join(root, 'src/components/calendar/living-flow/hooks/useLivingFlowState.ts'),
    'utf-8'
  )
  const eventEditSheetSrc = await fs.readFile(
    path.join(root, 'src/components/calendar/EventEditSheet.tsx'),
    'utf-8'
  )

  await t.test('useLivingFlowState setRecurrenceRule auto-switches recurScope to "all"', () => {
    assert.match(
      useLivingFlowStateSrc,
      /setRecurrenceRule[\s\S]*?recurScope:\s*'all'/,
      'setRecurrenceRule must set recurScope to "all" when updating recurrence rule'
    )
  })

  await t.test('useLivingFlowState persistRecurringFieldMutation triggers Google sync for recurring edits', () => {
    assert.match(
      useLivingFlowStateSrc,
      /persistRecurringFieldMutation[\s\S]*?triggerGoogleEventSync/,
      'persistRecurringFieldMutation must invoke triggerGoogleEventSync for series updates'
    )
  })

  await t.test('useLivingFlowState handleRecurringDelete triggers Google sync', () => {
    assert.match(
      useLivingFlowStateSrc,
      /handleRecurringDelete[\s\S]*?triggerGoogleEventSync/,
      'handleRecurringDelete must invoke triggerGoogleEventSync'
    )
  })

  await t.test('EventEditSheet tracks recurrenceTouched when recurrence rule is modified', () => {
    assert.match(
      eventEditSheetSrc,
      /RecurrenceRuleBuilder[\s\S]*?setRecurrenceTouched\(true\)/,
      'EventEditSheet must set recurrenceTouched to true when RecurrenceRuleBuilder is changed'
    )
  })
})
