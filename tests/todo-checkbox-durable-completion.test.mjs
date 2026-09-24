import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: checking a to-do off in living-canvas's Today's To-Dos (the widget the
// user actually uses -- living_canvas is the default mode) never reached the
// database. Confirmed live: "Prep KTBD Stuff", checked off in the UI, still sat at
// status: 'confirmed', sync_version: 1, last_modified_source: 'ios' in the real
// database -- completely untouched since its original creation. Root cause:
// useCalmKioskPresenter's handleToggleReminder calls saveTodoToggle
// (src/utils/todoCompletionsSync.ts), a purely local + cross-Casa-device broadcast
// tracker (localStorage + a settings-table mirror + a realtime broadcast channel) --
// it never writes to events.status. That's why it never reached the iOS sync: as far
// as the canonical events table is concerned, nothing had changed. Classic mode's
// own checkbox (useReminderNeedsYouActions' completeReminder) and the sidecar's
// "Mark Done" both already call the real complete_reminder_with_linked_actions RPC
// correctly -- only this one surface had the gap.
//
// Fix: handleToggleReminder now also fires the durable, canonical mutation
// (completeReminder / the new reopenReminder) alongside the existing local/broadcast
// toggle, so the instant cross-device feel is unchanged but the completion is real.

const presenterSource = readFileSync(new URL('../src/hooks/useCalmKioskPresenter.ts', import.meta.url), 'utf8')
const actionsSource = readFileSync(new URL('../src/hooks/useReminderNeedsYouActions.ts', import.meta.url), 'utf8')

test('useReminderNeedsYouActions exposes a reopenReminder mutation (the complement to completeReminder)', () => {
  assert.match(actionsSource, /const reopenReminder = useCallback/)
  assert.match(actionsSource, /status:\s*'confirmed'/)
  const returnBlock = actionsSource.slice(actionsSource.lastIndexOf('return {'))
  assert.match(returnBlock, /reopenReminder,/)
})

test('handleToggleReminder calls the durable completion/reopen mutation, not just the local tracker', () => {
  const fnBody = presenterSource.slice(
    presenterSource.indexOf('const handleToggleReminder'),
    presenterSource.indexOf('const handleCompleteReminder'),
  )
  assert.match(fnBody, /completeReminder\(/)
  assert.match(fnBody, /reopenReminder\(/)
  // The local/broadcast tracker must stay -- it's what gives the instant,
  // cross-Casa-device feel; the fix adds durability, it doesn't replace the UX.
  assert.match(fnBody, /saveTodoToggle\(/)
})

test('useCalmKioskPresenter pulls completeReminder and reopenReminder from the same existing hook call, no new import needed', () => {
  assert.match(presenterSource, /const \{[^}]*completeReminder[^}]*reopenReminder[^}]*\} = useReminderNeedsYouActions\(\)/s)
})
