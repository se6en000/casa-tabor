import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (!process.argv.includes('--live-fixture')) {
  throw new Error('Pass --live-fixture to run the isolated recurrence command integration fixture.')
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
const runId = crypto.randomUUID()
const prefix = `Recurrence v2 integration ${runId}`
const actionIds = []
const templateIds = []
const seriesIds = []
const occurrenceIds = []

async function insertEvent(payload) {
  const { data, error } = await supabase.from('events').insert(payload).select('id').single()
  if (error) throw error
  return data.id
}

async function mutate({
  action,
  eventId,
  scope,
  type = 'update',
  revision,
  paths = [],
  details = {},
  series = {},
}) {
  actionIds.push(action)
  const { data, error } = await supabase.rpc('recurrence_apply_scoped_mutation_core', {
    p_action_id: action,
    p_selected_event_id: eventId,
    p_scope: scope,
    p_mutation_type: type,
    p_expected_series_revision: revision,
    p_changed_paths: paths,
    p_detail_patch: details,
    p_series_patch: series,
    p_actor: { type: 'integration_fixture' },
    p_correlation_id: runId,
  })
  if (error) throw error
  return data
}

try {
  const templateId = await insertEvent({
    title: `${prefix} template`,
    description: 'Reusable template',
    start_time: '2026-08-03T13:00:00.000Z',
    end_time: '2026-08-03T14:00:00.000Z',
    event_type: 'event',
    record_kind: 'series_template',
    is_enriched: true,
  })
  templateIds.push(templateId)

  const { data: series, error: seriesError } = await supabase.from('event_series').insert({
    template_event_id: templateId,
    timezone: 'America/New_York',
    recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=3'],
  }).select('id').single()
  if (seriesError) throw seriesError
  seriesIds.push(series.id)

  for (const [index, day] of ['03', '10', '17'].entries()) {
    occurrenceIds.push(await insertEvent({
      title: `${prefix} occurrence`,
      start_time: `2026-08-${day}T13:00:00.000Z`,
      end_time: `2026-08-${day}T14:00:00.000Z`,
      event_type: 'event',
      record_kind: 'occurrence',
      series_id: series.id,
      occurrence_key: `2026-08-${day}T09:00:00[America/New_York]`,
      original_start_time: `2026-08-${day}T13:00:00.000Z`,
      series_revision_applied: 1,
      is_enriched: true,
    }))
  }

  const checklistKey = crypto.randomUUID()
  const actionKey = crypto.randomUUID()
  await supabase.from('event_checklist_items').insert([
    { event_id: templateId, label: 'Bring water', checked: false, template_item_key: checklistKey, template_revision: 1 },
    { event_id: occurrenceIds[0], label: 'Bring water', checked: true, template_item_key: checklistKey, template_revision: 1 },
    { event_id: occurrenceIds[1], label: 'Bring water', checked: false, template_item_key: checklistKey, template_revision: 1 },
    { event_id: occurrenceIds[2], label: 'Bring water', checked: false, template_item_key: checklistKey, template_revision: 1 },
  ])
  await supabase.from('event_action_items').insert([
    { event_id: templateId, title: 'Complete form', completed: false, template_item_key: actionKey, template_revision: 1 },
    { event_id: occurrenceIds[0], title: 'Complete form', completed: true, completed_at: '2026-08-01T12:00:00Z', template_item_key: actionKey, template_revision: 1 },
  ])

  const oneAction = `recurrence-fixture-this-${runId}`
  const one = await mutate({
    action: oneAction,
    eventId: occurrenceIds[0],
    scope: 'this',
    revision: 1,
    paths: ['event.title', 'transportationPlan'],
    details: {
      event: { title: `${prefix} one-off` },
      transportation_plan: {
        version: 1,
        legs: [{
          id: crypto.randomUUID(),
          origin: { name: 'Home', address: '1 Main St' },
          destination: { name: 'Clinic', address: '2 Main St' },
          driverId: null,
          driverName: 'Giselle',
          passengers: ['Owen'],
          purpose: 'drive',
          timing: 'arrive_by',
          time: '09:00',
        }],
      },
    },
  })
  assert.equal(one.series_revision, 2)
  assert.equal(one.affected_occurrences, 1)

  const replay = await mutate({
    action: oneAction,
    eventId: occurrenceIds[0],
    scope: 'this',
    revision: 1,
    paths: ['event.title'],
    details: { event: { title: 'must not apply' } },
  })
  assert.equal(replay.idempotent_replay, true)

  const stale = await supabase.rpc('recurrence_apply_scoped_mutation_core', {
    p_action_id: `recurrence-fixture-stale-${runId}`,
    p_selected_event_id: occurrenceIds[1],
    p_scope: 'all',
    p_mutation_type: 'update',
    p_expected_series_revision: 1,
    p_changed_paths: ['event.title'],
    p_detail_patch: { event: { title: 'stale title' } },
    p_series_patch: {
      timezone: 'America/New_York',
      recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=3'],
    },
    p_actor: { type: 'integration_fixture' },
    p_correlation_id: runId,
  })
  assert.match(stale.error?.message ?? '', /expected revision 1, current revision 2/)

  const all = await mutate({
    action: `recurrence-fixture-all-${runId}`,
    eventId: occurrenceIds[1],
    scope: 'all',
    revision: 2,
    paths: ['event.title', 'checklistDefinitions', 'actionDefinitions'],
    details: {
      event: { title: `${prefix} all` },
      checklist_definitions: [{
        template_item_key: checklistKey,
        label: 'Bring a full water bottle',
        category: 'gear',
        sort_order: 0,
      }],
      action_definitions: [{
        template_item_key: actionKey,
        title: 'Complete updated form',
        is_urgent: true,
      }],
    },
    series: {
      timezone: 'America/New_York',
      recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=3'],
      preserve_exceptions: true,
    },
  })
  assert.equal(all.series_revision, 3)
  assert.equal(all.affected_occurrences, 3)

  const { data: afterAll, error: afterAllError } = await supabase
    .from('events')
    .select('id,title,is_exception,exception_paths')
    .in('id', occurrenceIds)
  if (afterAllError) throw afterAllError
  assert.equal(afterAll.find((event) => event.id === occurrenceIds[0]).title, `${prefix} one-off`)
  assert.equal(afterAll.find((event) => event.id === occurrenceIds[1]).title, `${prefix} all`)
  assert.equal(afterAll.find((event) => event.id === occurrenceIds[0]).is_exception, true)
  assert.deepEqual(
    afterAll.find((event) => event.id === occurrenceIds[0]).exception_paths,
    ['event.title', 'transportationPlan'],
  )
  const { data: progress } = await supabase
    .from('event_checklist_items')
    .select('checked,label')
    .eq('event_id', occurrenceIds[0])
    .eq('template_item_key', checklistKey)
    .single()
  assert.equal(progress.checked, true)
  assert.equal(progress.label, 'Bring a full water bottle')
  const { data: actionProgress } = await supabase
    .from('event_action_items')
    .select('completed,title')
    .eq('event_id', occurrenceIds[0])
    .eq('template_item_key', actionKey)
    .single()
  assert.equal(actionProgress.completed, true)
  assert.equal(actionProgress.title, 'Complete updated form')

  const replaceTitle = await mutate({
    action: `recurrence-fixture-replace-title-${runId}`,
    eventId: occurrenceIds[1],
    scope: 'all',
    revision: 3,
    paths: ['event.title'],
    details: { event: { title: `${prefix} replaced title` } },
    series: {
      timezone: 'America/New_York',
      recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=3'],
      preserve_exceptions: false,
    },
  })
  assert.equal(replaceTitle.series_revision, 4)
  const { data: afterReplace } = await supabase
    .from('events')
    .select('id,title,is_exception,exception_paths')
    .in('id', occurrenceIds)
  assert.ok(afterReplace.every((event) => event.title === `${prefix} replaced title`))
  assert.equal(afterReplace.find((event) => event.id === occurrenceIds[0]).is_exception, true)
  assert.deepEqual(
    afterReplace.find((event) => event.id === occurrenceIds[0]).exception_paths,
    ['transportationPlan'],
  )

  const reset = await mutate({
    action: `recurrence-fixture-reset-${runId}`,
    eventId: occurrenceIds[0],
    scope: 'this',
    type: 'reset_exceptions',
    revision: 4,
    paths: ['event.title'],
  })
  assert.equal(reset.series_revision, 5)
  const { data: resetOccurrence } = await supabase
    .from('events')
    .select('title,is_exception,exception_paths')
    .eq('id', occurrenceIds[0])
    .single()
  assert.equal(resetOccurrence.title, `${prefix} replaced title`)
  assert.equal(resetOccurrence.is_exception, true)
  assert.deepEqual(resetOccurrence.exception_paths, ['transportationPlan'])

  const split = await mutate({
    action: `recurrence-fixture-future-${runId}`,
    eventId: occurrenceIds[1],
    scope: 'future',
    revision: 5,
    paths: ['event.title'],
    details: { event: { title: `${prefix} future` } },
    series: {
      timezone: 'America/New_York',
      original_recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=1'],
      future_recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=2'],
    },
  })
  assert.ok(split.future_series_id)
  seriesIds.push(split.future_series_id)
  const { data: futureSeries } = await supabase
    .from('event_series')
    .select('template_event_id,revision,parent_series_id')
    .eq('id', split.future_series_id)
    .single()
  templateIds.push(futureSeries.template_event_id)
  assert.equal(futureSeries.revision, 2)
  assert.equal(futureSeries.parent_series_id, series.id)
  const { data: movedOccurrences } = await supabase
    .from('events')
    .select('id,title,series_id')
    .in('id', occurrenceIds)
  assert.equal(movedOccurrences.find((event) => event.id === occurrenceIds[0]).series_id, series.id)
  assert.equal(movedOccurrences.find((event) => event.id === occurrenceIds[1]).series_id, split.future_series_id)
  assert.equal(movedOccurrences.find((event) => event.id === occurrenceIds[1]).title, `${prefix} future`)

  const sameBoundary = await mutate({
    action: `recurrence-fixture-same-boundary-${runId}`,
    eventId: occurrenceIds[1],
    scope: 'future',
    revision: 2,
    paths: ['event.title'],
    details: { event: { title: `${prefix} same boundary` } },
    series: {
      timezone: 'America/New_York',
      original_recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=1'],
      future_recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=2'],
    },
  })
  assert.equal(sameBoundary.future_series_id, null)
  assert.equal(sameBoundary.series_revision, 3)

  const consolidated = await mutate({
    action: `recurrence-fixture-family-all-${runId}`,
    eventId: occurrenceIds[1],
    scope: 'all',
    revision: 3,
    paths: ['event.title'],
    details: { event: { title: `${prefix} consolidated` } },
    series: {
      timezone: 'America/New_York',
      recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=3'],
    },
  })
  assert.equal(consolidated.series_id, series.id)
  assert.equal(consolidated.series_revision, 7)
  const { data: consolidatedOccurrences } = await supabase
    .from('events')
    .select('id,title,series_id,is_exception,exception_paths')
    .in('id', occurrenceIds)
  assert.ok(consolidatedOccurrences.every((event) => event.series_id === series.id))
  assert.ok(consolidatedOccurrences.every((event) => event.title === `${prefix} consolidated`))
  assert.equal(consolidatedOccurrences.find((event) => event.id === occurrenceIds[0]).is_exception, true)
  assert.deepEqual(
    consolidatedOccurrences.find((event) => event.id === occurrenceIds[0]).exception_paths,
    ['transportationPlan'],
  )
  assert.ok(
    consolidatedOccurrences
      .filter((event) => event.id !== occurrenceIds[0])
      .every((event) => event.is_exception === false && event.exception_paths.length === 0),
  )

  const deleted = await mutate({
    action: `recurrence-fixture-delete-${runId}`,
    eventId: occurrenceIds[1],
    scope: 'this',
    type: 'delete',
    revision: 7,
  })
  assert.equal(deleted.series_revision, 8)
  const { data: tombstone } = await supabase
    .from('events')
    .select('deleted_at,purge_after')
    .eq('id', occurrenceIds[1])
    .single()
  assert.ok(tombstone.deleted_at)
  assert.ok(tombstone.purge_after)

  const restored = await mutate({
    action: `recurrence-fixture-restore-${runId}`,
    eventId: occurrenceIds[1],
    scope: 'this',
    type: 'restore',
    revision: 8,
  })
  assert.equal(restored.series_revision, 9)
  const { data: restoredOccurrence } = await supabase
    .from('events')
    .select('deleted_at,purge_after')
    .eq('id', occurrenceIds[1])
    .single()
  assert.equal(restoredOccurrence.deleted_at, null)
  assert.equal(restoredOccurrence.purge_after, null)

  console.log(JSON.stringify({
    success: true,
    oneOccurrence: true,
    idempotency: true,
    staleRevisionRejected: true,
    preservedExceptionsByDefault: true,
    replacedOnlyEditedExceptions: true,
    occurrenceProgressPreserved: true,
    futureSplit: true,
    sameBoundaryReused: true,
    linkedFamilyConsolidated: true,
    deleteRestore: true,
  }))
} finally {
  if (actionIds.length) {
    await supabase.from('recurrence_mutation_history').delete().in('action_id', actionIds)
  }
  if (occurrenceIds.length) {
    await supabase.from('events').delete().in('id', occurrenceIds)
  }
  if (seriesIds.length) {
    await supabase.from('event_series').delete().in('id', seriesIds)
  }
  if (templateIds.length) {
    await supabase.from('events').delete().in('id', templateIds)
  }
  await supabase.from('events').delete().ilike('title', `${prefix}%`)
}
