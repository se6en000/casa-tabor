import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { formatInTimeZone } from 'date-fns-tz'
import {
  buildReusableBundle,
  diffReusablePaths,
  stableJson,
} from './recurrence-v2-migration-inventory-core.mjs'
import { resolveEffectiveDetailBundle } from '../supabase/functions/_shared/recurrence-detail-bundle-core.mjs'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

const mode = process.argv.includes('--apply')
  ? 'apply'
  : process.argv.includes('--rollback')
    ? 'rollback'
    : process.argv.includes('--verify')
      ? 'verify'
    : 'dry-run'
const inventoryPath = argument('--inventory')
const actionId = argument('--action-id')
const outputPath = argument('--output')

if (!inventoryPath) throw new Error('Pass --inventory with a recurrence migration inventory JSON file.')
if (mode !== 'dry-run' && !actionId) throw new Error(`Pass --action-id when running --${mode}.`)

const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
if (inventory.readOnly !== true || inventory.schemaVersion !== 1) {
  throw new Error('Unsupported or non-read-only recurrence inventory.')
}
if (inventory.summary.duplicateGoogleLinks !== 0
    || inventory.summary.missingGoogleRows !== 0
    || inventory.summary.instanceFetchFailures !== 0) {
  throw new Error('Inventory has unresolved identity or Google fetch failures.')
}

function occurrenceKey(link, timezone) {
  if (link.allDay) {
    return String(link.originalStart).slice(0, 10)
  }
  const instant = new Date(link.originalStart)
  if (!Number.isFinite(instant.getTime())) {
    throw new Error(`Invalid original start for event ${link.eventId}.`)
  }
  return `${formatInTimeZone(instant, timezone, "yyyy-MM-dd'T'HH:mm:ss")}[${timezone}]`
}

function buildPlan(report) {
  const series = report.accounts.flatMap((account) => account.series)
    .filter((item) => item.casaOccurrenceCount > 0)
    .map((item) => {
      if (!item.templateSourceEventId || !item.masterStart || !item.masterEnd) {
        throw new Error(`Series ${item.googleMasterId} lacks a template source or recurrence anchor.`)
      }
      const exceptions = new Map(
        item.proposedCasaExceptions.map((occurrence) => [occurrence.eventId, occurrence.exceptionPaths]),
      )
      const masterDurationMs = new Date(item.masterEnd).getTime() - new Date(item.masterStart).getTime()
      const masterAllDay = /^\d{4}-\d{2}-\d{2}$/.test(item.masterStart)
      return {
        account: item.account,
        googleMasterId: item.googleMasterId,
        iCalUID: item.iCalUID,
        googleEtag: item.googleEtag,
        googleUpdatedAt: item.googleUpdatedAt,
        timezone: item.timezone,
        recurrenceLines: item.recurrence,
        masterStart: item.masterStart,
        masterEnd: item.masterEnd,
        templateSourceEventId: item.templateSourceEventId,
        inventoryDisposition: item.migrationDisposition,
        occurrences: item.occurrenceLinks.map((link) => {
          const exceptionPaths = new Set(exceptions.get(link.eventId) ?? [])
          if (link.durationMs !== masterDurationMs) exceptionPaths.add('event.durationMs')
          if (link.allDay !== masterAllDay) exceptionPaths.add('event.allDay')
          return {
            eventId: link.eventId,
            googleEventId: link.googleEventId,
            identityMatch: link.identityMatch,
            occurrenceKey: occurrenceKey(link, item.timezone),
            originalStartTime: link.allDay ? null : link.originalStart,
            originalStartDate: link.allDay ? String(link.originalStart).slice(0, 10) : null,
            exceptionPaths: [...exceptionPaths].sort(),
            googleEtag: link.googleEtag,
            googleUpdatedAt: link.googleUpdatedAt,
          }
        }),
      }
    })
    .sort((left, right) => left.googleMasterId.localeCompare(right.googleMasterId))
  const occurrenceIds = series.flatMap((item) => item.occurrences.map((occurrence) => occurrence.eventId))
  if (new Set(occurrenceIds).size !== occurrenceIds.length) {
    throw new Error('Shadow plan assigns one or more Casa events to multiple series.')
  }
  for (const item of series) {
    const keys = item.occurrences.map((occurrence) => occurrence.occurrenceKey)
    if (new Set(keys).size !== keys.length) {
      throw new Error(`Series ${item.googleMasterId} has duplicate occurrence keys.`)
    }
  }
  return {
    schemaVersion: 1,
    inventoryGeneratedAt: report.generatedAt,
    series,
  }
}

