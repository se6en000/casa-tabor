import crypto from 'node:crypto'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]
    }),
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase QA credentials in .env.local')

const headers = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}
const runId = `agent-live-${new Date().toISOString().replace(/[:.]/g, '-')}`
const createdEventIds = []
const createdListIds = []
const fixtureItemIds = []
const results = []

async function fetchJson(path, options = {}) {
  const response = await fetch(new URL(path, SUPABASE_URL), options)
  const text = await response.text()
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text}`)
  return text ? JSON.parse(text) : null
}

async function insert(table, rows) {
  return fetchJson(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, prefer: 'return=representation' },
    body: JSON.stringify(rows),
  })
}

async function remove(table, ids) {
  if (ids.length === 0) return
  await fetchJson(`/rest/v1/${table}?id=in.(${ids.join(',')})`, {
    method: 'DELETE',
    headers: { ...headers, prefer: 'return=minimal' },
  })
}

async function count(table, ids) {
  if (ids.length === 0) return 0
  const rows = await fetchJson(`/rest/v1/${table}?select=id&id=in.(${ids.join(',')})`, { headers })
  return rows.length
}

function localDate(daysFromNow, hour, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  date.setHours(hour, minute, 0, 0)
  return date
}

function nextWeekday(weekday, hour, minute = 0) {
  const now = new Date()
  const days = (weekday - now.getDay() + 7) % 7 || 7
  return localDate(days, hour, minute)
}

function utcOffset(date = new Date()) {
  const minutes = -date.getTimezoneOffset()
  const sign = minutes >= 0 ? '+' : '-'
  const absolute = Math.abs(minutes)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

async function loadFamily() {
  return fetchJson('/rest/v1/family_members?select=id,name&order=name.asc', { headers })
}

async function callAssistant({
  key,
  text,
  family,
  page = 'app',
  history = [],
  conversationState = null,
  pendingAction = null,
}) {
  const traceId = `${runId}-${key}`
  const messages = [...history, { role: 'user', content: text }]
  const response = await fetchJson('/functions/v1/ai-assistant', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      context: {
        page,
        assistant_mode: 'general',
        currentDate: new Date().toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        }),
        utcOffset: utcOffset(),
        family,
        conversationState,
        pendingAction,
      },
      dry_run: false,
      stream: false,
      trace_id: traceId,
      turn_id: crypto.randomUUID(),
      correlation_id: `${traceId}:turn`,
      lane: 'regression',
      client_trace_present: true,
      client_build: 'ai-agent-live-regression',
      client_trace_source: 'ai-agent-live-regression',
      model_override: 'gemini-2.5-flash',
    }),
  })
  return { response, messages }
}

function pass(key, detail) {
  results.push({ key, ok: true, detail })
  console.log(`PASS ${key}: ${detail}`)
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function durationMinutes(args) {
  return (Date.parse(args.end) - Date.parse(args.start)) / 60000
}

async function verifyNoProposalsPersisted(baselineDinnerIds, baselineGroceryIds) {
  const dinner = await fetchJson(
    '/rest/v1/events?select=id&title=ilike.*Dinner*Mom*',
    { headers },
  )
  const proposedGroceries = await fetchJson(
    '/rest/v1/grocery_items?select=id&deleted_at=is.null&name=in.(Pears,Pita chips,Ricotta)',
    { headers },
  )
  expect(
    JSON.stringify(dinner.map(({ id }) => id).sort()) === JSON.stringify(baselineDinnerIds),
    'A proposed dinner event was persisted',
  )
  expect(
    JSON.stringify(proposedGroceries.map(({ id }) => id).sort()) === JSON.stringify(baselineGroceryIds),
    'Proposed grocery additions were persisted',
  )
}

async function run() {
  const familyRows = await loadFamily()
  const family = familyRows.map(({ id, name }) => ({ id, name }))
  try {
    const soccerStart = nextWeekday(5, 16)
    const soccerEnd = new Date(soccerStart.getTime() + 90 * 60000)
    const [soccer] = await insert('events', [{
      title: 'Riverside soccer practice',
      start_time: soccerStart.toISOString(),
      end_time: soccerEnd.toISOString(),
      status: 'confirmed',
      all_day: false,
      event_type: 'event',
      is_enriched: false,
      description: runId,
    }])
    createdEventIds.push(soccer.id)

    const lists = await insert('grocery_lists', [
      { name: `[Agent QA A] ${runId}` },
      { name: `[Agent QA B] ${runId}` },
    ])
    createdListIds.push(...lists.map(({ id }) => id))
    const items = await insert('grocery_items', [
      { list_id: lists[0].id, name: 'Barista oat milk', quantity: '1', unit: 'carton', checked: false, category: 'other', notes: runId, last_modified_source: 'ios' },
      { list_id: lists[0].id, name: 'Quail eggs', quantity: '1', unit: 'dozen', checked: false, category: 'other', notes: runId, last_modified_source: 'ios' },
      { list_id: lists[0].id, name: 'Sparkling water', quantity: null, unit: null, checked: false, category: 'other', notes: runId, last_modified_source: 'ios' },
      { list_id: lists[1].id, name: 'Sparkling water', quantity: null, unit: null, checked: false, category: 'other', notes: runId, last_modified_source: 'ios' },
    ])
    fixtureItemIds.push(...items.map(({ id }) => id))
    const [oatMilk, quailEggs] = items
    const baselineDinnerIds = (await fetchJson(
      '/rest/v1/events?select=id&title=ilike.*Dinner*Mom*',
      { headers },
    )).map(({ id }) => id).sort()
    const baselineGroceryIds = (await fetchJson(
      '/rest/v1/grocery_items?select=id&deleted_at=is.null&name=in.(Pears,Pita chips,Ricotta)',
      { headers },
    )).map(({ id }) => id).sort()

    let turn = await callAssistant({
    key: '01-thursday-read',
    text: 'What does Thursday afternoon look like?',
    family,
  })
  expect(turn.response.type === 'text' && turn.response.semantic_intent === 'agent.read', 'Clean Thursday read did not use agent.read')
  pass('01-thursday-read', turn.response.text.split('\n')[0])

    turn = await callAssistant({
    key: '02-thursday-stt',
    text: 'what does thirty afternoon thursday afternoon look like',
    family,
  })
  expect(turn.response.type === 'text' && turn.response.semantic_intent === 'agent.read', 'STT Thursday read did not use agent.read')
  pass('02-thursday-stt', turn.response.text.split('\n')[0])

    const dinner = await callAssistant({
    key: '03-dinner-create',
    text: 'Schedule dinner with Mom Sunday around six for an hour and a half.',
    family,
  })
  expect(dinner.response.type === 'tool_action' && dinner.response.tool === 'create_event', 'Dinner request did not produce create_event')
  expect(dinner.response.args.title.toLowerCase() === 'dinner with mom', 'Dinner title did not preserve Mom as title text')
  expect(durationMinutes(dinner.response.args) === 90, 'Dinner duration was not 90 minutes')
  pass('03-dinner-create', `${dinner.response.args.start} for 90 minutes`)

    const correctedDinner = await callAssistant({
    key: '04-dinner-correction',
    text: 'Actually, make that Saturday at ten.',
    family,
    history: [
      ...dinner.messages,
      { role: 'assistant', content: dinner.response.display_text },
    ],
    pendingAction: {
      actionId: dinner.response.action_id,
      tool: dinner.response.tool,
      args: dinner.response.args,
    },
  })
  expect(correctedDinner.response.type === 'tool_action' && correctedDinner.response.tool === 'create_event', 'Pending dinner correction did not revise create_event')
  expect(durationMinutes(correctedDinner.response.args) === 90, 'Pending dinner correction lost duration')
  expect(new Date(correctedDinner.response.args.start).getDay() === 6, 'Pending dinner correction did not move to Saturday')
  pass('04-dinner-correction', `${correctedDinner.response.args.start} with duration preserved`)

    const soccerRead = await callAssistant({
    key: '05-soccer-read',
    text: 'When is Riverside soccer practice?',
    family,
  })
  expect(soccerRead.response.semantic_intent === 'agent.read', 'Soccer lookup did not use agent.read')
  expect(soccerRead.response.conversation_state?.activeEventId === soccer.id, 'Soccer lookup did not establish the exact event')
    const soccerUpdate = await callAssistant({
    key: '06-soccer-update',
    text: 'Move it to 6:30 PM that same day.',
    family,
    history: [
      ...soccerRead.messages,
      { role: 'assistant', content: soccerRead.response.text },
    ],
    conversationState: soccerRead.response.conversation_state,
  })
  expect(soccerUpdate.response.type === 'tool_action' && soccerUpdate.response.tool === 'update_event', 'Soccer follow-up did not produce update_event')
  expect(soccerUpdate.response.args.id === soccer.id, 'Soccer update targeted the wrong event')
  expect(soccerUpdate.response.args.start.includes('T18:30:00'), 'Soccer update did not use the requested local 6:30 PM time')
  expect(durationMinutes(soccerUpdate.response.args) === 90, 'Soccer update did not preserve duration')
  pass('06-soccer-update', `${soccerUpdate.response.args.start} with 90-minute duration`)

    const groceryAdd = await callAssistant({
    key: '07-grocery-add',
    text: 'Add pears, pita chips, and ricotta to the grocery list.',
    family,
    page: 'grocery',
  })
  expect(groceryAdd.response.type === 'tool_action' && groceryAdd.response.tool === 'add_grocery_items', 'Three-item grocery request did not produce add_grocery_items')
    const addedNames = groceryAdd.response.args.items.map(({ name }) => name.toLowerCase()).sort()
  expect(JSON.stringify(addedNames) === JSON.stringify(['pears', 'pita chips', 'ricotta']), 'Three-item grocery proposal changed the requested items')
  pass('07-grocery-add', addedNames.join(', '))

    const oatRead = await callAssistant({
    key: '08-oat-read',
    text: 'How much barista oat milk is on the grocery list?',
    family,
    page: 'grocery',
  })
  expect(oatRead.response.semantic_intent === 'agent.read', 'Oat milk lookup did not use agent.read')
  expect(oatRead.response.conversation_state?.activeGroceryItemId === oatMilk.id, 'Oat milk lookup did not establish the exact item')
    const oatUpdate = await callAssistant({
    key: '09-oat-quantity',
    text: 'Make that two.',
    family,
    page: 'grocery',
    history: [...oatRead.messages, { role: 'assistant', content: oatRead.response.text }],
    conversationState: oatRead.response.conversation_state,
  })
  expect(oatUpdate.response.type === 'tool_action' && oatUpdate.response.tool === 'update_grocery_item_quantity', 'Oat milk follow-up did not produce a quantity update')
  expect(
    oatUpdate.response.args.item_id === oatMilk.id &&
      ['2', 'two'].includes(String(oatUpdate.response.args.quantity).toLowerCase()),
    'Oat milk follow-up targeted the wrong item or quantity',
  )
  pass('09-oat-quantity', `item=${oatUpdate.response.args.item_id} quantity=${oatUpdate.response.args.quantity}`)

    const eggRead = await callAssistant({
    key: '10-egg-read',
    text: 'Do we have quail eggs?',
    family,
    page: 'grocery',
  })
  expect(eggRead.response.semantic_intent === 'agent.read', 'Egg lookup did not use agent.read')
  expect(eggRead.response.conversation_state?.activeGroceryItemId === quailEggs.id, 'Egg lookup did not establish the exact item')
    const eggUpdate = await callAssistant({
    key: '11-egg-check',
    text: 'Check them off.',
    family,
    page: 'grocery',
    history: [...eggRead.messages, { role: 'assistant', content: eggRead.response.text }],
    conversationState: eggRead.response.conversation_state,
  })
  expect(eggUpdate.response.type === 'tool_action' && eggUpdate.response.tool === 'check_grocery_item', 'Egg follow-up did not produce check_grocery_item')
  expect(eggUpdate.response.args.item_id === quailEggs.id, 'Egg follow-up targeted the wrong item')
  pass('11-egg-check', `item=${eggUpdate.response.args.item_id}`)

    const duplicate = await callAssistant({
    key: '12-duplicate-clarification',
    text: 'Check off sparkling water.',
    family,
    page: 'grocery',
  })
  expect(duplicate.response.type === 'text', 'Duplicate grocery target did not return text clarification')
  expect(/more than one|which one/i.test(duplicate.response.text), 'Duplicate grocery target did not ask which item')
  pass('12-duplicate-clarification', duplicate.response.text)

    await verifyNoProposalsPersisted(baselineDinnerIds, baselineGroceryIds)
  } finally {
    await remove('events', createdEventIds)
    await remove('grocery_lists', createdListIds)
    const cleanup = {
      eventsRemaining: await count('events', createdEventIds),
      groceryItemsRemaining: await count('grocery_items', fixtureItemIds),
      groceryListsRemaining: await count('grocery_lists', createdListIds),
    }
    cleanup.verified = Object.values(cleanup).every((value) => value === 0)
    console.log(JSON.stringify({ runId, results, cleanup }, null, 2))
    if (!cleanup.verified) throw new Error(`Fixture cleanup failed: ${JSON.stringify(cleanup)}`)
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
