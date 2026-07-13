import crypto from 'node:crypto'
import fs from 'node:fs'

import { eventConversationState, groceryConversationState } from '../supabase/functions/_shared/assistant-conversation-grounding.mjs'

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
const traceBase = crypto.randomUUID()
const DEFAULT_LIMIT = Number(process.argv.find((arg) => arg.startsWith('--count='))?.split('=')[1] ?? '0')
const MODE = process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1] ?? 'full'
const MODEL = process.argv.find((arg) => arg.startsWith('--model='))?.split('=')[1] ?? 'gemini-2.5-flash-lite'
const SUPPORTED_MODES = new Set(['smoke', 'full'])
const SUPPORTED_MODELS = new Set(['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash'])
if (!SUPPORTED_MODES.has(MODE)) throw new Error(`Unsupported QA mode: ${MODE}`)
if (!SUPPORTED_MODELS.has(MODEL)) throw new Error(`Unsupported QA model: ${MODEL}`)
const STEP_LIMIT = Number.isFinite(DEFAULT_LIMIT) && DEFAULT_LIMIT > 0
  ? DEFAULT_LIMIT
  : MODE === 'smoke' ? 12 : null

const headers = {
  'content-type': 'application/json',
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
}

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

async function loadDefaultGroceryListId() {
  const url = new URL('/rest/v1/grocery_lists', SUPABASE_URL)
  url.searchParams.set('select', 'id')
  url.searchParams.set('order', 'created_at.asc')
  url.searchParams.set('limit', '1')
  const rows = await fetchJson(url, { headers })
  const listId = rows?.[0]?.id ?? null
  if (!listId) throw new Error('No grocery list found')
  return listId
}

function buildContext({ family, page, assistantMode, conversationState }) {
  const current = new Date()
  return {
    page,
    assistant_mode: assistantMode,
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
    conversationState: conversationState ?? null,
  }
}

async function callAssistant({ messages, family, page, assistantMode, conversationState, conversationId, turnId }) {
  const url = `${SUPABASE_URL}/functions/v1/ai-assistant`
  return fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      context: buildContext({ family, page, assistantMode, conversationState }),
      session_id: conversationId,
      correlation_id: `${conversationId}:${turnId}`,
      trace_id: traceBase,
      turn_id: turnId,
      lane: 'llm',
      client_trace_present: true,
      client_build: 'ai-assistant-qa-sweep',
      client_trace_source: 'ai-assistant-qa-sweep',
      stream: false,
      dry_run: true,
      model_override: MODEL,
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
      client_build: 'ai-assistant-qa-sweep',
      client_trace_source: 'ai-assistant-qa-sweep',
    }),
  })
}

