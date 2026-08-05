import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260805150000_prep_category_taxonomy_and_overdue_safety_valve.sql', import.meta.url),
  'utf8',
)
const prepCategories = readFileSync(new URL('../src/utils/prepCategories.ts', import.meta.url), 'utf8')
const usePrepItems = readFileSync(new URL('../src/hooks/usePrepItems.ts', import.meta.url), 'utf8')
const actionHub = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')
const detailPanel = readFileSync(new URL('../src/components/home/PrepItemDetailPanel.tsx', import.meta.url), 'utf8')
const analyzePrep = readFileSync(new URL('../supabase/functions/analyze-prep/index.ts', import.meta.url), 'utf8')
const applyPolicy = readFileSync(new URL('../supabase/functions/apply-notification-policy/index.ts', import.meta.url), 'utf8')
const orchestrate = readFileSync(new URL('../supabase/functions/orchestrate-household/index.ts', import.meta.url), 'utf8')
const types = readFileSync(new URL('../src/types/index.ts', import.meta.url), 'utf8')

const CATEGORY_KEYS = [
  'gift_occasion', 'food_hosting', 'forms_paperwork', 'bills_payments',
  'travel_trips', 'medical_health', 'household_errands', 'rsvp_response', 'general_todo',
]

test('migration enforces the 9-category taxonomy with a real check constraint', () => {
  assert.match(migration, /add column if not exists category text/)
  assert.match(migration, /add constraint prep_items_category_check/)
  for (const key of CATEGORY_KEYS) {
    assert.match(migration, new RegExp(key))
  }
})

test('migration backfills every historical free-text type into the new taxonomy', () => {
  assert.match(migration, /when type = 'gift' then 'gift_occasion'/)
  assert.match(migration, /when type in \('payment', 'billing', 'billing\/payment'\) then 'bills_payments'/)
  assert.match(migration, /when type in \('delivery', 'return'\) then 'household_errands'/)
  assert.match(migration, /when type in \('rsvp', 'response'\) then 'rsvp_response'/)
})

test('migration removes cancellation-type rows from the active task list (they are FYI, not tasks)', () => {
  assert.match(migration, /where type = 'cancellation' and dismissed = false/)
  assert.match(migration, /dismissed_reason = 'not_a_task'/)
})

test('migration adds an overdue safety valve (auto-expire after 45 days, never a silent delete)', () => {
  assert.match(migration, /auto_expire_stale_prep_items/)
  assert.match(migration, /due_by < now\(\) - interval '45 days'/)
  assert.doesNotMatch(migration, /delete from public\.prep_items/)
  assert.match(migration, /dismissed_reason = 'auto_expired_stale'/)
})

test('PrepItemCategory type and PrepItem.category are exported from shared types', () => {
  assert.match(types, /export type PrepItemCategory =/)
  for (const key of CATEGORY_KEYS) {
    assert.match(types, new RegExp(`'${key}'`))
  }
  assert.match(types, /category\?:\s*PrepItemCategory\s*\|\s*null/)
})

test('prepCategories.ts is the single source of truth for label/icon/tone, no emojis', () => {
  assert.match(prepCategories, /export const PREP_CATEGORIES/)
  assert.match(prepCategories, /export function getPrepCategoryConfig/)
  assert.doesNotMatch(prepCategories, /[\u{1F300}-\u{1FAFF}]/u)
  for (const key of CATEGORY_KEYS) {
    assert.match(prepCategories, new RegExp(`key: '${key}'`))
  }
})

test('ActionHubPage filter chips derive from PREP_CATEGORIES, not a hand-rolled type list', () => {
  assert.match(actionHub, /import { PREP_CATEGORIES, getPrepCategoryConfig } from '\.\.\/utils\/prepCategories'/)
  assert.doesNotMatch(actionHub, /key: 'renewals'/) // dead filter for a type value that never existed in real data
  assert.doesNotMatch(actionHub, /item\.type === 'payment'/)
})

test('ActionHubPage prep cards render a category badge using the shared config', () => {
  assert.match(actionHub, /getPrepCategoryConfig\(item\)/)
  assert.match(actionHub, /<Chip size="sm" tone={category\.tone}/)
})

test('ActionHubPage surfaces an overdue count in its KPI strip instead of a dead cancellations count', () => {
  assert.match(actionHub, /const overdue = prepItems\.filter/)
  assert.doesNotMatch(actionHub, /cancellations/i)
})

test('PrepItemDetailPanel shows the shared category label instead of the raw free-text type', () => {
  assert.match(detailPanel, /import { getPrepCategoryConfig } from '\.\.\/\.\.\/utils\/prepCategories'/)
  assert.doesNotMatch(detailPanel, /\{item\.type\}/)
})

test('usePrepItems no longer silently excludes overdue items (the task-graveyard bug)', () => {
  assert.doesNotMatch(usePrepItems, /\.gte\('due_by', now\)/)
  assert.match(usePrepItems, /aOverdue/) // overdue items are sorted to the front, not dropped
})

test('apply-notification-policy prep query no longer excludes overdue items, and escalates them once via a past_due bucket', () => {
  assert.doesNotMatch(applyPolicy, /\.gte\('due_by', nowIso\)/)
  assert.match(applyPolicy, /if \(dueInMins < 0\) return 'past_due'/)
})

test('orchestrate-household prep query no longer excludes overdue items', () => {
  assert.doesNotMatch(orchestrate, /\.gte\('due_by', nowIso\)/)
})

test('analyze-prep prompt and insert use the enforced category enum, not free-text type', () => {
  assert.match(analyzePrep, /"category": "gift_occasion\|food_hosting\|forms_paperwork\|bills_payments\|travel_trips\|medical_health\|household_errands\|rsvp_response\|general_todo"/)
  assert.match(analyzePrep, /VALID_CATEGORIES/)
  assert.match(analyzePrep, /category: item\.category/)
  assert.doesNotMatch(analyzePrep, /"type": "gift\|dish/)
})
