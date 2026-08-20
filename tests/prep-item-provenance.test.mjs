import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260804194443_prep_items_assignment.sql', import.meta.url),
  'utf8',
)
const prepHooks = readFileSync(new URL('../src/hooks/usePrepItems.ts', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/canvas/widgets/ActionInspectionSidecar.tsx', import.meta.url), 'utf8')
const types = readFileSync(new URL('../src/types/index.ts', import.meta.url), 'utf8')

test('migration adds a nullable assigned_to FK to family_members on prep_items', () => {
  assert.match(migration, /alter table public\.prep_items/)
  assert.match(migration, /add column if not exists assigned_to uuid references public\.family_members\(id\) on delete set null/)
})

test('PrepItem type exposes source_confidence and assigned_to', () => {
  const prepItemBlock = types.slice(types.indexOf('export interface PrepItem'), types.indexOf('export interface PrepItem') + 600)
  assert.match(prepItemBlock, /source_confidence\?:\s*number\s*\|\s*null/)
  assert.match(prepItemBlock, /assigned_to\?:\s*string\s*\|\s*null/)
})

test('usePrepItemDetails is a real query, not a stub', () => {
  assert.doesNotMatch(prepHooks, /stub — returns the item as-is from cache/)
  assert.match(prepHooks, /queryKey: \['prep-item-details', item\?\.id\]/)
})

test('gmail source_ref is parsed into memberId/messageId to fetch the real email body', () => {
  assert.match(prepHooks, /\/\^gmail:\(\[\^:\]\+\):\(\.\+\)\$\//)
  assert.match(prepHooks, /from\('gmail_processed_messages'\)/)
  assert.match(prepHooks, /select\('subject, from_email, received_at, email_body'\)/)
})

test('calendar_ai items fetch a linked event snapshot for validation context', () => {
  assert.match(prepHooks, /item\.source_type === 'calendar_ai'/)
  assert.match(prepHooks, /from\('events'\)/)
  assert.match(prepHooks, /select\('title, start_time, end_time, all_day, location_name, address, description'\)/)
})

test('assignment suggestions resolve the linked event id from event_id or reminder source_ref', () => {
  assert.match(prepHooks, /function resolveLinkedEventId/)
  assert.match(prepHooks, /if \(item\.event_id\) return item\.event_id/)
  assert.match(prepHooks, /UUID_RE\.test\(item\.source_ref\)/)
  assert.match(prepHooks, /from\('event_members'\)/)
})

test('confidence label uses documented High\u2265.75 / Medium\u2265.4 / Low thresholds', () => {
  assert.match(prepHooks, /confidence >= 0\.75.*High confidence/)
  assert.match(prepHooks, /confidence >= 0\.4.*Medium confidence/)
  assert.match(prepHooks, /Low confidence/)
})

test('due_by edits update only the prep item, never the linked calendar event', () => {
  assert.match(prepHooks, /export function useUpdatePrepItemDueBy/)
  const fnBody = prepHooks.slice(prepHooks.indexOf('export function useUpdatePrepItemDueBy'))
  assert.match(fnBody, /from\('prep_items'\)/)
  assert.doesNotMatch(fnBody, /from\('events'\)/)
})

test('assignment is a single-select mutation against prep_items.assigned_to', () => {
  assert.match(prepHooks, /export function useSetPrepItemAssignee/)
  const fnBody = prepHooks.slice(prepHooks.indexOf('export function useSetPrepItemAssignee'))
  assert.match(fnBody, /update\(\{ assigned_to: familyMemberId \}\)/)
})

test('ActionInspectionSidecar uses usePrepItemDetails and source synthesis', () => {
  assert.match(panel, /usePrepItemDetails/)
  assert.match(panel, /synthesizeActionAnalysis/)
  assert.match(panel, /useFamilyMembers/)
})