async function seedCalendarFixtures() {
  const items = [
    {
      title: 'Soccer practice',
      daysFromNow: 2,
      hour: 17,
      minutes: 30,
      durationMins: 90,
      locationName: 'Sunrise Community Center',
      address: '123 Sunrise Way, West Palm Beach, FL 33401',
    },
    { title: 'Dentist appointment', daysFromNow: 3, hour: 10, minutes: 0, durationMins: 60 },
    { title: 'Birthday dinner', daysFromNow: 4, hour: 18, minutes: 0, durationMins: 120 },
    {
      title: 'Airport pickup',
      daysFromNow: 5,
      hour: 21,
      minutes: 15,
      durationMins: 75,
      locationName: 'Palm Beach International Airport',
      address: '1000 James L Turnage Blvd, West Palm Beach, FL 33415',
    },
    { title: 'Library story time', daysFromNow: 6, hour: 9, minutes: 30, durationMins: 45 },
    { title: 'Weekend trip to Maine', daysFromNow: 12, hour: 0, minutes: 0, durationMins: 4 * 24 * 60, allDay: true },
    { title: 'Piano recital', daysFromNow: 8, hour: 16, minutes: 0, durationMins: 90 },
    { title: 'PTA meeting', daysFromNow: 9, hour: 19, minutes: 0, durationMins: 60 },
  ]

  const created = []
  for (const spec of items) {
    const start = new Date(now)
    start.setDate(start.getDate() + spec.daysFromNow)
    start.setHours(spec.hour, spec.minutes, 0, 0)
    const end = new Date(start.getTime() + spec.durationMins * 60 * 1000)
    const url = new URL('/rest/v1/events', SUPABASE_URL)
    const payload = [{
      title: spec.title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      location_name: spec.locationName ?? null,
      address: spec.address ?? null,
      status: 'confirmed',
      all_day: Boolean(spec.allDay),
      event_type: spec.allDay ? 'event' : 'event',
      is_enriched: false,
    }]
    const inserted = await fetchJson(url, {
      method: 'POST',
      headers: { ...headers, prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    created.push(inserted?.[0] ?? payload[0])
  }
  return created
}

async function seedGroceryFixtures(listId) {
  const items = [
    { name: 'milk for pancakes', quantity: '1', unit: 'gallon' },
    { name: 'eggs for omelets', quantity: '1', unit: 'dozen' },
    { name: 'tortillas for tacos', quantity: '1', unit: 'pack' },
    { name: 'bananas for smoothies', quantity: '6', unit: null },
    { name: 'oat milk for coffee', quantity: '2', unit: 'cartons' },
    { name: 'bread for sandwiches', quantity: null, unit: null },
  ]

  const created = []
  for (const spec of items) {
    const url = new URL('/rest/v1/grocery_items', SUPABASE_URL)
    const payload = [{
      list_id: listId,
      name: spec.name,
      quantity: spec.quantity,
      unit: spec.unit,
      category: 'other',
      notes: 'QA seed item',
      checked: false,
      last_modified_source: 'casa',
    }]
    const inserted = await fetchJson(url, {
      method: 'POST',
      headers: { ...headers, prefer: 'return=representation' },
      body: JSON.stringify(payload),
    })
    created.push(inserted?.[0] ?? payload[0])
  }
  return created
}

async function cleanupEvents(ids) {
  if (!ids.length) return 0
  const url = new URL('/rest/v1/events', SUPABASE_URL)
  url.searchParams.set('id', `in.(${ids.join(',')})`)
  await fetchJson(url, {
    method: 'DELETE',
    headers: { ...headers, prefer: 'return=minimal' },
  })
  return ids.length
}

async function cleanupGroceryItems(ids) {
  if (!ids.length) return 0
  const url = new URL('/rest/v1/grocery_items', SUPABASE_URL)
  url.searchParams.set('id', `in.(${ids.join(',')})`)
  await fetchJson(url, {
    method: 'PATCH',
    headers: { ...headers, prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: new Date().toISOString(), last_modified_source: 'casa' }),
  })
  return ids.length
}

async function countRowsByIds(table, ids, extraParams = {}) {
  if (!ids.length) return 0
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL)
  url.searchParams.set('select', 'id')
  url.searchParams.set('id', `in.(${ids.join(',')})`)
  for (const [key, value] of Object.entries(extraParams)) url.searchParams.set(key, value)
  const rows = await fetchJson(url, { headers })
  return Array.isArray(rows) ? rows.length : 0
}

function scenarioGroups(fixtures, grocerySeeds, familyNames) {
  const [firstName = 'Alex', secondName = firstName] = familyNames
  const events = Object.fromEntries(fixtures.map((event) => [event.title, event]))
  const groceries = Object.fromEntries(grocerySeeds.map((item) => [item.name, item]))

  return [
    {
      key: 'calendar-reads',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: "what's on my calendar tomorrow?", expect: { type: 'text' } },
        {
          text: "what's going on on Thursday?",
          expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 0 },
        },
        { text: 'how many appointments do i have next week?', expect: { type: 'text' } },
        { text: 'where do i need to go on Thursday?', expect: { type: 'text' } },
        { text: 'do i have any conflicts on monday?', expect: { type: 'text' } },
      ],
    },
    {
      key: 'calendar-create',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: `create a Myrtle Beach family trip for me and ${secondName} from August 2 thru August 6.`, expect: { type: 'write', tool: 'create_event' } },
      ],
    },
    {
      key: 'calendar-update',
      page: 'calendar',
      assistantMode: 'general',
      conversationState: eventConversationState(events['Soccer practice'], now),
      steps: [
        { text: 'move it to next friday at 7pm.', expect: { type: 'write', tool: 'update_event' } },
        { text: 'where is it located again?', expect: { type: 'text' } },
      ],
    },
    {
      key: 'calendar-delete',
      page: 'calendar',
      assistantMode: 'general',
      conversationState: eventConversationState(events['Birthday dinner'], now),
      steps: [
        { text: 'delete that one.', expect: { type: 'write', tool: 'delete_event' } },
        { text: 'what time was birthday dinner again?', expect: { type: 'text' } },
      ],
    },
    {
      key: 'calendar-followups',
      page: 'calendar',
      assistantMode: 'general',
      conversationState: eventConversationState(events['Airport pickup'], now),
      steps: [
        { text: 'where is it?', expect: { type: 'text' } },
        { text: 'how long will it take?', expect: { type: 'text' } },
        { text: 'who is coming?', expect: { type: 'text' } },
      ],
    },
    {
      key: 'grocery-add',
      page: 'grocery',
      assistantMode: 'general',
      steps: [
        { text: 'add apples, granola bars, and yogurt cups to my grocery list.', expect: { type: 'write', tool: 'add_grocery_items' } },
      ],
    },
    {
      key: 'grocery-mutations',
      page: 'grocery',
      assistantMode: 'general',
      conversationState: groceryConversationState(groceries['oat milk for coffee'], now),
      steps: [
        { text: 'check off the eggs for omelets.', expect: { type: 'write', tool: 'check_grocery_item' } },
        { text: 'what else is still on the list?', expect: { type: 'text' } },
        { text: 'remove tortillas for tacos from my grocery list.', expect: { type: 'write', tool: 'remove_grocery_item' } },
      ],
    },
    {
      key: 'grocery-reads',
      page: 'grocery',
      assistantMode: 'general',
      steps: [
        { text: "what's on the grocery list?", expect: { type: 'text' } },
        { text: 'is bread for sandwiches on the shopping list?', expect: { type: 'text' } },
        { text: 'do we have bananas for smoothies?', expect: { type: 'text' } },
      ],
    },
    {
      key: 'calendar-typos',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: 'can u move the brthday dinner to thursday at 6?', expect: { type: 'write', tool: 'update_event' } },
        { text: 'what time is the piano recital?', expect: { type: 'text' } },
      ],
    },
    {
      key: 'grocery-typos',
      page: 'grocery',
      assistantMode: 'general',
      steps: [
        { text: 'add bananas, cheerios, and coffee creamer to my grocery list.', expect: { type: 'write', tool: 'add_grocery_items' } },
        { text: 'check off the bananas.', expect: { type: 'write', tool: 'check_grocery_item' } },
      ],
    },
    {
      key: 'boundary-ambiguous',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: 'move the thing and add milk and maybe look at tomorrow too.', expect: { type: 'limit' } },
        { text: 'uh can you fix it for later?', expect: { type: 'clarify' } },
      ],
    },
    {
      key: 'boundary-noisy-stt',
      page: 'grocery',
      assistantMode: 'general',
      steps: [
        { text: 'add the stuff we need for the thing at grandma house', expect: { type: 'limit' } },
        { text: 'umm no, the other thing, sorry', expect: { type: 'clarify' } },
      ],
    },
    {
      key: 'calendar-multiturn-create',
      page: 'calendar',
      assistantMode: 'general',
      conversationState: eventConversationState(events['PTA meeting'], now),
      steps: [
        { text: 'where is it held?', expect: { type: 'text' } },
        { text: 'what time is it now?', expect: { type: 'text' } },
        { text: 'who is coming?', expect: { type: 'text' } },
      ],
    },
    {
      key: 'grocery-multiturn',
      page: 'grocery',
      assistantMode: 'general',
      conversationState: groceryConversationState(groceries['oat milk for coffee'], now),
      steps: [
        { text: 'what quantity does oat milk for coffee show?', expect: { type: 'text' } },
        { text: 'what else is left on the grocery list?', expect: { type: 'text' } },
        { text: 'add bananas for smoothies to my grocery list.', expect: { type: 'write', tool: 'add_grocery_items' } },
      ],
    },
    {
      key: 'semantic-calendar-variance',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: 'how does tomorrow afternoon look?', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 0 } },
        { text: 'anything planned for the next 3 days?', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 0 } },
        { text: 'walk me through next week.', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 0 } },
        { text: 'alexa whats on my calender tomoro?', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 0 } },
      ],
    },
    {
      key: 'semantic-grocery-variance',
      page: 'grocery',
      assistantMode: 'general',
      steps: [
        { text: 'what do we still need to get?', expect: { type: 'text', semanticIntent: 'grocery.list', maxLlmCalls: 0 } },
        { text: 'how many items do we need?', expect: { type: 'text', semanticIntent: 'grocery.count', maxLlmCalls: 0 } },
        { text: 'casa whats on the grossery list?', expect: { type: 'text', semanticIntent: 'grocery.list', maxLlmCalls: 0 } },
      ],
    },
    {
      key: 'semantic-cooking-variance',
      page: 'cooking',
      assistantMode: 'chef',
      steps: [
        { text: 'I have chicken rice and broccoli, what can I cook?', expect: { type: 'text' } },
        { text: 'my sauce is too thin and dinner is in twenty minutes, how do I save it?', expect: { type: 'text' } },
        { text: 'what can I use instead of buttermilk?', expect: { type: 'text' } },
        { text: 'how should I store leftover rice safely?', expect: { type: 'text' } },
      ],
    },
  ]
}

