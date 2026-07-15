import crypto from 'node:crypto'
import fs from 'node:fs'

import {
  eventConversationState,
  groceryClarificationConversationState,
  groceryConversationState,
} from '../supabase/functions/_shared/assistant-conversation-grounding.mjs'
import { formatTextForMarkdown } from '../src/lib/assistantMarkdown.mjs'

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
const MODEL = process.argv.find((arg) => arg.startsWith('--model='))?.split('=')[1] ?? 'gemini-2.5-flash'
const SUPPORTED_MODES = new Set(['smoke', 'full', 'showcase', 'calendar-edge'])
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

function buildContext({ family, page, assistantMode, conversationState, pendingAction }) {
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
    pendingAction: pendingAction ?? undefined,
  }
}

async function callAssistant({ messages, family, page, assistantMode, conversationState, pendingAction, conversationId, turnId }) {
  const url = `${SUPABASE_URL}/functions/v1/ai-assistant`
  return fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      context: buildContext({ family, page, assistantMode, conversationState, pendingAction }),
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

async function seedCalendarFixtures(created = []) {
  const items = [
    {
      title: '[QA] Soccer practice',
      daysFromNow: 2,
      hour: 17,
      minutes: 30,
      durationMins: 90,
      locationName: 'Sunrise Community Center',
      address: '123 Sunrise Way, West Palm Beach, FL 33401',
    },
    { title: '[QA] Dentist appointment', daysFromNow: 3, hour: 10, minutes: 0, durationMins: 60 },
    { title: '[QA] Birthday dinner', daysFromNow: 4, hour: 18, minutes: 0, durationMins: 120 },
    {
      title: '[QA] Airport pickup',
      daysFromNow: 5,
      hour: 21,
      minutes: 15,
      durationMins: 75,
      locationName: 'Palm Beach International Airport',
      address: '1000 James L Turnage Blvd, West Palm Beach, FL 33415',
    },
    { title: '[QA] Library story time', daysFromNow: 6, hour: 9, minutes: 30, durationMins: 45 },
    { title: '[QA] Weekend trip to Maine', daysFromNow: 12, hour: 0, minutes: 0, durationMins: 4 * 24 * 60, allDay: true },
    { title: '[QA] Piano recital', daysFromNow: 8, hour: 16, minutes: 0, durationMins: 90 },
    { title: '[QA] PTA meeting', daysFromNow: 9, hour: 19, minutes: 0, durationMins: 60 },
  ]
  if (MODE === 'calendar-edge') {
    items.push(
      { title: '[QA] Edge dentist appointment', daysFromNow: 3, hour: 10, minutes: 0, durationMins: 60 },
      { title: '[QA] Edge dentist appointment', daysFromNow: 3, hour: 15, minutes: 0, durationMins: 60 },
      { title: '[QA] School meeting', daysFromNow: 3, hour: 14, minutes: 30, durationMins: 60 },
      { title: '[QA] School pickup', daysFromNow: 3, hour: 16, minutes: 30, durationMins: 30 },
      { title: '[QA] Recurring softball practice', daysFromNow: 8, hour: 17, minutes: 0, durationMins: 90, rrule: 'FREQ=WEEKLY' },
    )
  }

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
      is_enriched: true,
      description: runId,
      rrule: spec.rrule ?? null,
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

async function createQaGroceryList() {
  const url = new URL('/rest/v1/grocery_lists', SUPABASE_URL)
  const inserted = await fetchJson(url, {
    method: 'POST',
    headers: { ...headers, prefer: 'return=representation' },
    body: JSON.stringify([{ name: `[QA] ${runId}` }]),
  })
  const listId = inserted?.[0]?.id ?? null
  if (!listId) throw new Error('Failed to create isolated QA grocery list')
  return listId
}

async function seedGroceryFixtures(listId, created = []) {
  const items = [
    { name: 'milk for pancakes', quantity: '1', unit: 'gallon' },
    { name: 'eggs for omelets', quantity: '1', unit: 'dozen' },
    { name: 'tortillas for tacos', quantity: '1', unit: 'pack' },
    { name: 'bananas for smoothies', quantity: '6', unit: null },
    { name: 'oat milk for coffee', quantity: '2', unit: 'cartons' },
    { name: 'bread for sandwiches', quantity: null, unit: null },
  ]

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

async function seedRecipeFixture(created = []) {
  const recipeUrl = new URL('/rest/v1/recipes', SUPABASE_URL)
  const recipePayload = [{
    name: `[QA] Cedar Salmon Bowl ${runId}`,
    source_type: 'manual',
    source_excerpt: runId,
    servings: '4',
    cook_time: '30 minutes',
    last_used_at: new Date().toISOString(),
  }]
  const insertedRecipes = await fetchJson(recipeUrl, {
    method: 'POST',
    headers: { ...headers, prefer: 'return=representation' },
    body: JSON.stringify(recipePayload),
  })
  const recipe = insertedRecipes?.[0]
  if (!recipe?.id) throw new Error('Failed to create isolated QA recipe')
  created.push(recipe)

  const ingredientUrl = new URL('/rest/v1/recipe_ingredients', SUPABASE_URL)
  await fetchJson(ingredientUrl, {
    method: 'POST',
    headers: { ...headers, prefer: 'return=representation' },
    body: JSON.stringify([
      { recipe_id: recipe.id, raw_text: '1.5 pounds salmon', name: 'salmon', quantity: '1.5', unit: 'pounds', sort_order: 0 },
      { recipe_id: recipe.id, raw_text: '2 teaspoons sumac', name: 'sumac', quantity: '2', unit: 'teaspoons', sort_order: 1 },
      { recipe_id: recipe.id, raw_text: '3 tablespoons tahini', name: 'tahini', quantity: '3', unit: 'tablespoons', sort_order: 2 },
    ]),
  })

  const stepUrl = new URL('/rest/v1/recipe_steps', SUPABASE_URL)
  await fetchJson(stepUrl, {
    method: 'POST',
    headers: { ...headers, prefer: 'return=representation' },
    body: JSON.stringify([
      { recipe_id: recipe.id, step_number: 1, instruction: 'Season the salmon with sumac.' },
      { recipe_id: recipe.id, step_number: 2, instruction: 'Roast the salmon until safely cooked.' },
      { recipe_id: recipe.id, step_number: 3, instruction: 'Whisk the tahini sauce and rest the salmon.' },
    ]),
  })
  return recipe
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

async function cleanupRecipes(ids) {
  if (!ids.length) return 0
  const url = new URL('/rest/v1/recipes', SUPABASE_URL)
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

async function cleanupQaGroceryList(listId) {
  if (!listId) return 0
  const url = new URL('/rest/v1/grocery_lists', SUPABASE_URL)
  url.searchParams.set('id', `eq.${listId}`)
  await fetchJson(url, {
    method: 'DELETE',
    headers: { ...headers, prefer: 'return=minimal' },
  })
  return 1
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

async function countRowsByColumn(table, column, values) {
  if (!values.length) return 0
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL)
  url.searchParams.set('select', 'id')
  url.searchParams.set(column, `in.(${values.join(',')})`)
  const rows = await fetchJson(url, { headers })
  return Array.isArray(rows) ? rows.length : 0
}

function scenarioGroups(fixtures, grocerySeeds, familyNames, recipeFixture) {
  const [firstName = 'Alex', secondName = firstName] = familyNames
  const eventBySuffix = (title) => fixtures.find((event) => event.title.endsWith(title))
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
      conversationState: eventConversationState(eventBySuffix('Soccer practice'), now),
      steps: [
        { text: 'move it to next friday at 7pm.', expect: { type: 'writeOrClarify', tool: 'update_event' } },
        { text: 'where is it located again?', expect: { type: 'text' } },
      ],
    },
    {
      key: 'calendar-delete',
      page: 'calendar',
      assistantMode: 'general',
      conversationState: eventConversationState(eventBySuffix('Library story time'), now),
      steps: [
        { text: 'delete that one.', expect: { type: 'write', tool: 'delete_event' } },
        { text: 'what time was birthday dinner again?', expect: { type: 'text' } },
      ],
    },
    {
      key: 'calendar-followups',
      page: 'calendar',
      assistantMode: 'general',
      conversationState: eventConversationState(eventBySuffix('Airport pickup'), now),
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
        { text: 'check off the eggs for omelets.', expect: { type: 'writeOrClarify', tool: 'check_grocery_item' } },
        { text: 'what else is still on the list?', expect: { type: 'text' } },
        { text: 'remove tortillas for tacos from my grocery list.', expect: { type: 'writeOrClarify', tool: 'remove_grocery_item' } },
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
      conversationState: eventConversationState(eventBySuffix('Birthday dinner'), now),
      steps: [
        { text: 'can u move the brthday dinner to thursday at 6?', expect: { type: 'writeOrClarify', tool: 'update_event' } },
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
      conversationState: eventConversationState(eventBySuffix('PTA meeting'), now),
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
      key: 'semantic-grocery-list-follow-up',
      page: 'grocery',
      assistantMode: 'general',
      conversationState: groceryClarificationConversationState(grocerySeeds, now),
      steps: [
        {
          text: 'read my grocery list',
          expect: { type: 'text', semanticIntent: 'grocery.list', maxLlmCalls: 0 },
          preserveConversationState: true,
        },
        { text: 'check off the second one', expect: { type: 'write', tool: 'check_grocery_item', maxLlmCalls: 0 } },
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
    {
      key: 'cooking-saved-recipe-grounding',
      page: 'cooking',
      assistantMode: 'chef',
      steps: [
        {
          text: `For my saved recipe "${recipeFixture.name}", list its ingredients and tell me what happens immediately after roasting the salmon.`,
          expect: { type: 'text', containsAll: ['sumac', 'tahini', 'whisk'] },
        },
      ],
    },
    {
      key: 'cooking-serving-scale',
      page: 'cooking',
      assistantMode: 'chef',
      steps: [
        {
          text: 'Use this exact salmon bowl recipe for four: 1.5 pounds salmon, 2 cups dry rice, 4 cups broccoli, and 4 tablespoons sauce.',
          expect: { type: 'text' },
        },
        {
          text: 'Make that recipe for eight people.',
          expect: { type: 'text', containsAll: ['3 pounds', '4 cups', '8 cups', '8 tablespoons'] },
        },
      ],
    },
    {
      key: 'cooking-grocery-handoff',
      page: 'cooking',
      assistantMode: 'chef',
      steps: [
        {
          text: 'For salmon rice bowls, what ingredients am I missing? I already have salmon and rice; I still need broccoli and soy sauce. Do not change my grocery list.',
          expect: { type: 'text', containsAll: ['broccoli', 'soy sauce'] },
        },
        {
          text: 'Add only those missing ingredients to my grocery list. Do not add salmon or rice.',
          expect: {
            type: 'write',
            tool: 'add_grocery_items',
            itemNamesAll: ['broccoli', 'soy sauce'],
            itemNamesNotAny: ['salmon', 'rice'],
          },
          deferAction: true,
        },
      ],
    },
    {
      key: 'cooking-safety',
      page: 'cooking',
      assistantMode: 'chef',
      steps: [
        {
          text: 'Cooked rice sat on the counter overnight. Is it safe to reheat and eat?',
          expect: { type: 'text', containsAny: ['discard', 'throw it away', 'not safe'] },
        },
        {
          text: 'I have a severe peanut allergy. What can I safely use instead of peanut butter in a sauce?',
          expect: { type: 'text', containsAny: ['sunflower', 'seed', 'allergy'] },
        },
      ],
    },
  ]
}

function showcaseScenarioGroups() {
  return [
    {
      key: 'showcase-busy-calendar',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: "What's going on Thursday?", expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 0, readable: true } },
        { text: 'Which one is first?', expect: { type: 'text', containsAny: ['first', 'am', 'pm', 'all day'] } },
      ],
    },
    {
      key: 'showcase-calendar-locations',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: 'Where do I need to go this week?', expect: { type: 'text', readable: true } },
        { text: 'What time is the first one?', expect: { type: 'text', containsAny: ['am', 'pm', 'all day'] } },
      ],
    },
    {
      key: 'showcase-grocery-read',
      page: 'grocery',
      assistantMode: 'general',
      steps: [
        { text: "What's left on the grocery list?", expect: { type: 'text', semanticIntent: 'grocery.list', maxLlmCalls: 0, readable: true } },
        { text: 'Do we already have milk on there?', expect: { type: 'text', containsAny: ['milk', 'list'] } },
      ],
    },
    {
      key: 'showcase-stt-calendar',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: 'Whats happening tomoro afternoon', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 0 } },
        { text: 'Any conflicts?', expect: { type: 'text', containsAll: ['tomorrow', 'afternoon'] } },
      ],
    },
    {
      key: 'showcase-dinner-ideas',
      page: 'cooking',
      assistantMode: 'chef',
      steps: [
        { text: 'Give me five easy dinner ideas using salmon, but no pasta.', expect: { type: 'text', containsAny: ['salmon'], readable: true } },
        { text: 'Tell me more about the third one.', expect: { type: 'text', readable: true } },
      ],
    },
    {
      key: 'showcase-recipe',
      page: 'cooking',
      assistantMode: 'chef',
      steps: [
        { text: 'How do I make crispy fish tacos? Include ingredients and steps.', expect: { type: 'text', containsAny: ['ingredient', 'step'], readable: true } },
        { text: 'What can I prep ahead?', expect: { type: 'text', readable: true } },
      ],
    },
    {
      key: 'showcase-troubleshooting',
      page: 'cooking',
      assistantMode: 'chef',
      steps: [
        { text: 'My mashed potatoes are gluey. What happened and how can I fix them?', expect: { type: 'text', containsAny: ['starch', 'potato', 'fix'], readable: true } },
        { text: 'How do I stop that next time?', expect: { type: 'text', readable: true } },
      ],
    },
    {
      key: 'showcase-meal-plan',
      page: 'cooking',
      assistantMode: 'chef',
      steps: [
        { text: 'Plan three dinners using salmon, black beans, and leftover rice. Keep them kid friendly.', expect: { type: 'text', containsAny: ['salmon', 'beans', 'rice'], readable: true } },
        {
          text: 'Make me one combined grocery list.',
          expect: {
            type: 'text',
            containsAll: ['cheese'],
            notContainsAny: [
              'gatorade',
              'flonase',
              'cat treats',
            ],
            readable: true,
          },
        },
      ],
    },
    {
      key: 'showcase-grocery-mutation',
      page: 'grocery',
      assistantMode: 'general',
      steps: [
        { text: 'Add milk, bananas, pasta, chicken thighs, and taco shells to the grocery list.', expect: { type: 'write', tool: 'add_grocery_items' } },
        { text: "What's on the list now?", expect: { type: 'text', semanticIntent: 'grocery.list', maxLlmCalls: 0, containsAny: ['milk', 'banana', 'pasta'], readable: true } },
      ],
    },
    {
      key: 'showcase-steak',
      page: 'cooking',
      assistantMode: 'chef',
      steps: [
        { text: 'Explain how to pan sear salmon, including preparation, pan temperature, cooking time, resting, common mistakes, and food safety.', expect: { type: 'text', containsAny: ['temperature', 'rest', 'safety'], readable: true } },
        { text: 'Summarize that into a checklist.', expect: { type: 'text', readable: true } },
      ],
    },
  ]
}