const plan = buildPlan(inventory)
const planHash = createHash('sha256').update(stableJson(plan)).digest('hex')
const summary = {
  mode,
  planHash,
  seriesCount: plan.series.length,
  occurrenceCount: plan.series.reduce((total, item) => total + item.occurrences.length, 0),
  exceptionOccurrenceCount: plan.series.reduce(
    (total, item) => total + item.occurrences.filter((occurrence) => occurrence.exceptionPaths.length > 0).length,
    0,
  ),
  legacyPrefixOccurrenceCount: plan.series.reduce(
    (total, item) => total + item.occurrences.filter((occurrence) => occurrence.identityMatch === 'master_id_prefix').length,
    0,
  ),
  manualReviewSeries: plan.series.filter((item) => item.inventoryDisposition === 'manual_review').length,
}

if (outputPath) writeFileSync(outputPath, `${JSON.stringify({ planHash, plan }, null, 2)}\n`)
if (mode === 'dry-run') {
  console.log(JSON.stringify({ ...summary, outputPath }, null, 2))
  process.exit(0)
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      return [
        line.slice(0, separator),
        line.slice(separator + 1).replace(/^['"]|['"]$/g, ''),
      ]
    }),
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function rowsByEvent(table, select, eventIds) {
  const rows = []
  for (let offset = 0; offset < eventIds.length; offset += 100) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in('event_id', eventIds.slice(offset, offset + 100))
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
  }
  return rows
}

function indexChildren(rows) {
  const index = new Map()
  for (const row of rows) {
    const children = index.get(row.event_id) ?? []
    children.push(row)
    index.set(row.event_id, children)
  }
  return index
}

async function loadBundles(eventIds) {
  const { data: events, error } = await supabase
    .from('events')
    .select('id,title,description,start_time,end_time,all_day,location_name,address,lat,lng,event_type')
    .in('id', eventIds)
  if (error) throw error
  const [members, enrichment, planOverride, logistics, checklist, actions] = await Promise.all([
    rowsByEvent('event_members', 'event_id,family_member_id,role', eventIds),
    rowsByEvent('event_enrichments', 'event_id,confidence,what_to_bring,prep_notes,category,category_locked,outfit_suggestion,parking_notes,contact_name,contact_phone,cost_estimate,dietary_notes,meal_impact', eventIds),
    rowsByEvent('event_plan_overrides', 'event_id,transportation_plan', eventIds),
    rowsByEvent('event_logistics', 'event_id,sort_order,step_type,icon,title,description,time,location_name,address', eventIds),
    rowsByEvent('event_checklist_items', 'event_id,label,note,checked,category,sort_order', eventIds),
    rowsByEvent('event_action_items', 'event_id,title,description,due_date,is_urgent,completed,completed_at,assigned_to,template_due_offset_minutes', eventIds),
  ])
  const indexes = {
    members: indexChildren(members),
    enrichment: indexChildren(enrichment),
    planOverride: indexChildren(planOverride),
    logistics: indexChildren(logistics),
    checklist: indexChildren(checklist),
    actions: indexChildren(actions),
  }
  return new Map(events.map((event) => {
    const bundle = buildReusableBundle(event, {
      members: indexes.members.get(event.id),
      enrichment: indexes.enrichment.get(event.id),
      planOverride: indexes.planOverride.get(event.id),
      logistics: indexes.logistics.get(event.id),
      checklist: indexes.checklist.get(event.id),
      actions: indexes.actions.get(event.id),
    })
    return [event.id, bundle]
  }))
}

async function bundleHashes(eventIds) {
  const bundles = await loadBundles(eventIds)
  return new Map([...bundles].map(([eventId, bundle]) => [
    eventId,
    createHash('sha256').update(stableJson(bundle)).digest('hex'),
  ]))
}

