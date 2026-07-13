import crypto from 'node:crypto'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]
    }),
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
}

const now = new Date()
const runId = `ai-qa-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
const titlePrefix = `AIQA-${runId}`
const DEFAULT_COUNT = Number(process.argv.find((arg) => arg.startsWith('--count='))?.split('=')[1] ?? '100')
const TARGET_COUNT = Number.isFinite(DEFAULT_COUNT) && DEFAULT_COUNT > 0 ? DEFAULT_COUNT : 100

const headers = {
  'content-type': 'application/json',
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
}

const traceBase = crypto.randomUUID()

function isoWithOffset(date) {
  const offsetMins = -date.getTimezoneOffset()
  const sign = offsetMins >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMins)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${sign}${hh}:${mm}`
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`)
  }
  if (response.status === 204) return null
  return response.json()
}

async function loadFamily() {
  const url = new URL('/rest/v1/family_members', SUPABASE_URL)
  url.searchParams.set('select', 'id,name')
  url.searchParams.set('order', 'name.asc')
  const rows = await fetchJson(url, { headers })
  return Array.isArray(rows) ? rows : []
}

async function createFixtureEvents(count) {
  const created = []
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + 2)
  start.setUTCHours(14, 0, 0, 0)
  for (let i = 0; i < count; i += 1) {
    const startAt = new Date(start.getTime() + i * 90 * 60 * 1000)
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000)
    const title = `${titlePrefix} Fixture ${String(i + 1).padStart(3, '0')}`
    const url = new URL('/rest/v1/events', SUPABASE_URL)
    const payload = [{
      title,
      start_time: startAt.toISOString(),
      end_time: endAt.toISOString(),
      status: 'confirmed',
      all_day: false,
      event_type: 'event',
      is_enriched: false,
    }]
    const inserted = await fetchJson(url, {
      method: 'POST',
      headers: {
        ...headers,
        prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    })
    created.push(inserted?.[0] ?? payload[0])
  }
  return created
}

function buildContext(family) {
  const current = new Date()
  return {
    page: 'calendar',
    assistant_mode: 'general',
    currentDate: current.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }),
    utcOffset: isoWithOffset(current),
    family: family.map((member) => ({ id: member.id, name: member.name })),
    homeCity: 'West Palm Beach',
  }
}

async function callAssistant({ messages, family, conversationId, turnId }) {
  const url = `${SUPABASE_URL}/functions/v1/ai-assistant`
  return fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      context: buildContext(family),
      session_id: conversationId,
      correlation_id: `${conversationId}:${turnId}`,
      trace_id: traceBase,
      turn_id: turnId,
      lane: 'llm',
      client_trace_present: true,
      client_build: 'ai-calendar-conversation-stress',
      client_trace_source: 'ai-calendar-conversation-stress',
      stream: false,
      dry_run: false,
    }),
  })
}

async function executeAction({ tool, args, actionId, conversationId, turnId }) {
  const url = `${SUPABASE_URL}/functions/v1/execute-ai-action`
  return fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tool,
      args,
      action_id: actionId,
      session_id: conversationId,
      correlation_id: `${conversationId}:${actionId}`,
      trace_id: traceBase,
      turn_id: turnId,
      lane: 'tool_action',
      client_trace_present: true,
      client_build: 'ai-calendar-conversation-stress',
      client_trace_source: 'ai-calendar-conversation-stress',
    }),
  })
}

function buildCases(fixtures, familyNames) {
  const fallbackName = familyNames[0] ?? 'Jake'
  const secondName = familyNames[1] ?? fallbackName
  const readPhrases = [
    "what's next on my calendar this week?",
    'how many appointments do i have next week?',
    "what's on my calendar tomorrow afternoon?",
    'do i have any conflicts on monday?',
    'where do I need to go tomorrow?',
  ]

  const cases = []
  for (let i = 0; i < 20; i += 1) {
    const scenarioTag = `${titlePrefix} Scenario ${String(i + 1).padStart(2, '0')}`
    const createPhrases = [
      `Please create an appointment called "${scenarioTag} Maine Family Trip" from July 21 through July 28 for ${fallbackName} and ${secondName}.`,
      `Schedule a trip on the calendar titled "${scenarioTag} Summer Travel" from August 2 to August 6 for ${fallbackName}.`,
      `Add a reminder named "${scenarioTag} Cleats Reminder" tomorrow at 6:30 PM.`,
      `Create an appointment for next Friday at 7 PM called "${scenarioTag} Softball Practice" for ${fallbackName}.`,
      `Book an all-day event this Saturday called "${scenarioTag} Beach Day".`,
    ]
    cases.push({ kind: 'create', text: createPhrases[i % createPhrases.length], expectTool: 'create_event', confirm: true })
    cases.push({
      kind: 'create-reject',
      text: `Please create an appointment called "${scenarioTag} Rejected Draft" on July ${24 + (i % 4)} at ${6 + (i % 5)} PM at Greenacres Bowl with notes "bring uniforms and water".`,
      expectTool: 'create_event',
      confirm: false,
    })
    const fixture = fixtures[i % fixtures.length]
    cases.push({ kind: 'update', text: `Move "${fixture.title}" to tomorrow at ${3 + (i % 6)} PM.`, expectTool: 'update_event', confirm: true })
    cases.push({ kind: 'delete', text: `Delete the event "${fixture.title}" from my calendar.`, expectTool: 'delete_event', confirm: true })
    cases.push({ kind: 'read', text: readPhrases[i % readPhrases.length], expectText: true })
  }
  return cases.slice(0, TARGET_COUNT)
}

function toMessageHistory(history) {
  return history.map((entry) => ({ role: entry.role, content: entry.content }))
}

function classifyFailure(result) {
  if (result.ok) return null
  if (result.error?.includes('tool_mismatch')) return 'tool_mismatch'
  if (result.error?.includes('missing_tool_action')) return 'missing_tool_action'
  if (result.error?.includes('assistant_error_type')) return 'assistant_error'
  if (result.error?.includes('auto_executed_when_reject_expected')) return 'auto_executed_when_reject_expected'
  if (result.error?.includes('execute_action_failed')) return 'action_execution_failed'
  if (result.error?.includes('unexpected_text')) return 'unexpected_text'
  return 'other'
}

async function cleanupEvents() {
  const queryUrl = new URL('/rest/v1/events', SUPABASE_URL)
  queryUrl.searchParams.set('select', 'id,title')
  queryUrl.searchParams.set('title', `like.${titlePrefix}%`)
  const rows = await fetchJson(queryUrl, { headers })
  if (!Array.isArray(rows) || rows.length === 0) return { deleted: 0 }

  const ids = rows.map((row) => row.id).filter(Boolean)
  const deleteUrl = new URL('/rest/v1/events', SUPABASE_URL)
  deleteUrl.searchParams.set('id', `in.(${ids.join(',')})`)
  await fetchJson(deleteUrl, {
    method: 'DELETE',
    headers: {
      ...headers,
      prefer: 'return=minimal',
    },
  })
  return { deleted: ids.length }
}

async function run() {
  const family = await loadFamily()
  const fixtures = await createFixtureEvents(24)
  const cases = buildCases(fixtures, family.map((member) => member.name))

  const results = []
  for (let index = 0; index < cases.length; index += 1) {
    const scenario = cases[index]
    const conversationId = `${runId}-${String(index + 1).padStart(3, '0')}`
    const turnId = crypto.randomUUID()
    const history = [{ role: 'user', content: scenario.text }]

    const output = {
      index: index + 1,
      kind: scenario.kind,
      text: scenario.text,
      ok: true,
      error: null,
      assistant_type: null,
      assistant_text: null,
      tool: null,
      action_result: null,
    }

    try {
      const response = await callAssistant({
        messages: toMessageHistory(history),
        family,
        conversationId,
        turnId,
      })
      output.assistant_type = response?.type ?? 'unknown'
      output.assistant_text = response?.text ?? response?.display_text ?? null
      output.tool = response?.tool ?? null
      history.push({ role: 'assistant', content: response?.text ?? response?.display_text ?? `type:${response?.type ?? 'unknown'}` })

      if (scenario.expectTool) {
        if (response?.type === 'text' && response?.write_verified === true && scenario.confirm === true) {
          output.action_result = 'auto_executed_verified'
        } else if (response?.type === 'text' && response?.write_verified === true && scenario.confirm === false) {
          output.ok = false
          output.error = 'auto_executed_when_reject_expected'
          output.action_result = 'auto_executed_verified'
        } else if (response?.type !== 'tool_action') {
          output.ok = false
          output.error = `missing_tool_action:${response?.type ?? 'unknown'}`
        } else if (response?.tool !== scenario.expectTool) {
          output.ok = false
          output.error = `tool_mismatch:expected_${scenario.expectTool}:got_${response?.tool}`
        } else if (scenario.confirm) {
          try {
            const actionResult = await executeAction({
              tool: response.tool,
              args: response.args ?? {},
              actionId: crypto.randomUUID(),
              conversationId,
              turnId,
            })
            output.action_result = actionResult?.success === true ? 'success' : JSON.stringify(actionResult)
            if (!actionResult?.success) {
              output.ok = false
              output.error = `execute_action_failed:${JSON.stringify(actionResult)}`
            }
          } catch (error) {
            output.ok = false
            output.error = `execute_action_failed:${String(error.message ?? error)}`
          }
        } else {
          output.action_result = 'rejected_by_harness'
        }
      } else if (scenario.expectText && response?.type === 'error') {
        output.ok = false
        output.error = `assistant_error_type:${response?.code ?? 'unknown'}`
      }
    } catch (error) {
      output.ok = false
      output.error = String(error.message ?? error)
    }

    results.push(output)
  }

  const totals = {
    total: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  }
  const failureKinds = results
    .filter((result) => !result.ok)
    .reduce((acc, result) => {
      const kind = classifyFailure(result) ?? 'other'
      acc[kind] = (acc[kind] ?? 0) + 1
      return acc
    }, {})

  const cleanup = await cleanupEvents()
  console.log(JSON.stringify({
    run_id: runId,
    totals,
    failure_kinds: failureKinds,
    cleanup,
    failures: results.filter((result) => !result.ok).slice(0, 30),
  }, null, 2))
}

run().catch(async (error) => {
  try { await cleanupEvents() } catch {}
  console.error(error)
  process.exitCode = 1
})