function stepSummary(response) {
  if (!response) return 'no-response'
  if (response.type === 'tool_action') return `tool_action:${response.tool}`
  if (response.type === 'text') return response.write_verified ? 'text:write_verified' : 'text'
  return `${response.type ?? 'unknown'}`
}

function isClarifyingResponse(response) {
  const text = String(response?.text ?? response?.display_text ?? '')
  return response?.type === 'text' && /(which one|please tell me more|what should i|could you|i need more detail|which event|which item)/i.test(text)
}

async function run() {
  const family = await loadFamily()
  const familyNames = family.map((member) => member.name)
  const calendarFixtures = await seedCalendarFixtures()
  const groceryListId = await loadDefaultGroceryListId()
  const groceryFixtures = await seedGroceryFixtures(groceryListId)
  const groups = scenarioGroups(calendarFixtures, groceryFixtures, familyNames)

  const flatSteps = groups.flatMap((group) => group.steps.map((step, index) => ({
    ...step,
    groupKey: group.key,
    page: group.page,
    assistantMode: group.assistantMode,
    initialConversationState: index === 0 ? group.conversationState ?? null : undefined,
  })))
  const steps = STEP_LIMIT ? flatSteps.slice(0, STEP_LIMIT) : flatSteps

  const results = []
  const conversationStates = new Map()
  const createdEventIds = new Set()
  const createdGroceryIds = new Set()

  try {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]
      const conversationId = `${runId}-${step.groupKey}`
      const turnId = crypto.randomUUID()
      const currentState = step.initialConversationState !== undefined
        ? step.initialConversationState
        : conversationStates.get(step.groupKey) ?? null
      const history = [{ role: 'user', content: step.text }]

      console.log(JSON.stringify({
        heartbeat: true,
        phase: 'start',
        step: index + 1,
        total: steps.length,
        group: step.groupKey,
        page: step.page,
        mode: step.assistantMode,
        text: step.text,
      }))

      const output = {
        step: index + 1,
        group: step.groupKey,
        page: step.page,
        mode: step.assistantMode,
        text: step.text,
        ok: true,
        expected: step.expect,
        assistant_type: null,
        assistant_text: null,
        tool: null,
        semantic_intent: null,
        llm_calls: null,
        action_result: null,
        note: null,
      }

      const response = await callAssistant({
        messages: history,
        family,
        page: step.page,
        assistantMode: step.assistantMode,
        conversationState: currentState,
        conversationId,
        turnId,
      })

      output.assistant_type = response?.type ?? 'unknown'
      output.assistant_text = response?.text ?? response?.display_text ?? null
      output.tool = response?.tool ?? null
      output.semantic_intent = response?.authoritative_provenance?.semantic_intent ?? null
      output.llm_calls = response?.telemetry?.llm_calls ?? null

      if (response?.conversation_state) {
        conversationStates.set(step.groupKey, response.conversation_state)
      }

      if (step.expect.type === 'clarify') {
        if (!(isClarifyingResponse(response) || (response?.type === 'text' && !response?.tool))) {
          output.ok = false
          output.note = `expected_clarification:got_${stepSummary(response)}`
        }
      } else if (step.expect.type === 'limit') {
        output.note = stepSummary(response)
      } else if (step.expect.type === 'text') {
        if (response?.type !== 'text') {
          output.ok = false
          output.note = `expected_text:got_${stepSummary(response)}`
        } else if (
          step.expect.semanticIntent
          && response?.authoritative_provenance?.semantic_intent !== step.expect.semanticIntent
        ) {
          output.ok = false
          output.note = `semantic_intent_mismatch:expected_${step.expect.semanticIntent}:got_${response?.authoritative_provenance?.semantic_intent ?? 'none'}`
        } else if (
          Number.isFinite(step.expect.maxLlmCalls)
          && !Number.isFinite(response?.telemetry?.llm_calls)
        ) {
          output.ok = false
          output.note = 'llm_calls_missing'
        } else if (
          Number.isFinite(step.expect.maxLlmCalls)
          && response.telemetry.llm_calls > step.expect.maxLlmCalls
        ) {
          output.ok = false
          output.note = `llm_calls_exceeded:max_${step.expect.maxLlmCalls}:got_${response?.telemetry?.llm_calls}`
        }
      } else if (step.expect.type === 'write') {
        if (response?.type === 'text' && response?.write_verified === true) {
          output.action_result = 'auto_executed_verified'
        } else if (response?.type !== 'tool_action') {
          output.ok = false
          output.note = `expected_write:got_${stepSummary(response)}`
        } else if (response?.tool !== step.expect.tool) {
          output.ok = false
          output.note = `tool_mismatch:expected_${step.expect.tool}:got_${response?.tool}`
        } else {
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
            output.note = `execute_action_failed:${JSON.stringify(actionResult)}`
          }
          if (response.tool === 'create_event' && typeof actionResult?.event_id === 'string') {
            createdEventIds.add(actionResult.event_id)
          }
          if (response.tool === 'add_grocery_items' && Array.isArray(actionResult?.items)) {
            for (const item of actionResult.items) {
              if (item?.already_present !== true && typeof item?.id === 'string') createdGroceryIds.add(item.id)
            }
          }
          if (step.groupKey.startsWith('calendar-') && typeof currentState === 'object' && currentState) {
            conversationStates.set(step.groupKey, currentState)
          }
          if (step.groupKey === 'calendar-create' || step.groupKey === 'calendar-multiturn-create') {
            const eventId = actionResult?.event_id
            if (typeof eventId === 'string' && eventId.length > 0) {
              const eventUrl = new URL('/rest/v1/events', SUPABASE_URL)
              eventUrl.searchParams.set('select', 'id,title,updated_at')
              eventUrl.searchParams.set('id', `eq.${eventId}`)
              const eventRows = await fetchJson(eventUrl, { headers })
              const event = Array.isArray(eventRows) ? eventRows[0] : null
              if (event) conversationStates.set(step.groupKey, eventConversationState(event, now))
            }
          } else if (step.groupKey.startsWith('grocery-') && currentState) {
            conversationStates.set(step.groupKey, currentState)
          }
        }
      }

      results.push(output)
      console.log(JSON.stringify({
        heartbeat: true,
        phase: 'done',
        step: index + 1,
        total: steps.length,
        group: step.groupKey,
        ok: output.ok,
        summary: output.note ?? output.action_result ?? stepSummary(response),
      }))
    }
  } finally {
    const eventIds = [...calendarFixtures.map((event) => event.id).filter(Boolean), ...createdEventIds]
    const groceryIds = [...groceryFixtures.map((item) => item.id).filter(Boolean), ...createdGroceryIds]
    const cleanup = {
      events_deleted: await cleanupEvents(eventIds),
      grocery_items_deleted: await cleanupGroceryItems(groceryIds),
    }
    cleanup.events_remaining = await countRowsByIds('events', eventIds)
    cleanup.active_grocery_items_remaining = await countRowsByIds('grocery_items', groceryIds, {
      deleted_at: 'is.null',
    })
    cleanup.verified = cleanup.events_remaining === 0 && cleanup.active_grocery_items_remaining === 0
    const totals = {
      total: results.length,
      passed: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
    }
    const failureKinds = results
      .filter((result) => !result.ok)
      .reduce((acc, result) => {
        const kind = result.note?.split(':')[0] ?? 'other'
        acc[kind] = (acc[kind] ?? 0) + 1
        return acc
      }, {})
    const boundarySteps = results.filter((result) => result.expected?.type === 'clarify')
    console.log(JSON.stringify({
      run_id: runId,
      mode: MODE,
      model: MODEL,
      totals,
      failure_kinds: failureKinds,
      boundaries: boundarySteps.map((result) => ({
        group: result.group,
        text: result.text,
        assistant_type: result.assistant_type,
        assistant_text: result.assistant_text,
      })),
      cleanup,
      failures: results.filter((result) => !result.ok).slice(0, 20),
    }, null, 2))
    if (totals.failed > 0 || !cleanup.verified) process.exitCode = 1
  }
}

run().catch(async (error) => {
  console.error(error)
  process.exitCode = 1
})
