import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildCasaDetailsLines,
  googleLocationForEvent,
} from '../supabase/functions/_shared/google-event-details-core.mjs'

const createGoogle = readFileSync(resolve('supabase/functions/create-google-event/index.ts'), 'utf8')
const pushGoogle = readFileSync(resolve('supabase/functions/push-to-google/index.ts'), 'utf8')
const updateRecurring = readFileSync(resolve('supabase/functions/update-recurring-google/index.ts'), 'utf8')
const recurrenceProjection = readFileSync(resolve('supabase/functions/_shared/google-recurrence-projection-core.mjs'), 'utf8')
const migration = readFileSync(resolve('supabase/migrations/20260715247000_unify_google_projection_details.sql'), 'utf8')
const queueHardening = readFileSync(resolve('supabase/migrations/20260715248000_harden_legacy_google_projection_queue.sql'), 'utf8')
const queueWorker = readFileSync(resolve('supabase/functions/process-google-sync-jobs/index.ts'), 'utf8')

test('all Google write paths use the shared details projection', () => {
  for (const source of [createGoogle, pushGoogle, updateRecurring, recurrenceProjection]) {
    assert.match(source, /google-event-details-core\.mjs/)
    assert.match(source, /buildGoogleEventDescription/)
  }
  for (const source of [createGoogle, pushGoogle, updateRecurring]) {
    assert.match(source, /recurrence_build_reusable_patch/)
  }
})

test('automatically resolved unconfirmed addresses stay out of every Google projection field', () => {
  const event = { location_name: 'Possible Clinic', address: '100 Possible Way' }
  const bundle = {
    plan_override: { location_projection_blocked: true },
    transportation_plan: {
      version: 1,
      legs: [{
        origin: { name: 'Home', address: '1 Casa Way' },
        destination: { name: 'Possible Clinic', address: '100 Possible Way' },
        purpose: 'appointment',
      }],
    },
  }
  assert.equal(googleLocationForEvent(event, bundle), undefined)
  assert.equal(buildCasaDetailsLines(bundle).some((line) => line.startsWith('Transportation ')), false)
  assert.equal(
    googleLocationForEvent(event, {
      ...bundle,
      plan_override: { location_projection_blocked: false },
    }),
    'Possible Clinic, 100 Possible Way',
  )
})

test('updates preserve Google-owned description text before replacing Casa details', () => {
  assert.match(pushGoogle, /getGoogleEvent/)
  assert.match(pushGoogle, /existingDescription: current\.description/)
  assert.equal(
    (pushGoogle.match(/current\.eventType && current\.eventType !== 'default'/g) ?? []).length,
    2,
  )
  assert.match(updateRecurring, /getGoogleEvent/)
  assert.match(updateRecurring, /existingDescription: current\.description/)
})

test('projection bundle includes member names and legacy planning context', () => {
  assert.match(migration, /'members'/)
  assert.match(migration, /family_member\.name/)
  assert.match(migration, /'plan_override'/)
  assert.match(migration, /'driver_names'/)
  assert.match(migration, /'transportation_plan'/)
})

test('detail writes enqueue deduplicated non-canonical Google projection work', () => {
  assert.match(migration, /create or replace function public\.queue_google_projection_detail_change/)
  for (const table of [
    'event_plan_overrides',
    'event_enrichments',
    'event_members',
    'event_logistics',
    'event_checklist_items',
    'event_action_items',
  ]) {
    assert.match(migration, new RegExp(`'${table}'`))
  }
  assert.match(migration, /status in \('pending', 'retrying'\)/)
  assert.match(migration, /v_event\.series_id is not null/)
  assert.match(migration, /series\.template_event_id = v_event_id/)
})

test('legacy projection queue uses one queued follow-up and atomic worker leases', () => {
  assert.match(queueHardening, /google_sync_jobs_one_queued_per_event/)
  assert.match(queueHardening, /on conflict \(event_id\) where status in \('pending', 'retrying'\)/)
  assert.match(queueHardening, /create or replace function public\.claim_google_sync_jobs/)
  assert.match(queueHardening, /for update skip locked/)
  assert.match(queueHardening, /Recovered after worker lease expired/)
  assert.match(queueHardening, /create or replace function public\.finish_google_sync_job/)
  assert.match(queueHardening, /lease is no longer owned by this worker/)
  assert.match(queueWorker, /rpc\('claim_google_sync_jobs'/)
  assert.match(queueWorker, /rpc\('finish_google_sync_job'/)
  assert.doesNotMatch(queueWorker, /\.from\('google_sync_jobs'\)[\s\S]*\.update\(/)
})
