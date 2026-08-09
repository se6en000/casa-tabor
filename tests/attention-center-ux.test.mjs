import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')
const hub = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')
const snoozeMenu = readFileSync(new URL('../src/components/shared/SnoozeMenu.tsx', import.meta.url), 'utf8')

test('Home Needs You renders at most three canonical attention topics', () => {
  assert.match(home, /buildAttentionTopics/)
  assert.match(home, /NEEDS_YOU_HOME_RAIL_LIMIT = 3/)
  assert.match(home, /sourceTypes/)
  assert.doesNotMatch(home, /clusterPrepItems/)
})

test('Action Center separates actionable topics from routine activity without duplicate Heads Up', () => {
  assert.match(hub, /buildAttentionTopics/)
  assert.match(hub, /'attention' \| 'activity'/)
  assert.match(hub, /Routine activity/)
  assert.doesNotMatch(hub, /<ConflictAlertsSection/)
  assert.doesNotMatch(hub, />Heads Up</)
  assert.doesNotMatch(hub, /Needs Your Attention/)
})

test('topic snooze targets the due date and keeps the requested duration choices', () => {
  assert.match(snoozeMenu, /dueDateIso/)
  assert.match(hub, /dueDateIso=\{item\.due_by \?\? item\.event_date\}/)
  assert.match(home, /dueDateIso=\{item\.due_by \?\? item\.event_date\}/)
})
