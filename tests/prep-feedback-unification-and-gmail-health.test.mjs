import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260805160000_unify_prep_item_downvote_feedback.sql', import.meta.url),
  'utf8',
)
const usePrepItems = readFileSync(new URL('../src/hooks/usePrepItems.ts', import.meta.url), 'utf8')
const notificationAction = readFileSync(new URL('../supabase/functions/notification-action/index.ts', import.meta.url), 'utf8')
const homeRightPanel = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')
const actionHubPage = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')
const notificationSource = readFileSync(new URL('../src/utils/notificationSource.ts', import.meta.url), 'utf8')
const gmailHealth = readFileSync(new URL('../src/utils/gmailHealth.ts', import.meta.url), 'utf8')

test('record_prep_item_downvote is the single source of truth for downvote feedback', () => {
  assert.match(migration, /create or replace function public\.record_prep_item_downvote/)
  assert.match(migration, /insert into public\.prep_item_feedback/)
  assert.match(migration, /public\.prep_item_suppressions/)
  assert.match(migration, /public\.resolve_prep_item\(p_prep_item_id, 'not_relevant'\)/)
  assert.match(migration, /grant execute on function public\.record_prep_item_downvote\(uuid\)/)
})

test('notification-action thumbs_down delegates to the shared RPC instead of duplicating feedback logic', () => {
  assert.match(notificationAction, /sb\.rpc\('record_prep_item_downvote', \{\s*p_prep_item_id: prep_item_id,?\s*\}\)/)
  assert.doesNotMatch(notificationAction, /from\('prep_item_suppressions'\)/)
})

test('useDownvotePrepItem calls the shared RPC, not a dumb dismiss-only stub', () => {
  assert.match(usePrepItems, /supabase\.rpc\('record_prep_item_downvote', \{ p_prep_item_id: id \}\)/)
  assert.doesNotMatch(usePrepItems, /stub — marks as dismissed/)
})

test('HomeRightPanel no longer renders a fake thumbs-up button', () => {
  assert.doesNotMatch(homeRightPanel, /ThumbsUp/)
  assert.doesNotMatch(homeRightPanel, /Mark suggestion helpful/)
  assert.match(homeRightPanel, /ThumbsDown/)
})

test('HomeRightPanel surfaces an actionable Gmail health warning independent of prep item count', () => {
  assert.match(homeRightPanel, /summarizeGmailHealth/)
  assert.match(homeRightPanel, /to="\/settings\/google"/)
})

test('HomeRightPanel and ActionHubPage collapse prep duplicates into merged clusters before rendering action controls', () => {
  assert.match(homeRightPanel, /clusterPrepItems\(rawPrepItems\)/)
  assert.match(homeRightPanel, /related items merged/)
  assert.match(homeRightPanel, /eventDateIso=\{item\.event_date\}/)
  assert.match(actionHubPage, /clusterPrepItems\(filteredPrepItems\)/)
  assert.match(actionHubPage, /related items merged/)
  assert.match(actionHubPage, /clusterIds/)
})

test('ActionHubPage replaces the raw scanner-health ops metric with the shared Gmail health chip', () => {
  assert.match(actionHubPage, /summarizeGmailHealth/)
  assert.doesNotMatch(actionHubPage, /Scanner health/)
  assert.doesNotMatch(actionHubPage, /messages processed in 6h/)
  assert.match(actionHubPage, /to="\/settings\/google"/)
})

test('ActionHubPage translates raw notification.source into plain language', () => {
  assert.match(actionHubPage, /humanizeNotificationSource\(n\.source\)/)
  assert.doesNotMatch(actionHubPage, /\{n\.source \?\? 'system'\}/)
})

test('notificationSource maps every known internal source value to a human label', () => {
  assert.match(notificationSource, /policy: 'Casa'/)
  assert.match(notificationSource, /manual: 'You'/)
  assert.match(notificationSource, /system: 'Automatic'/)
})

test('summarizeGmailHealth flags reauthorization and sync errors before staleness, and is silent when off', () => {
  assert.match(gmailHealth, /reauthorization_required \|\| r\.health_status === 'reauthorization_required'/)
  assert.match(gmailHealth, /last_sync_error \|\| r\.health_status === 'degraded'/)
  assert.match(gmailHealth, /STALE_AFTER_MS = 45 \* 60 \* 1000/)
  assert.match(gmailHealth, /status: 'off'/)
})
