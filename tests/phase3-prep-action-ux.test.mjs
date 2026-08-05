import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appTsx = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const openEventDetailsUtil = readFileSync(new URL('../src/utils/openEventDetails.ts', import.meta.url), 'utf8')
const prepPriority = readFileSync(new URL('../src/utils/prepPriority.ts', import.meta.url), 'utf8')
const actionHubPage = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')
const prepItemDetailPanel = readFileSync(new URL('../src/components/home/PrepItemDetailPanel.tsx', import.meta.url), 'utf8')
const homeRightPanel = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')
const assigneeChip = readFileSync(new URL('../src/components/shared/PrepItemAssigneeChip.tsx', import.meta.url), 'utf8')
const useNotifications = readFileSync(new URL('../src/hooks/useNotifications.ts', import.meta.url), 'utf8')

test('App listens for a global casa:open-event-details event and opens the Event Details sheet', () => {
  assert.match(appTsx, /casa:open-event-details/)
  assert.match(appTsx, /setAiDrawerOpen\(false\)/)
  assert.match(appTsx, /setSelectedDrawerEvent\(\{ id: eventId \}/)
})

test('openEventDetails helper dispatches the global custom event', () => {
  assert.match(openEventDetailsUtil, /export function openEventDetails\(eventId: string\)/)
  assert.match(openEventDetailsUtil, /new CustomEvent\('casa:open-event-details', \{ detail: \{ eventId \} \}\)/)
})

test('ActionHubPage and PrepItemDetailPanel open an existing event instead of drafting a duplicate via AI', () => {
  assert.match(actionHubPage, /item\.event_id/)
  assert.match(actionHubPage, /openEventDetails\(item\.event_id!\)/)
  assert.match(actionHubPage, /View event/)

  assert.match(prepItemDetailPanel, /item\.event_id/)
  assert.match(prepItemDetailPanel, /openEventDetails\(item\.event_id!\)/)
  assert.match(prepItemDetailPanel, /View event/)
})

test('priorityVisual gives priority >=3 a Critical danger chip and left-border accent', () => {
  assert.match(prepPriority, /borderClass: 'border-l-4 border-l-casa-error'/)
  assert.match(prepPriority, /label: 'Critical', tone: 'danger'/)
})

test('priorityVisual gives priority ===2 an Important warning chip', () => {
  assert.match(prepPriority, /label: 'Important', tone: 'warning'/)
})

test('priorityVisual shows no chip for baseline priority (never a color-only signal)', () => {
  assert.match(prepPriority, /chip: null/)
})

test('ActionHubPage and HomeRightPanel wire priorityVisual into their prep card borders and chips', () => {
  assert.match(actionHubPage, /priorityVisual\(item\.priority\)/)
  assert.match(actionHubPage, /priority\.borderClass/)
  assert.match(actionHubPage, /priority\.chip/)

  assert.match(homeRightPanel, /priorityVisual\(item\.priority\)/)
  assert.match(homeRightPanel, /priority\.borderClass/)
  assert.match(homeRightPanel, /priority\.chip/)
})

test('PrepItemAssigneeChip renders an avatar+name chip when assigned, and an Assign nudge when not', () => {
  assert.match(assigneeChip, /PersonAvatarStack/)
  assert.match(assigneeChip, /Assign/)
  assert.match(assigneeChip, /onNudge/)
})

test('ActionHubPage and HomeRightPanel surface assignment directly on prep card faces', () => {
  assert.match(actionHubPage, /PrepItemAssigneeChip/)
  // HomeRightPanel's compact row design (see home-needs-you-priority-order tests) inlines
  // assignment as an avatar-badge + name (or an "Assign" chip when unassigned) rather than
  // reusing the ActionHubPage-style PrepItemAssigneeChip component.
  assert.match(homeRightPanel, /PersonAvatarStack/)
  assert.match(homeRightPanel, /icon=\{<UserPlus size=\{11\} \/>\}>Assign</)
})

test('clearAll excludes unread conflict/policy_conflict rows from the bulk delete', () => {
  assert.match(useNotifications, /\.or\('read\.eq\.true,type\.not\.in\.\(conflict,policy_conflict\)'\)/)
})

test('ActionHubPage splits Recent Activity into Needs Your Attention and Activity Log', () => {
  assert.match(actionHubPage, /needsAttentionNotifications/)
  assert.match(actionHubPage, /activityLogNotifications/)
  assert.match(actionHubPage, /Needs Your Attention/)
  assert.match(actionHubPage, /Activity Log/)
  assert.match(actionHubPage, /Acknowledge/)
})
