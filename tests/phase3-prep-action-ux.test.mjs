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

test('EventDetailPanel gates date formatting on the full event being loaded, not just the { id } stub used by openEventDetails', () => {
  // App.tsx passes `{ id: eventId } as EventWithDetails` synchronously, before useEventDetails
  // resolves. Every date field formatted below assumes a real row (start_time etc.), so the
  // panel must not run PanelHeader/PanelBody/PanelFooter against that stub — otherwise
  // `format(new Date(undefined), ...)` throws "Invalid time value" and crashes to the
  // app-wide error boundary the moment "View event" is clicked from a Prep & Action card.
  const eventDetailPanel = readFileSync(new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url), 'utf8')
  assert.match(eventDetailPanel, /const isHydrated = Boolean\(event\?\.start_time\)/)
  assert.match(eventDetailPanel, /\{!isHydrated \? \(/)
  assert.match(eventDetailPanel, /\{isHydrated && \(\s*<PanelFooter/)
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

test('ActionHubPage wires priorityVisual into its prep-item card face as a compact icon (unified with Needs You)', () => {
  // Prep & Action's card face was redesigned to match the "Needs You" home rail:
  // priority.borderClass (the left-border eyebrow) and the priority.chip text pill are
  // no longer used here — priority now renders as a small AlertTriangle icon in the meta
  // row, same as HomeRightPanel. priorityVisual() itself is unchanged (still exported for
  // ActionHubPage's icon-tone lookup and any other consumer).
  assert.match(actionHubPage, /priorityVisual\(item\.priority\)/)
  assert.match(actionHubPage, /priority\.chip/)
  assert.doesNotMatch(actionHubPage, /priority\.borderClass/)
})

test('HomeRightPanel wires priorityVisual into a compact card face without the left-border eyebrow', () => {
  // Needs You cards use the same bg-casa-bg background as the "This week" day cells above them
  // (rather than pure-white bg-casa-surface) and a small icon-only priority indicator instead of
  // the left-border "eyebrow" + text chip — priority.borderClass is intentionally unused here
  // (see priority.chip below for the icon).
  assert.match(homeRightPanel, /priorityVisual\(item\.priority\)/)
  assert.match(homeRightPanel, /priority\.chip/)
  assert.match(homeRightPanel, /rounded-card border border-casa-border bg-casa-bg/)
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
  // reusing the ActionHubPage-style PrepItemAssigneeChip component. Clicking either opens an
  // inline PrepAssignPicker popover that assigns via useSetPrepItemAssignee immediately.
  assert.match(homeRightPanel, /PersonAvatarStack/)
  assert.match(homeRightPanel, /icon=\{<UserPlus size=\{11\} \/>\}/)
  assert.match(homeRightPanel, /Assign\s*<\/Chip>/)
  assert.match(homeRightPanel, /function PrepAssignPicker/)
  assert.match(homeRightPanel, /useSetPrepItemAssignee/)
})

test('clearAll excludes unread conflict/policy_conflict rows from the bulk delete', () => {
  assert.match(useNotifications, /\.or\('read\.eq\.true,type\.not\.in\.\(conflict,policy_conflict\)'\)/)
})

test('ActionHubPage separates actionable topics from routine activity', () => {
  assert.match(actionHubPage, /buildAttentionTopics\(filteredPrepItems, attentionTopicRules\)/)
  assert.match(actionHubPage, /activityLogNotifications/)
  assert.match(actionHubPage, /Needs you · \$\{attentionTopics\.length\}/)
  assert.match(actionHubPage, /Routine activity · \$\{activityLogNotifications\.length\}/)
  assert.doesNotMatch(actionHubPage, /Needs Your Attention/)
  assert.doesNotMatch(actionHubPage, /Heads Up/)
})
