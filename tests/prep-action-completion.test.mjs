import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260715251000_make_prep_completion_durable.sql', import.meta.url),
  'utf8',
)
const linkedCompletionMigration = readFileSync(
  new URL('../supabase/migrations/20260717121000_complete_reminder_with_linked_actions.sql', import.meta.url),
  'utf8',
)
const prepHooks = readFileSync(new URL('../src/hooks/usePrepItems.ts', import.meta.url), 'utf8')
const reminderActions = readFileSync(new URL('../src/hooks/useReminderNeedsYouActions.ts', import.meta.url), 'utf8')
const analyzePrep = readFileSync(new URL('../supabase/functions/analyze-prep/index.ts', import.meta.url), 'utf8')
const scanGmail = readFileSync(new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url), 'utf8')
const notificationAction = readFileSync(new URL('../supabase/functions/notification-action/index.ts', import.meta.url), 'utf8')
const homeRightPanel = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')
const prepActionSection = readFileSync(new URL('../src/components/home/PrepActionSection.tsx', import.meta.url), 'utf8')
const actionHub = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')
const homePage = readFileSync(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf8')
const stackedView = readFileSync(new URL('../src/components/calendar/StackedView.tsx', import.meta.url), 'utf8')
const dayView = readFileSync(new URL('../src/components/calendar/DayView.tsx', import.meta.url), 'utf8')
const executor = readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')

test('database owns stable action identity and resolved identities cannot regenerate', () => {
  assert.match(migration, /create table if not exists public\.prep_item_resolutions/)
  assert.match(migration, /create unique index if not exists prep_items_one_active_action_key/)
  assert.match(migration, /create trigger enforce_prep_item_action_identity/)
  assert.match(migration, /where resolution\.action_key = new\.action_key/)
  assert.match(migration, /if tg_op = 'INSERT' then return null/)
  assert.match(migration, /'event:' \|\| p_event_id::text/)
  assert.match(migration, /lower\(coalesce\(nullif\(btrim\(p_type\), ''\), 'general'\)\)/)
})

test('Done is transactional and completes only linked reminder sources', () => {
  assert.match(migration, /create or replace function public\.resolve_prep_item/)
  assert.match(migration, /normalized_outcome = 'done'/)
  assert.match(migration, /item\.source_type in \('reminder_manual', 'reminder_missed'\)/)
  assert.match(migration, /event\.event_type = 'reminder'/)
  assert.match(migration, /set\s+status = 'cancelled'/)
  assert.match(migration, /where related\.action_key = item\.action_key/)
  assert.match(migration, /on conflict \(action_key\) do update/)
})

test('reminder completion transactionally resolves linked prep actions in both directions', () => {
  assert.match(linkedCompletionMigration, /create or replace function public\.complete_reminder_with_linked_actions/)
  assert.match(linkedCompletionMigration, /reminder\.event_type <> 'reminder'/)
  assert.match(linkedCompletionMigration, /item\.source_type in \('reminder_manual', 'reminder_missed'\)/)
  assert.match(linkedCompletionMigration, /perform public\.resolve_prep_item\(linked_item\.id, 'done'\)/)
  assert.match(linkedCompletionMigration, /reminder\.status = 'cancelled'/)
  assert.match(linkedCompletionMigration, /perform public\.resolve_prep_item\(stale_item\.id, 'done'\)/)
})

test('Done and Dismiss use distinct authoritative client outcomes', () => {
  assert.match(prepHooks, /export function useCompletePrepItem\(\)/)
  assert.match(prepHooks, /return useResolvePrepItem\('done'\)/)
  assert.match(prepHooks, /export function useDismissPrepItem\(\)/)
  assert.match(prepHooks, /return useResolvePrepItem\('dismissed'\)/)
  assert.match(prepHooks, /if \(error\) throw error/)
  assert.match(prepHooks, /if \(!data\?\.ok\) throw new Error/)
})

test('all prep generators preserve stable identity and surface write failures', () => {
  assert.doesNotMatch(reminderActions, /\.eq\('dismissed', false\)[\s\S]{0,200}\.in\('source_type', activeSources\)/)
  assert.match(scanGmail, /source_type: 'gmail'/)
  assert.match(scanGmail, /source_ref: `gmail:\$\{memberId\}:\$\{messageId\}`/)
  assert.match(scanGmail, /if \(error\) throw error/)
  assert.match(analyzePrep, /Failed to clear stale prep items/)
  assert.match(analyzePrep, /Failed to store prep items/)
})

test('interactive Done surfaces and push actions use completion, not dismissal', () => {
  for (const source of [homeRightPanel, prepActionSection, actionHub]) {
    assert.match(source, /useCompletePrepItem/)
    assert.match(source, /role="alert"/)
    assert.match(source, /The action is still active\./)
  }
  assert.match(notificationAction, /sb\.rpc\('resolve_prep_item'/)
  assert.match(notificationAction, /p_outcome: 'done'/)
  assert.match(notificationAction, /resolution\?\.reminder_completed/)
  for (const source of [homePage, stackedView, dayView]) {
    assert.match(source, /useReminderNeedsYouActions/)
    assert.doesNotMatch(source, /from\('events'\)\.update\(\{ status: 'cancelled' \}\)/)
  }
  assert.match(reminderActions, /complete_reminder_with_linked_actions/)
  assert.match(notificationAction, /complete_reminder_with_linked_actions/)
  assert.match(executor, /complete_reminder_with_linked_actions/)
})

test('approved current reminder cleanup is narrow and explicit', () => {
  assert.match(migration, /item\.source_ref = 'e1f846b9-588b-4d34-93e8-38700347b85b'/)
  assert.match(migration, /item\.event_title = 'Order Family Groceries'/)
  assert.match(migration, /perform public\.resolve_prep_item\(active_item_id, 'done'\)/)
})
