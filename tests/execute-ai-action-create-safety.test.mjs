import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260813133000_audit_ai_event_creates.sql', import.meta.url), 'utf8')
const provenanceMigration = readFileSync(new URL('../supabase/migrations/20260813130000_ai_temporal_provenance.sql', import.meta.url), 'utf8')

test('executor validates AI create provenance before querying or inserting events', () => {
  const createBlock = source.split("if (tool === 'create_event')")[1]?.split("if (tool === 'create_recipe')")[0] ?? ''
  assert.match(createBlock, /validateCalendarTemporalProvenance/)
  assert.match(createBlock, /assessCalendarCreatePreflight/)
  assert.match(createBlock, /allow_calendar_conflicts/)
  assert.ok(createBlock.indexOf('validateCalendarTemporalProvenance') < createBlock.indexOf(".from('events').insert"))
})

test('executor reruns authoritative preflight and audits event creates', () => {
  const createBlock = source.split("if (tool === 'create_event')")[1]?.split("if (tool === 'create_recipe')")[0] ?? ''
  assert.match(createBlock, /event_members\(family_members\(name\)\)/)
  assert.match(createBlock, /probable_duplicate_blocked/)
  assert.match(source, /async function auditEventCreate/)
  assert.match(source, /from\('ai_event_edit_history'\)\.upsert/)
  assert.match(createBlock, /auditEventCreate/)
  assert.match(migration, /create_event/)
})

test('executor links and completes a promoted undated draft', () => {
  const createBlock = source.split("if (tool === 'create_event')")[1]?.split("if (tool === 'create_recipe')")[0] ?? ''
  assert.match(createBlock, /promoteCalendarDraft/)
  assert.match(createBlock, /draft_project_item_id/)
  assert.match(createBlock, /draft_promoted/)
  assert.match(provenanceMigration, /calendar_event_id/)
})
