import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (!process.argv.includes('--live-fixture')) {
  throw new Error('Pass --live-fixture to run the isolated recurrence materializer fixture.')
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
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(env.VITE_SUPABASE_URL, serviceRoleKey)
const runId = crypto.randomUUID()
const prefix = `Recurrence materializer integration ${runId}`
let templateId
let seriesId

async function materialize() {
  const response = await fetch(
    `${env.VITE_SUPABASE_URL}/functions/v1/materialize-recurring-events`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
        'x-correlation-id': runId,
      },
      body: JSON.stringify({
        series_id: seriesId,
        range_start: '2026-08-01T00:00:00.000Z',
        range_end: '2026-08-31T23:59:59.999Z',
      }),
    },
  )
  const result = await response.json()
  if (!response.ok) {
    const { data: overrides } = await supabase
      .from('event_plan_overrides')
      .select('event_id,transportation_plan')
      .eq('event_id', templateId)
    throw new Error(JSON.stringify({ result, templateOverrides: overrides }))
  }
  return result
}

async function occurrences() {
  const { data, error } = await supabase
    .from('events')
    .select('id,title,occurrence_key,is_exception,exception_paths,deleted_at,tombstone_origin')
    .eq('series_id', seriesId)
    .order('start_time')
  if (error) throw error
  return data
}

try {
  const { data: template, error: templateError } = await supabase.from('events').insert({
    title: `${prefix} original`,
    description: 'Materialized from the canonical template',
    start_time: '2026-08-03T13:00:00.000Z',
    end_time: '2026-08-03T14:00:00.000Z',
    event_type: 'event',
    record_kind: 'series_template',
    is_enriched: true,
  }).select('id').single()
  if (templateError) throw templateError
  templateId = template.id

  const checklistKey = crypto.randomUUID()
  const { error: checklistError } = await supabase.from('event_checklist_items').insert({
    event_id: templateId,
    label: 'Bring water',
    checked: false,
    template_item_key: checklistKey,
    template_revision: 1,
  })
  if (checklistError) throw checklistError

  const { data: series, error: seriesError } = await supabase.from('event_series').insert({
    template_event_id: templateId,
    timezone: 'America/New_York',
    recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=3'],
  }).select('id').single()
  if (seriesError) throw seriesError
  seriesId = series.id

  const { data: templateOverrides, error: templateOverridesError } = await supabase
    .from('event_plan_overrides')
    .select('transportation_plan')
    .eq('event_id', templateId)
  if (templateOverridesError) throw templateOverridesError
  assert.deepEqual(templateOverrides, [])

  const firstRun = await materialize()
  assert.equal(firstRun.processed, 1)
  assert.equal(firstRun.results[0].created, 3)
  const initial = await occurrences()
  assert.equal(initial.length, 3)
  const initialIds = initial.map((event) => event.id)

  const first = initial[0]
  const second = initial[1]
  const third = initial[2]
  await supabase.from('events').update({
    title: `${prefix} exception`,
    is_exception: true,
    exception_paths: ['event.title'],
  }).eq('id', first.id)
  await supabase.from('event_checklist_items').update({ checked: true })
    .eq('event_id', first.id)
    .eq('template_item_key', checklistKey)
  await supabase.from('events').update({
    deleted_at: '2026-07-15T12:00:00.000Z',
    purge_after: '2026-08-14T12:00:00.000Z',
    status: 'cancelled',
  }).eq('id', second.id)
  await supabase.from('events').update({ title: `${prefix} inherited` }).eq('id', templateId)

  const secondRun = await materialize()
  assert.equal(secondRun.results[0].created, 0)
  assert.equal(secondRun.results[0].preserved, 1)
  const reconciled = await occurrences()
  assert.deepEqual(reconciled.map((event) => event.id), initialIds)
  assert.equal(reconciled[0].title, `${prefix} exception`)
  assert.equal(reconciled[1].deleted_at, '2026-07-15T12:00:00+00:00')
  assert.equal(reconciled[1].tombstone_origin, 'user')
  assert.equal(reconciled[2].title, `${prefix} inherited`)
  const { data: checklistProgress } = await supabase
    .from('event_checklist_items')
    .select('checked')
    .eq('event_id', first.id)
    .eq('template_item_key', checklistKey)
    .single()
  assert.equal(checklistProgress.checked, true)

  await supabase.from('event_series').update({
    recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=2'],
    revision: 2,
  }).eq('id', seriesId)
  const shortened = await materialize()
  assert.equal(shortened.results[0].tombstoned, 1)
  const afterShorten = await occurrences()
  assert.equal(afterShorten.find((event) => event.id === third.id).tombstone_origin, 'recurrence')

  await supabase.from('event_series').update({
    recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=3'],
    revision: 3,
  }).eq('id', seriesId)
  const restored = await materialize()
  assert.equal(restored.results[0].restored, 1)
  const final = await occurrences()
  assert.equal(final.find((event) => event.id === third.id).deleted_at, null)
  assert.equal(final.find((event) => event.id === second.id).tombstone_origin, 'user')

  console.log(JSON.stringify({
    success: true,
    stableOccurrenceIds: true,
    inheritedUpdates: true,
    explicitExceptionsPreserved: true,
    progressPreserved: true,
    recurrenceTombstoneRestored: true,
    userDeletionPreserved: true,
  }))
} finally {
  if (seriesId) {
    const { data } = await supabase.from('events').select('id').eq('series_id', seriesId)
    const ids = (data ?? []).map((event) => event.id)
    if (ids.length) await supabase.from('events').delete().in('id', ids)
    await supabase.from('event_series').delete().eq('id', seriesId)
  }
  if (templateId) await supabase.from('events').delete().eq('id', templateId)
  await supabase.from('events').delete().ilike('title', `${prefix}%`)
}
