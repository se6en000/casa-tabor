import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (!process.argv.includes('--live-fixture')) {
  throw new Error('Pass --live-fixture to run the isolated recurrence AI integration fixture.')
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
const supabaseUrl = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, serviceKey)
const headers = {
  'content-type': 'application/json',
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
}
const runId = crypto.randomUUID()
const prefix = `Recurrence AI fixture ${runId}`
const actionIds = []
const eventIds = []
const seriesIds = []
const templateIds = []

function localOffset() {
  const minutes = -new Date().getTimezoneOffset()
  const sign = minutes >= 0 ? '+' : '-'
  const absolute = Math.abs(minutes)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

async function fetchJson(path, body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(payload)}`)
  return payload
}

async function insertEvent(payload) {
  const { data, error } = await supabase.from('events').insert(payload).select('id').single()
  if (error) throw error
  eventIds.push(data.id)
  return data.id
}

try {
  const baseStart = new Date()
  baseStart.setUTCDate(baseStart.getUTCDate() + 14)
  baseStart.setUTCHours(14, 0, 0, 0)

  const templateId = await insertEvent({
    title: `${prefix} practice`,
    start_time: baseStart.toISOString(),
    end_time: new Date(baseStart.getTime() + 3600000).toISOString(),
    event_type: 'event',
    record_kind: 'series_template',
    status: 'cancelled',
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

  const occurrenceIds = []
  for (let index = 0; index < 3; index += 1) {
    const start = new Date(baseStart.getTime() + index * 7 * 86400000)
    occurrenceIds.push(await insertEvent({
      title: `${prefix} practice`,
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + 3600000).toISOString(),
      event_type: 'event',
      record_kind: 'occurrence',
      series_id: series.id,
      occurrence_key: `${start.toISOString()}[America/New_York]`,
      original_start_time: start.toISOString(),
      series_revision_applied: 1,
      status: 'confirmed',
      is_enriched: true,
    }))
  }

  const { data: family, error: familyError } = await supabase
    .from('family_members')
    .select('id,name')
    .order('name')
  if (familyError) throw familyError
  const targetMember = family?.[0]
  assert.ok(targetMember, 'A family member is required for the live fixture.')

  const conversationId = `recurrence-ai-${runId}`
  const selectedId = occurrenceIds[1]
  const initialState = {
    activeEntityType: 'event',
    activeEventId: selectedId,
    activeEventUpdatedAt: new Date().toISOString(),
    eventType: 'event',
    expectedFollowUp: 'event_follow_up',
    establishedAt: new Date().toISOString(),
  }
  const firstText = `Add ${targetMember.name} to the event.`
  const first = await fetchJson('ai-assistant', {
    messages: [{ role: 'user', content: firstText }],
    context: {
      page: 'calendar',
      assistant_mode: 'calendar',
      currentDate: new Date().toString(),
      utcOffset: localOffset(),
      family,
      conversationState: initialState,
    },
    session_id: conversationId,
    correlation_id: `${conversationId}:scope-question`,
    trace_id: conversationId,
    turn_id: 'scope-question',
    lane: 'deterministic',
    client_trace_present: true,
    client_build: 'recurrence-v2-ai-integration',
    client_trace_source: 'release-gate',
    stream: false,
    dry_run: false,
    model_override: 'gemini-2.5-flash',
  })
  assert.equal(first.type, 'text')
  assert.match(first.text, /only this event, this and following events, or the entire series/i)
  assert.equal(first.conversation_state?.pendingMutation?.tool, 'update_event')

  const secondText = 'This and following events.'
  const second = await fetchJson('ai-assistant', {
    messages: [
      { role: 'user', content: firstText },
      { role: 'assistant', content: first.text },
      { role: 'user', content: secondText },
    ],
    context: {
      page: 'calendar',
      assistant_mode: 'calendar',
      currentDate: new Date().toString(),
      utcOffset: localOffset(),
      family,
      conversationState: first.conversation_state,
    },
    session_id: conversationId,
    correlation_id: `${conversationId}:scope-answer`,
    trace_id: conversationId,
    turn_id: 'scope-answer',
    lane: 'deterministic',
    client_trace_present: true,
    client_build: 'recurrence-v2-ai-integration',
    client_trace_source: 'release-gate',
    stream: false,
    dry_run: false,
    model_override: 'gemini-2.5-flash',
  })
  assert.equal(second.type, 'tool_action')
  assert.equal(second.tool, 'update_event')
  assert.equal(second.args.recurrence_scope, 'future')
  assert.equal(second.args.expected_series_revision, 1)

  const actionId = `recurrence-ai-update-${runId}`
  actionIds.push(actionId)
  const executed = await fetchJson('execute-ai-action', {
    tool: second.tool,
    args: second.args,
    action_id: actionId,
    session_id: conversationId,
    correlation_id: `${conversationId}:${actionId}`,
    trace_id: conversationId,
    turn_id: 'confirmed-update',
    lane: 'tool_action',
    client_trace_present: true,
    client_build: 'recurrence-v2-ai-integration',
    client_trace_source: 'release-gate',
  })
  assert.equal(executed.success, true)
  assert.equal(executed.recurrence_scope, 'future')
  if (executed.result?.future_series_id) seriesIds.push(executed.result.future_series_id)

  const { data: assigned, error: assignedError } = await supabase
    .from('event_members')
    .select('event_id,family_member_id')
    .in('event_id', occurrenceIds)
    .eq('family_member_id', targetMember.id)
  if (assignedError) throw assignedError
  assert.deepEqual(
    new Set((assigned ?? []).map((row) => row.event_id)),
    new Set([occurrenceIds[1], occurrenceIds[2]]),
  )

  console.log(JSON.stringify({
    success: true,
    scopeClarification: true,
    multiTurnScopeResume: true,
    confirmationOnlyProposal: true,
    canonicalExecution: true,
    futureAssignments: 2,
  }))
} finally {
  const { data: fixtureEvents, error: fixtureLoadError } = await supabase
    .from('events')
    .select('id,record_kind,series_id')
    .ilike('title', `${prefix}%`)
  if (fixtureLoadError) throw fixtureLoadError
  const discoveredEventIds = [...new Set((fixtureEvents ?? []).map((event) => event.id))]
  const discoveredSeriesIds = [...new Set([
    ...seriesIds,
    ...(fixtureEvents ?? []).map((event) => event.series_id).filter(Boolean),
  ])]
  const discoveredTemplateIds = [...new Set([
    ...templateIds,
    ...(fixtureEvents ?? [])
      .filter((event) => event.record_kind === 'series_template')
      .map((event) => event.id),
  ])]
  const occurrenceIds = discoveredEventIds.filter((id) => !discoveredTemplateIds.includes(id))

  if (actionIds.length || discoveredEventIds.length || discoveredSeriesIds.length) {
    let historyDelete = supabase.from('recurrence_mutation_history').delete()
    if (actionIds.length) {
      historyDelete = historyDelete.in('action_id', actionIds)
    } else if (discoveredEventIds.length) {
      historyDelete = historyDelete.in('selected_event_id', discoveredEventIds)
    } else {
      historyDelete = historyDelete.in('series_id', discoveredSeriesIds)
    }
    const { error: historyDeleteError } = await historyDelete
    if (historyDeleteError) throw historyDeleteError
  }
  if (occurrenceIds.length) {
    const { error } = await supabase.from('events').delete().in('id', occurrenceIds)
    if (error) throw error
  }
  if (discoveredSeriesIds.length) {
    const { error } = await supabase.from('event_series').delete().in('id', discoveredSeriesIds)
    if (error) throw error
  }
  if (discoveredTemplateIds.length) {
    const { error } = await supabase.from('events').delete().in('id', discoveredTemplateIds)
    if (error) throw error
  }
  const { count: residue, error: residueError } = await supabase
    .from('events')
    .select('*', { head: true, count: 'exact' })
    .ilike('title', `${prefix}%`)
  if (residueError) throw residueError
  assert.equal(residue, 0, 'Scoped AI recurrence fixture cleanup left event residue.')
}
