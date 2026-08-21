import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  ROUTINE_CHECKLIST_SETTINGS_KEY,
  ROUTINE_CHECKLIST_STORAGE_KEY,
  ROUTINE_CHECKLIST_REALTIME_CHANNEL,
  ROUTINE_CHECKLIST_BROADCAST_EVENT,
  ROUTINE_CHECKLIST_DOM_EVENT,
  CLIENT_INSTANCE_ID,
} from '../src/utils/routineChecklistSync.ts'

test('routineChecklistSync: constants adhere to canonical keys and channels', () => {
  assert.equal(ROUTINE_CHECKLIST_SETTINGS_KEY, 'routine_checklist_completions')
  assert.equal(ROUTINE_CHECKLIST_STORAGE_KEY, 'casa_routine_checklist_completions')
  assert.equal(ROUTINE_CHECKLIST_REALTIME_CHANNEL, 'casa-routine-checklist-sync')
  assert.equal(ROUTINE_CHECKLIST_BROADCAST_EVENT, 'checklist-item-toggled')
  assert.equal(ROUTINE_CHECKLIST_DOM_EVENT, 'casa:routine-checklist-toggled')
  assert.ok(CLIENT_INSTANCE_ID && CLIENT_INSTANCE_ID.length > 0)
})

test('code integrity: useFamilyRoutineIntelligence integrates routine checklist sync and bounded polling', () => {
  const file = readFileSync('src/hooks/useFamilyRoutineIntelligence.ts', 'utf-8')
  assert.ok(file.includes('routineChecklistSync'), 'Imports routineChecklistSync')
  assert.ok(file.includes('subscribeToRoutineChecklistSync'), 'Subscribes to realtime sync')
  assert.ok(file.includes('saveRoutineChecklistToggle'), 'Saves toggle to sync pipeline')
  assert.ok(file.includes('queryKey: [\'routine-checklist-completions\']'), 'Queries server completions')
  assert.ok(file.includes('refetchInterval: isPageVisible ? 120_000 : false'), 'Uses 120s page-visibility bounded polling')
})

test('code integrity: CalmKioskView and useCalmKioskPresenter wire handleCompleteReminder to to-do checkboxes', () => {
  const presenterFile = readFileSync('src/hooks/useCalmKioskPresenter.ts', 'utf-8')
  assert.ok(presenterFile.includes('handleCompleteReminder'), 'Presenter exposes handleCompleteReminder')
  assert.ok(presenterFile.includes('completeReminder'), 'Presenter invokes completeReminder RPC')

  const kioskViewFile = readFileSync('src/components/canvas/CalmKioskView.tsx', 'utf-8')
  assert.ok(kioskViewFile.includes('handleCompleteReminder(evt.id)'), 'Kiosk view calls handleCompleteReminder on button tap')
})
