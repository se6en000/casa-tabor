import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const swSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const useNotificationsSource = readFileSync(new URL('../src/hooks/useNotifications.ts', import.meta.url), 'utf8')
const topBarSource = readFileSync(new URL('../src/components/shared/LuxuryTopBar.tsx', import.meta.url), 'utf8')
const navBarSource = readFileSync(new URL('../src/components/shared/NavBar.tsx', import.meta.url), 'utf8')
const tabletSidebarSource = readFileSync(new URL('../src/components/layout/TabletSidebar.tsx', import.meta.url), 'utf8')

test('Service Worker handles push action buttons directly in background via notification-action', () => {
  assert.match(swSource, /async function handlePushAction/, 'expected handlePushAction helper in sw.js')
  assert.match(swSource, /\/functions\/v1\/notification-action/, 'expected sw.js to call notification-action endpoint')
  assert.match(swSource, /handlePushAction\(action,\s*eventId,\s*prepItemId/, 'expected notificationclick to invoke handlePushAction')
  assert.match(swSource, /event\.waitUntil\(/, 'expected background action to be wrapped in event.waitUntil')
})

test('useNotifications includes all 17 backend notification types in type union', () => {
  const types = [
    'event_added',
    'event_updated',
    'event_enriched',
    'gmail_import',
    'conflict',
    'briefing_ready',
    'policy_conflict',
    'policy_prep',
    'directory_suggestions',
    'push_event_30',
    'push_event_5',
    'push_reminder_30',
    'push_reminder_5',
    'push_action_done',
    'push_action_snooze',
    'push_action_thumbs_down',
    'rate_limit_warning',
  ]

  for (const type of types) {
    assert.ok(
      useNotificationsSource.includes(`'${type}'`),
      `expected useNotifications.ts to include notification type '${type}'`
    )
  }
})

test('LuxuryTopBar does not render redundant mobile notification drawers or unread inbox badges', () => {
  assert.doesNotMatch(topBarSource, /NotificationDrawer/, 'LuxuryTopBar should not mount NotificationDrawer')
  assert.doesNotMatch(topBarSource, /useNotifications/, 'LuxuryTopBar should not load useNotifications')
  assert.match(topBarSource, /totalAttentionCount/, 'LuxuryTopBar should use totalAttentionCount for Triage Complication')
})

test('NavBar (Mobile) has no unread notification red badges or noisy Activity drawer buttons', () => {
  assert.doesNotMatch(navBarSource, /NotificationDrawer/, 'NavBar should not mount NotificationDrawer')
  assert.doesNotMatch(navBarSource, /unreadCount/, 'NavBar should not render unread inbox count badge')
  assert.match(navBarSource, /Action Queue/, 'NavBar More sheet should have Action Queue triage shortcut')
})

test('TabletSidebar does not mount unused NotificationDrawer', () => {
  assert.doesNotMatch(tabletSidebarSource, /NotificationDrawer/, 'TabletSidebar should not mount NotificationDrawer')
})
