import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// build-household-graph runs discover_directory_candidates() (see
// tests/directory-discovery-scan-cron.test.mjs for the new daily schedule),
// but nothing ever surfaced the result to a user — the discovery pipeline
// was completely invisible. Reuse the existing notifications/NotificationBell
// system (same pattern as event_enriched, gmail_import, etc.) instead of
// building a new UI surface: insert a notification when new candidates were
// found, with a click-through to Settings > Places to review/confirm.

const useNotifications = readFileSync(
  new URL('../src/hooks/useNotifications.ts', import.meta.url),
  'utf8',
)
const notificationDrawer = readFileSync(
  new URL('../src/components/shared/NotificationDrawer.tsx', import.meta.url),
  'utf8',
)
const buildHouseholdGraph = readFileSync(
  new URL('../supabase/functions/build-household-graph/index.ts', import.meta.url),
  'utf8',
)

test('Notification type union includes directory_suggestions', () => {
  assert.match(useNotifications, /'directory_suggestions'/)
})

test('NotificationDrawer has an icon/color config and a click handler for directory_suggestions', () => {
  assert.match(notificationDrawer, /directory_suggestions:\s*\{/)
  assert.match(notificationDrawer, /navigate\('\/settings\/places'\)/)
})

test('build-household-graph inserts a directory_suggestions notification only when new candidates were found', () => {
  const discoveryCallIndex = buildHouseholdGraph.indexOf("sb.rpc('discover_directory_candidates')")
  assert.ok(discoveryCallIndex > -1)
  const afterDiscovery = buildHouseholdGraph.slice(discoveryCallIndex)
  assert.match(afterDiscovery, /from\('notifications'\)\s*\.insert/)
  assert.match(afterDiscovery, /type:\s*'directory_suggestions'/)
  // Must gate on there actually being new candidates — never spam a zero-result notification
  assert.match(afterDiscovery, /totalInserted\s*>\s*0|total\s*>\s*0/)
})