async function verifyAppliedMigration(migrationActionId) {
  const { data: migration, error: migrationError } = await supabase
    .from('recurrence_shadow_migrations')
    .select('plan,manifest,status')
    .eq('action_id', migrationActionId)
    .single()
  if (migrationError) throw migrationError
  if (migration.status !== 'applied') throw new Error(`Shadow migration ${migrationActionId} is not applied.`)

  const manifestByMaster = new Map(
    migration.manifest.series.map((item) => [item.google_master_id, item]),
  )
  const occurrenceIds = migration.plan.series.flatMap(
    (item) => item.occurrences.map((occurrence) => occurrence.eventId),
  )
  const templateIds = migration.manifest.series.map((item) => item.template_event_id)
  const bundles = await loadBundles([...occurrenceIds, ...templateIds])
  const { data: occurrenceRows, error: occurrenceError } = await supabase
    .from('events')
    .select('id,record_kind,series_id,occurrence_key,is_exception,exception_paths,series_revision_applied')
    .in('id', occurrenceIds)
  if (occurrenceError) throw occurrenceError
  const occurrenceById = new Map(occurrenceRows.map((event) => [event.id, event]))
  const effectiveBundleMismatches = []
  const metadataMismatches = []

  for (const series of migration.plan.series) {
    const manifest = manifestByMaster.get(series.googleMasterId)
    const templateBundle = bundles.get(manifest.template_event_id)
    for (const planned of series.occurrences) {
      const row = occurrenceById.get(planned.eventId)
      const occurrenceBundle = bundles.get(planned.eventId)
      if (!row
          || row.record_kind !== 'occurrence'
          || row.series_id !== manifest.series_id
          || row.occurrence_key !== planned.occurrenceKey
          || row.series_revision_applied !== 1
          || stableJson(row.exception_paths) !== stableJson(planned.exceptionPaths)) {
        metadataMismatches.push(planned.eventId)
        continue
      }
      const effective = resolveEffectiveDetailBundle({
        template: { reusable: templateBundle, revision: 1 },
        occurrence: {
          reusable: occurrenceBundle,
          facts: {},
          exceptionPaths: row.exception_paths,
          seriesRevisionApplied: row.series_revision_applied,
        },
      })
      if (stableJson(effective.reusable) !== stableJson(occurrenceBundle)) {
        effectiveBundleMismatches.push({
          eventId: planned.eventId,
          paths: diffReusablePaths(effective.reusable, occurrenceBundle),
        })
      }
    }
  }

  const [
    { count: visibleTemplates },
    { count: seriesCount },
    { count: linkedOccurrenceCount },
    { data: flags, error: flagsError },
  ] = await Promise.all([
    supabase.from('events').select('id', { head: true, count: 'exact' })
      .in('id', templateIds).neq('status', 'cancelled'),
    supabase.from('event_series').select('id', { head: true, count: 'exact' })
      .in('id', migration.manifest.series.map((item) => item.series_id)),
    supabase.from('events').select('id', { head: true, count: 'exact' })
      .in('id', occurrenceIds).eq('record_kind', 'occurrence'),
    supabase.from('settings').select('value').eq('key', 'recurrence_v2_flags').single(),
  ])
  if (flagsError) throw flagsError
  return {
    effectiveBundleMismatches,
    metadataMismatches,
    visibleTemplates,
    seriesCount,
    linkedOccurrenceCount,
    flagsDisabled: !Object.values(flags.value).some((value) => value === true),
  }
}

if (mode === 'rollback') {
  const { data, error } = await supabase.rpc('recurrence_rollback_shadow_migration', {
    p_action_id: actionId,
  })
  if (error) throw error
  console.log(JSON.stringify({ ...summary, result: data }, null, 2))
  process.exit(0)
}

