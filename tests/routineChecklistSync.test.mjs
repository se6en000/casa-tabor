import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  TODO_COMPLETIONS_SETTINGS_KEY,
  TODO_COMPLETIONS_STORAGE_KEY,
  TODO_COMPLETIONS_REALTIME_CHANNEL,
  TODO_COMPLETIONS_BROADCAST_EVENT,
  TODO_COMPLETIONS_DOM_EVENT,
  CLIENT_INSTANCE_ID,
} from '../src/utils/todoCompletionsSync.ts'

test('todoCompletionsSync: constants adhere to canonical keys and channels', () => {
  assert.equal(TODO_COMPLETIONS_SETTINGS_KEY, 'household_todo_completions')
  assert.equal(TODO_COMPLETIONS_STORAGE_KEY, 'casa_household_todo_completions')
  assert.equal(TODO_COMPLETIONS_REALTIME_CHANNEL, 'casa-todos-sync')
  assert.equal(TODO_COMPLETIONS_BROADCAST_EVENT, 'todo-toggled')
  assert.equal(TODO_COMPLETIONS_DOM_EVENT, 'casa:todo-toggled')
  assert.ok(CLIENT_INSTANCE_ID && CLIENT_INSTANCE_ID.length > 0)
})

test('code integrity: App.tsx mounts useHouseholdTodoSync for persistent global realtime subscription', () => {
  const appFile = readFileSync('src/App.tsx', 'utf-8')
  assert.ok(appFile.includes('useHouseholdTodoSync'), 'App.tsx imports and mounts useHouseholdTodoSync')
})

test('code integrity: useFamilyRoutineIntelligence integrates todo sync and bounded polling', () => {
  const file = readFileSync('src/hooks/useFamilyRoutineIntelligence.ts', 'utf-8')
  assert.ok(file.includes('todoCompletionsSync'), 'Imports todoCompletionsSync')
  assert.ok(file.includes('subscribeToTodoSync'), 'Subscribes to realtime sync')
  assert.ok(file.includes('saveTodoToggle'), 'Saves toggle to sync pipeline')
  assert.ok(file.includes('queryKey: [\'household-todo-completions\']'), 'Queries server completions')
  assert.ok(file.includes('refetchInterval: isPageVisible ? 120_000 : false'), 'Uses 120s page-visibility bounded polling')
})

test('code integrity: CalmKioskView and useCalmKioskPresenter wire Option B Completed Today fold and toggle sync', () => {
  const presenterFile = readFileSync('src/hooks/useCalmKioskPresenter.ts', 'utf-8')
  assert.ok(presenterFile.includes('completedReminders'), 'Presenter exposes completedReminders')
  assert.ok(presenterFile.includes('handleToggleReminder'), 'Presenter exposes handleToggleReminder')

  const kioskViewFile = readFileSync('src/components/canvas/CalmKioskView.tsx', 'utf-8')
  assert.ok(kioskViewFile.includes('handleToggleReminder(evt.id)'), 'Kiosk view calls handleToggleReminder on button tap')
  assert.ok(kioskViewFile.includes('Completed Today'), 'Kiosk view renders Option B Completed Today section')
})
