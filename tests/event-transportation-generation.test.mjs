import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const edge = readFileSync(resolve('supabase/functions/ensure-event-transportation-plan/index.ts'), 'utf8')
const core = readFileSync(resolve('supabase/functions/_shared/event-transportation-defaults.mjs'), 'utf8')
const migration = readFileSync(resolve('supabase/migrations/20260715255000_unify_event_transportation_plans.sql'), 'utf8')
const authRepairMigration = readFileSync(resolve('supabase/migrations/20260715256000_fix_transportation_trigger_auth.sql'), 'utf8')
const queueMigration = readFileSync(resolve('supabase/migrations/20260715257000_durable_transportation_generation_queue.sql'), 'utf8')
const queueRepairMigration = readFileSync(resolve('supabase/migrations/20260715258000_preserve_transportation_queue_on_dispatch_failure.sql'), 'utf8')
const splitTriggerMigration = readFileSync(resolve('supabase/migrations/20260715259000_split_transportation_generation_triggers.sql'), 'utf8')
const deletedTargetMigration = readFileSync(resolve('supabase/migrations/20260715260000_ignore_deleted_transportation_queue_targets.sql'), 'utf8')
const backfill = readFileSync(resolve('scripts/backfill-event-transportation-plans.mjs'), 'utf8')
const config = readFileSync(resolve('supabase/config.toml'), 'utf8')

test('automatic plan generation is service-only and never overwrites manual plans', () => {
  assert.match(edge, /serviceAuthorized = bearerToken\(req\) === serviceRoleKey/)
  assert.match(edge, /x-casa-transportation-trigger/)
  assert.match(edge, /mayReplaceTransportationPlan\(currentPlan\)/)
  assert.match(edge, /skipped: 'manual_plan'/)
  assert.match(core, /source: 'generated'/)
  assert.match(config, /\[functions\.ensure-event-transportation-plan\]\s+verify_jwt = false/)
  assert.ok(edge.indexOf('mayReplaceTransportationPlan(currentPlan)') < edge.indexOf('places:searchText'))
})

test('event, member, and enrichment changes all reach the same idempotent generator', () => {
  assert.match(migration, /auto_transportation_plan_on_event_change/)
  assert.match(migration, /auto_transportation_plan_on_member_change/)
  assert.match(migration, /auto_transportation_plan_on_enrichment_change/)
  assert.equal(
    (migration.match(/trigger_event_transportation_plan_generation\(\)/g) ?? []).length,
    4,
  )
  assert.match(migration, /where name = 'transportation_trigger_secret'/)
  assert.match(migration, /'X-Casa-Transportation-Trigger', trigger_secret/)
  assert.match(authRepairMigration, /where name = 'transportation_trigger_secret'/)
  assert.match(authRepairMigration, /'X-Casa-Transportation-Trigger', trigger_secret/)
  assert.match(queueMigration, /event_transportation_generation_queue/)
  assert.match(queueMigration, /on conflict \(event_id\) do update/)
  assert.match(queueMigration, /dispatch_pending_event_transportation_plans/)
  assert.match(queueMigration, /'\* \* \* \* \*'/)
  assert.match(queueRepairMigration, /if tg_table_name = 'events' then\s+target_event_id := new\.id/)
  assert.match(queueRepairMigration, /begin[\s\S]*?net\.http_post[\s\S]*?exception when others/)
  assert.match(splitTriggerMigration, /trigger_event_transportation_member_generation/)
  assert.match(splitTriggerMigration, /trigger_event_transportation_enrichment_generation/)
  assert.match(splitTriggerMigration, /enqueue_event_transportation_plan_generation/)
  assert.doesNotMatch(splitTriggerMigration, /tg_table_name/)
  assert.match(deletedTargetMigration, /if not exists \(select 1 from public\.events where id = target_event_id\) then return/)
  assert.match(edge, /event\.record_kind === 'series_template'/)
  assert.match(edge, /fetch\(`\$\{supabaseUrl\}\/functions\/v1\/materialize-recurring-events`/)
  assert.match(edge, /event\.record_kind === 'occurrence'/)
  assert.match(edge, /event\.exception_paths\.length === 0/)
  assert.match(edge, /inherited_from_template/)
  assert.match(edge, /Plan saved but queue acknowledgement failed/)
})

test('Places matches remain unconfirmed and blocked from Google projection', () => {
  assert.match(edge, /maxResultCount: 1/)
  assert.match(edge, /applyHomeStateBias\(query, homeConfig\?\.state\)/)
  assert.match(edge, /const textQuery = applyHomeStateBias/)
  assert.match(edge, /\.eq\('title', event\.title\)[\s\S]*?\.eq\('location_name', event\.location_name\)/)
  assert.match(edge, /formattedAddress/)
  assert.match(edge, /verified: false/)
  assert.match(edge, /location_projection_blocked: true/)
  assert.ok(edge.indexOf('location_projection_blocked: true') < edge.indexOf('const { data: updatedEvent'))
  assert.match(migration, /location_projection_blocked boolean not null default false/)
})

test('backfill is dry-run by default and invokes the same production generator when applied', () => {
  assert.match(backfill, /process\.argv\.includes\('--apply'\)/)
  assert.match(backfill, /--apply requires --snapshot <path>/)
  assert.match(backfill, /protected_manual_plans/)
  assert.match(backfill, /mode: apply \? 'apply' : 'dry-run'/)
  assert.match(backfill, /if \(!apply\) process\.exit\(0\)/)
  assert.match(backfill, /functions\.invoke\('ensure-event-transportation-plan'/)
  assert.match(backfill, /manual_skips/)
  assert.match(backfill, /unresolved/)
  assert.match(backfill, /Generated plan verification failed/)
  assert.match(backfill, /Protected manual plan changed/)
})