if (mode === 'verify') {
  const verification = await verifyAppliedMigration(actionId)
  if (verification.effectiveBundleMismatches.length > 0
      || verification.metadataMismatches.length > 0
      || verification.visibleTemplates !== 0
      || verification.seriesCount !== summary.seriesCount
      || verification.linkedOccurrenceCount !== summary.occurrenceCount
      || !verification.flagsDisabled) {
    throw new Error(`Applied shadow migration verification failed: ${JSON.stringify(verification)}`)
  }
  console.log(JSON.stringify({ ...summary, verification }, null, 2))
  process.exit(0)
}

const eventIds = plan.series.flatMap((item) => item.occurrences.map((occurrence) => occurrence.eventId))
const [{ data: flagSetting, error: flagError }, { count: existingSeriesCount }] = await Promise.all([
  supabase.from('settings').select('value').eq('key', 'recurrence_v2_flags').single(),
  supabase.from('event_series').select('id', { head: true, count: 'exact' }),
])
if (flagError) throw flagError
if (Object.values(flagSetting.value).some((value) => value === true)) {
  throw new Error('All recurrence v2 rollout flags must remain disabled during shadow migration.')
}
if (existingSeriesCount !== 0) {
  throw new Error(`Expected zero existing v2 series before initial shadow migration; found ${existingSeriesCount}.`)
}
const beforeHashes = await bundleHashes(eventIds)
const [
  { count: beforeVisible },
  { count: beforeNotifications },
  { count: beforeEvents },
] = await Promise.all([
  supabase.from('events').select('id', { head: true, count: 'exact' }).neq('status', 'cancelled'),
  supabase.from('notifications').select('id', { head: true, count: 'exact' }),
  supabase.from('events').select('id', { head: true, count: 'exact' }),
])
const { data: manifest, error: applyError } = await supabase.rpc(
  'recurrence_apply_shadow_migration',
  {
    p_action_id: actionId,
    p_plan: plan,
    p_actor: { type: 'recurrence_v2_shadow_script', plan_hash: planHash },
  },
)
if (applyError) throw applyError

const afterHashes = await bundleHashes(eventIds)
const changedBundles = eventIds.filter((eventId) => beforeHashes.get(eventId) !== afterHashes.get(eventId))
const [
  { count: afterVisible },
  { count: afterNotifications },
  { count: afterEvents },
  { count: linkedOccurrences },
  { count: templateCount },
  { count: seriesCount },
] = await Promise.all([
  supabase.from('events').select('id', { head: true, count: 'exact' }).neq('status', 'cancelled'),
  supabase.from('notifications').select('id', { head: true, count: 'exact' }),
  supabase.from('events').select('id', { head: true, count: 'exact' }),
  supabase.from('events').select('id', { head: true, count: 'exact' }).eq('record_kind', 'occurrence'),
  supabase.from('events').select('id', { head: true, count: 'exact' }).eq('record_kind', 'series_template'),
  supabase.from('event_series').select('id', { head: true, count: 'exact' }),
])
const verification = {
  changedBundles,
  visibleEventDelta: afterVisible - beforeVisible,
  notificationDelta: afterNotifications - beforeNotifications,
  totalEventDelta: afterEvents - beforeEvents,
  linkedOccurrences,
  templateCount,
  seriesCount,
  semantic: await verifyAppliedMigration(actionId),
}
if (changedBundles.length > 0
    || verification.visibleEventDelta !== 0
    || verification.notificationDelta !== 0
    || verification.totalEventDelta !== plan.series.length
    || linkedOccurrences !== summary.occurrenceCount
    || templateCount !== summary.seriesCount
    || seriesCount !== summary.seriesCount
    || verification.semantic.effectiveBundleMismatches.length > 0
    || verification.semantic.metadataMismatches.length > 0
    || verification.semantic.visibleTemplates !== 0
    || !verification.semantic.flagsDisabled) {
  const { data: rollback, error: rollbackError } = await supabase.rpc(
    'recurrence_rollback_shadow_migration',
    { p_action_id: actionId },
  )
  throw new Error(
    `Shadow migration verification failed and rollback ${rollbackError ? `failed: ${rollbackError.message}` : `succeeded: ${JSON.stringify(rollback)}`}: ${JSON.stringify(verification)}`,
  )
}
console.log(JSON.stringify({ ...summary, manifest, verification }, null, 2))