function hasReadableStructure(text) {
  const formatted = formatTextForMarkdown(String(text ?? ''))
  if (formatted.length < 180) return true
  return /\n\n|(?:^|\n)(?:[-*]|\d+\.)\s+|(?:^|\n)#{1,6}\s+/m.test(formatted)
}

function calendarEdgeScenarioGroups(fixtures) {
  const eventBySuffix = (title) => fixtures.find((event) => event.title.endsWith(title))
  const weekdayFor = (event) => new Date(event.start_time).toLocaleDateString('en-US', { weekday: 'long' })
  const dentistDay = weekdayFor(eventBySuffix('Edge dentist appointment'))
  const birthdayDay = weekdayFor(eventBySuffix('Birthday dinner'))
  const recurringDay = weekdayFor(eventBySuffix('Recurring softball practice'))
  const schoolPickupDay = weekdayFor(eventBySuffix('School pickup'))
  return [
    {
      key: 'edge-duplicate-delete',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: `Delete the edge dentist appointment ${dentistDay}.`, expect: { type: 'clarify', containsAny: ['which', '10:00', '3:00'] } },
        { text: 'The afternoon one.', expect: { type: 'write', tool: 'delete_event' } },
      ],
    },
    {
      key: 'edge-correct-create',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: 'Schedule swim practice Friday at 4 PM.', deferAction: true, expect: { type: 'write', tool: 'create_event' } },
        { text: 'Actually, make that Saturday at 10 in the morning.', expect: { type: 'write', tool: 'create_event' } },
        { text: 'What time is it now?', expect: { type: 'text', containsAny: ['10:00', '10 am', '10:00 am'] } },
      ],
    },
    {
      key: 'edge-cancel-delete-pivot',
      page: 'calendar',
      assistantMode: 'general',
      conversationState: eventConversationState(eventBySuffix('Soccer practice'), now),
      steps: [
        { text: 'Delete soccer practice.', deferAction: true, expect: { type: 'write', tool: 'delete_event' } },
        { text: 'Never mind—when does it start?', expect: { type: 'text', containsAny: ['5:30', '17:30'], notContainsAny: ['deleted', 'cancelled'] } },
      ],
    },
    {
      key: 'edge-cross-midnight',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: 'Add an event called Late airport pickup Friday from 11:30 PM until 1 AM Saturday.', expect: { type: 'write', tool: 'create_event' } },
        { text: 'How long does it last?', expect: { type: 'text', containsAny: ['1 hour 30', '90 minutes'] } },
      ],
    },
    {
      key: 'edge-multiday-shift',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: 'Add a trip called Mountain getaway from August 7 through August 10.', expect: { type: 'write', tool: 'create_event' } },
        { text: 'Move that trip back two days.', expect: { type: 'write', tool: 'update_event' } },
        { text: 'How long is it now?', expect: { type: 'text', containsAny: ['hours', 'days'] } },
      ],
    },
    {
      key: 'edge-conflicting-move',
      page: 'calendar',
      assistantMode: 'general',
      conversationState: eventConversationState(eventBySuffix('Dentist appointment'), now),
      steps: [
        { text: `Move the dentist appointment to 3 PM ${dentistDay}.`, expect: { type: 'clarify', containsAny: ['conflict', 'overlap', 'school meeting'] } },
        { text: 'Put it immediately after the meeting instead.', expect: { type: 'write', tool: 'update_event' } },
      ],
    },
    {
      key: 'edge-ambiguous-stt-time',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: 'Schedule tutoring next sat at ate.', expect: { type: 'clarify', containsAny: ['8 am', '8 pm', 'morning', 'evening'] } },
        { text: 'Eight in the morning.', expect: { type: 'write', tool: 'create_event' } },
      ],
    },
    {
      key: 'edge-recurring-scope',
      page: 'calendar',
      assistantMode: 'general',
      conversationState: eventConversationState(eventBySuffix('Recurring softball practice'), now),
      steps: [
        { text: `Move softball practice next ${recurringDay} to 6 PM.`, expect: { type: 'clarify', containsAny: ['one', 'occurrence', 'series'] } },
        { text: 'Just that one.', expect: { type: 'text', containsAny: ['event editor', 'cannot safely', 'not supported'] } },
      ],
    },
    {
      key: 'edge-stale-confirmation',
      page: 'calendar',
      assistantMode: 'general',
      conversationState: eventConversationState(eventBySuffix('Birthday dinner'), now),
      steps: [
        { text: `Delete the birthday dinner ${birthdayDay}.`, deferAction: true, expect: { type: 'write', tool: 'delete_event' } },
        { text: "What's happening Saturday?", expect: { type: 'text', semanticIntent: 'calendar.list' } },
        { text: 'Yes.', expect: { type: 'limit', notContainsAny: ['deleted', 'cancelled'] } },
      ],
    },
    {
      key: 'edge-selective-bulk-delete',
      page: 'calendar',
      assistantMode: 'general',
      steps: [
        { text: `Clear my calendar ${schoolPickupDay} except school pickup.`, deferAction: true, expect: { type: 'write', tool: 'delete_events_by_title' } },
        { text: 'What exactly would remain?', expect: { type: 'text', containsAny: ['school pickup'] } },
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

function itemNameExpectationError(response, expectation) {
  const itemNames = Array.isArray(response?.args?.items)
    ? response.args.items.map((item) => String(item?.name ?? '').trim().toLowerCase()).filter(Boolean)
    : []
  const missing = (expectation.itemNamesAll ?? [])
    .filter((term) => !itemNames.some((name) => name.includes(term.toLowerCase())))
  const unexpected = (expectation.itemNamesNotAny ?? [])
    .filter((term) => itemNames.some((name) => name.includes(term.toLowerCase())))
  if (missing.length) return `tool_items_missing:${missing.join('_')}`
  if (unexpected.length) return `tool_items_unexpected:${unexpected.join('_')}`
  return null
}

async function run() {
  const family = await loadFamily()
  const familyNames = family.map((member) => member.name)
  let calendarFixtures = []
  let groceryFixtures = []
  let recipeFixtures = []
  let qaGroceryListId = null
  const results = []
  const conversationStates = new Map()
  const conversationHistories = new Map()
  const pendingActions = new Map()
  const createdEventIds = new Set()
  const createdGroceryIds = new Set()

  try {
    await seedCalendarFixtures(calendarFixtures)
    qaGroceryListId = await createQaGroceryList()
    await seedGroceryFixtures(qaGroceryListId, groceryFixtures)
    const recipeFixture = await seedRecipeFixture(recipeFixtures)
    const groups = MODE === 'showcase'
      ? showcaseScenarioGroups()
      : MODE === 'calendar-edge'
        ? calendarEdgeScenarioGroups(calendarFixtures)
        : scenarioGroups(calendarFixtures, groceryFixtures, familyNames, recipeFixture)
    const flatSteps = groups.flatMap((group) => group.steps.map((step, index) => ({
      ...step,
      groupKey: group.key,
      page: group.page,
      assistantMode: group.assistantMode,
      initialConversationState: index === 0 ? group.conversationState ?? null : undefined,
    })))
    const steps = STEP_LIMIT ? flatSteps.slice(0, STEP_LIMIT) : flatSteps

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]
      const conversationId = `${runId}-${step.groupKey}`
      const turnId = crypto.randomUUID()
      const currentState = step.initialConversationState !== undefined
        ? step.initialConversationState
        : conversationStates.get(step.groupKey) ?? null
      const history = [
        ...(conversationHistories.get(step.groupKey) ?? []),
        { role: 'user', content: step.text },
      ]

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
        pendingAction: pendingActions.get(step.groupKey) ?? null,
        conversationId,
        turnId,
      })

      output.assistant_type = response?.type ?? 'unknown'
      output.assistant_text = response?.text ?? response?.display_text ?? null
      output.formatted_text = response?.type === 'text'
        ? formatTextForMarkdown(String(output.assistant_text ?? ''))
        : null
      output.tool = response?.tool ?? null
      output.args = response?.args ?? null
      output.semantic_intent = response?.authoritative_provenance?.semantic_intent ?? null
      output.llm_calls = response?.telemetry?.llm_calls ?? null

      if (response?.conversation_state && !step.preserveConversationState) {
        conversationStates.set(step.groupKey, response.conversation_state)
      } else if (step.preserveConversationState && currentState) {
        conversationStates.set(step.groupKey, currentState)
      }
      if (response?.type === 'text' && output.assistant_text) {
        conversationHistories.set(step.groupKey, [
          ...history,
          { role: 'assistant', content: output.assistant_text },
        ])
      }
      const itemNameError = itemNameExpectationError(response, step.expect)

      if (step.expect.type === 'clarify') {
        if (!(isClarifyingResponse(response) || (response?.type === 'text' && !response?.tool))) {
          output.ok = false
          output.note = `expected_clarification:got_${stepSummary(response)}`
        } else if (
          Array.isArray(step.expect.containsAny)
          && !step.expect.containsAny.some((term) => String(output.assistant_text ?? '').toLowerCase().includes(term))
        ) {
          output.ok = false
          output.note = `clarification_content_missing:expected_any_${step.expect.containsAny.join('_')}`
        }
      } else if (step.expect.type === 'limit') {
        if (response?.type !== 'text' || response?.tool) {
          output.ok = false
          output.note = `unsafe_boundary_execution:got_${stepSummary(response)}`
        } else if (
          Array.isArray(step.expect.notContainsAny)
          && step.expect.notContainsAny.some((term) => String(output.assistant_text ?? '').toLowerCase().includes(term))
        ) {
          output.ok = false
          output.note = `unsafe_boundary_claim:unexpected_${step.expect.notContainsAny.join('_')}`
        } else {
          output.note = stepSummary(response)
        }
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
        } else if (
          Array.isArray(step.expect.containsAny)
          && !step.expect.containsAny.some((term) => String(output.assistant_text ?? '').toLowerCase().includes(term))
        ) {
          output.ok = false
          output.note = `response_content_missing:expected_any_${step.expect.containsAny.join('_')}`
        } else if (
          Array.isArray(step.expect.containsAll)
          && !step.expect.containsAll.every((term) => String(output.assistant_text ?? '').toLowerCase().includes(term))
        ) {
          output.ok = false
          output.note = `response_content_missing:expected_all_${step.expect.containsAll.join('_')}`
        } else if (
          Array.isArray(step.expect.notContainsAny)
          && step.expect.notContainsAny.some((term) => String(output.assistant_text ?? '').toLowerCase().includes(term))
        ) {
          output.ok = false
          output.note = `response_content_leak:unexpected_${step.expect.notContainsAny.join('_')}`
        } else if (step.expect.readable && !hasReadableStructure(output.assistant_text)) {
          output.ok = false
          output.note = 'response_not_readable'
        }
      } else if (
        step.expect.type === 'writeOrClarify'
        && response?.type === 'text'
        && !response?.tool
        && /(which|conflict|overlap|more than one|multiple match|exact .*name)/i.test(String(output.assistant_text ?? ''))
      ) {
        output.note = 'safe_clarification'
      } else if (step.expect.type === 'write' || step.expect.type === 'writeOrClarify') {
        if (response?.type === 'text' && response?.write_verified === true) {
          output.action_result = 'auto_executed_verified'
        } else if (response?.type !== 'tool_action') {
          output.ok = false
          output.note = `expected_write:got_${stepSummary(response)}`
        } else if (response?.tool !== step.expect.tool) {
          output.ok = false
          output.note = `tool_mismatch:expected_${step.expect.tool}:got_${response?.tool}`
        } else if (itemNameError) {
          output.ok = false
          output.note = itemNameError
        } else if (step.deferAction) {
          pendingActions.set(step.groupKey, { tool: response.tool, args: response.args ?? {} })
          output.action_result = 'deferred'
        } else {
          pendingActions.delete(step.groupKey)
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
          if (step.page === 'calendar' && ['create_event', 'update_event'].includes(response.tool)) {
            const eventId = actionResult?.event_id ?? response.args?.id
            if (typeof eventId === 'string' && eventId.length > 0) {
              const eventUrl = new URL('/rest/v1/events', SUPABASE_URL)
              eventUrl.searchParams.set('select', 'id,title,start_time,end_time,updated_at,all_day,location_name,address,description')
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
    const fixtureGroceryIds = groceryFixtures.map((item) => item.id).filter(Boolean)
    const createdGroceryItemIds = [...createdGroceryIds]
    const recipeIds = recipeFixtures.map((recipe) => recipe.id).filter(Boolean)
    const cleanup = {
      events_deleted: await cleanupEvents(eventIds),
      grocery_items_deleted: fixtureGroceryIds.length + await cleanupGroceryItems(createdGroceryItemIds),
      grocery_lists_deleted: await cleanupQaGroceryList(qaGroceryListId),
      recipes_deleted: await cleanupRecipes(recipeIds),
    }
    cleanup.events_remaining = await countRowsByIds('events', eventIds)
    cleanup.fixture_grocery_items_remaining = await countRowsByIds('grocery_items', fixtureGroceryIds)
    cleanup.active_grocery_items_remaining = await countRowsByIds('grocery_items', createdGroceryItemIds, {
      deleted_at: 'is.null',
    })
    cleanup.qa_grocery_lists_remaining = await countRowsByIds('grocery_lists', qaGroceryListId ? [qaGroceryListId] : [])
    cleanup.recipes_remaining = await countRowsByIds('recipes', recipeIds)
    cleanup.recipe_ingredients_remaining = await countRowsByColumn('recipe_ingredients', 'recipe_id', recipeIds)
    cleanup.recipe_steps_remaining = await countRowsByColumn('recipe_steps', 'recipe_id', recipeIds)
    cleanup.verified = cleanup.events_remaining === 0 &&
      cleanup.fixture_grocery_items_remaining === 0 &&
      cleanup.active_grocery_items_remaining === 0 &&
      cleanup.qa_grocery_lists_remaining === 0 &&
      cleanup.recipes_remaining === 0 &&
      cleanup.recipe_ingredients_remaining === 0 &&
      cleanup.recipe_steps_remaining === 0
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
      showcase: MODE === 'showcase'
        ? results.map((result) => ({
          conversation: result.group,
          user: result.text,
          assistant: result.assistant_text,
          formatted: result.formatted_text,
          ok: result.ok,
        }))
        : undefined,
      calendar_edge: MODE === 'calendar-edge'
        ? results.map((result) => ({
          conversation: result.group,
          user: result.text,
          assistant: result.assistant_text,
          tool: result.tool,
          action_result: result.action_result,
          ok: result.ok,
        }))
        : undefined,
      failures: results.filter((result) => !result.ok).slice(0, 20),
    }, null, 2))
    if (totals.failed > 0 || !cleanup.verified) process.exitCode = 1
  }
}

run().catch(async (error) => {
  console.error(error)
  process.exitCode = 1
})
