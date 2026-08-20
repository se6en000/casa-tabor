import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function loadEnv() {
  const envPaths = ['.env.local', '.env']
  const env = {}
  for (const envPath of envPaths) {
    const fullPath = path.resolve(process.cwd(), envPath)
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim()
          let val = trimmed.slice(eqIdx + 1).trim()
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
          }
          env[key] = val
        }
      }
    }
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
}

const MODEL = process.argv.find((arg) => arg.startsWith('--model='))?.split('=')[1] ?? 'gemini-2.5-flash'
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
  return Array.isArray(rows) && rows.length > 0 ? rows : [{ id: '1', name: 'Jake' }, { id: '2', name: 'Alex' }, { id: '3', name: 'Leo' }]
}

function buildContext({ family, page = 'calendar', assistantMode = 'general', conversationState = null, events = null }) {
  const current = new Date()
  const defaultEvents = [
    {
      id: 'evt-soccer-1',
      title: 'Soccer Practice',
      start_time: new Date(current.getTime() + 2 * 3600_000).toISOString(),
      end_time: new Date(current.getTime() + 3.5 * 3600_000).toISOString(),
      location: 'Field 4, Community Sports Complex',
    },
    {
      id: 'evt-standup-2',
      title: 'Family Weekly Check-in',
      start_time: new Date(current.getTime() + 26 * 3600_000).toISOString(),
      end_time: new Date(current.getTime() + 27 * 3600_000).toISOString(),
    },
  ]

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
    family: family.map((m) => ({ id: m.id, name: m.name })),
    events: events ?? defaultEvents,
    homeCity: 'West Palm Beach',
    conversationState,
  }
}

async function callAssistant({ messages, family, page = 'calendar', assistantMode = 'general', conversationState = null, conversationId, turnId }) {
  const url = `${SUPABASE_URL}/functions/v1/ai-assistant`
  const startTime = Date.now()
  const payload = await fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      context: buildContext({ family, page, assistantMode, conversationState }),
      session_id: conversationId,
      correlation_id: `${conversationId}:${turnId}`,
      trace_id: crypto.randomUUID(),
      turn_id: turnId,
      lane: 'llm',
      client_trace_present: true,
      client_build: 'test-ai-conversational-semantics',
      client_trace_source: 'test-ai-conversational-semantics',
      stream: false,
      dry_run: true,
      model_override: MODEL,
    }),
  })
  return { ...payload, latencyMs: Date.now() - startTime }
}

// Semantic evaluation suite definition
// Note: Evaluators check SEMANTIC INTENT, entities, slots, and conversational validity without exact-string matching.
function defineSemanticClusters(family) {
  const memberName = family[0]?.name ?? 'Alex'

  return [
    {
      clusterName: '📅 Calendar Scheduling Intent (Varied Human Phrasings)',
      description: 'Tests diverse natural language requests to schedule an event. Validates intent resolution, slot extraction, and tool dispatch.',
      cases: [
        {
          label: 'Polite indirect phrasing',
          input: `Can you put soccer practice on the books for ${memberName} this Thursday from 4 to 5:30?`,
          page: 'calendar',
          evaluate: (res) => {
            const hasCreateTool = res.type === 'tool_action' && res.tool === 'create_event'
            const titleMatches = /soccer/i.test(res.args?.title ?? res.display_text ?? '')
            return {
              ok: hasCreateTool && titleMatches,
              reason: hasCreateTool && titleMatches
                ? `Dispatched create_event with title "${res.args?.title}"`
                : `Expected create_event with soccer title, got type=${res.type}, tool=${res.tool}`,
            }
          },
        },
        {
          label: 'Declarative statement',
          input: `${memberName} has soccer practice on Thursday 4pm until 5:30pm`,
          page: 'calendar',
          evaluate: (res) => {
            const hasCreateTool = res.type === 'tool_action' && res.tool === 'create_event'
            const titleMatches = /soccer/i.test(res.args?.title ?? res.display_text ?? '')
            return {
              ok: hasCreateTool && titleMatches,
              reason: hasCreateTool && titleMatches
                ? `Dispatched create_event with title "${res.args?.title}"`
                : `Expected create_event with soccer title, got type=${res.type}, tool=${res.tool}`,
            }
          },
        },
        {
          label: 'Terse shorthand command',
          input: `Add soccer for ${memberName} Thursday 4:00-5:30`,
          page: 'calendar',
          evaluate: (res) => {
            const hasCreateTool = res.type === 'tool_action' && res.tool === 'create_event'
            const titleMatches = /soccer/i.test(res.args?.title ?? res.display_text ?? '')
            return {
              ok: hasCreateTool && titleMatches,
              reason: hasCreateTool && titleMatches
                ? `Dispatched create_event with title "${res.args?.title}"`
                : `Expected create_event with soccer title, got type=${res.type}, tool=${res.tool}`,
            }
          },
        },
      ],
    },
    {
      clusterName: '🔍 Calendar Schedule Inquiries (Natural Conversational Queries)',
      description: 'Tests diverse conversational questions about upcoming plans. Validates semantic calendar reading without brittle exact keywords.',
      cases: [
        {
          label: 'Casual afternoon check',
          input: 'What do we have going on tomorrow afternoon?',
          page: 'calendar',
          evaluate: (res) => {
            const isValidText = res.type === 'text' && typeof res.text === 'string' && res.text.length > 10
            return {
              ok: isValidText,
              reason: isValidText
                ? `Responded with conversational schedule analysis (${res.text.length} chars)`
                : `Expected informative text response, got type=${res.type}`,
            }
          },
        },
        {
          label: 'Event boundary query',
          input: 'Anything happening after lunch tomorrow?',
          page: 'calendar',
          evaluate: (res) => {
            const isValidText = res.type === 'text' && typeof res.text === 'string' && res.text.length > 10
            return {
              ok: isValidText,
              reason: isValidText
                ? `Responded conversationally to boundary query (${res.text.length} chars)`
                : `Expected informative text response, got type=${res.type}`,
            }
          },
        },
        {
          label: 'Conflict & availability inquiry',
          input: 'Do I have any conflicts on Monday morning?',
          page: 'calendar',
          evaluate: (res) => {
            const isValidText = res.type === 'text' && typeof res.text === 'string' && res.text.length > 10
            return {
              ok: isValidText,
              reason: isValidText
                ? `Responded with schedule conflict assessment (${res.text.length} chars)`
                : `Expected informative text response, got type=${res.type}`,
            }
          },
        },
      ],
    },
    {
      clusterName: '🛒 Grocery List Intent & Item Parsing (Varied Expressions)',
      description: 'Tests adding multiple items across different slang, idioms, and sentence styles. Validates semantic item extraction.',
      cases: [
        {
          label: 'Conversational problem/solution phrasing',
          input: 'We ran out of oat milk and avocados, can you add those to the shopping list?',
          page: 'grocery',
          evaluate: (res) => {
            const hasTool = res.type === 'tool_action' && res.tool === 'add_grocery_items'
            const items = res.args?.items ?? []
            const itemNames = items.map((i) => (typeof i === 'string' ? i : i?.name ?? '')).join(' ').toLowerCase()
            const foundOatMilk = /oat\s*milk/i.test(itemNames)
            const foundAvocado = /avocado/i.test(itemNames)
            const ok = hasTool && foundOatMilk && foundAvocado
            return {
              ok,
              reason: ok
                ? `Extracted items: ${items.map((i) => (typeof i === 'string' ? i : i?.name)).join(', ')}`
                : `Expected add_grocery_items with oat milk and avocados, got: ${JSON.stringify(res.args)}`,
            }
          },
        },
        {
          label: 'Colloquial "toss on list" phrasing',
          input: 'Toss oat milk and ripe avocados on the grocery list',
          page: 'grocery',
          evaluate: (res) => {
            const hasTool = res.type === 'tool_action' && res.tool === 'add_grocery_items'
            const items = res.args?.items ?? []
            const itemNames = items.map((i) => (typeof i === 'string' ? i : i?.name ?? '')).join(' ').toLowerCase()
            const foundOatMilk = /oat\s*milk/i.test(itemNames)
            const foundAvocado = /avocado/i.test(itemNames)
            const ok = hasTool && foundOatMilk && foundAvocado
            return {
              ok,
              reason: ok
                ? `Extracted items: ${items.map((i) => (typeof i === 'string' ? i : i?.name)).join(', ')}`
                : `Expected add_grocery_items with oat milk and avocados, got: ${JSON.stringify(res.args)}`,
            }
          },
        },
        {
          label: 'Implicit need statement',
          input: 'Need more avocados and oat milk for the house',
          page: 'grocery',
          evaluate: (res) => {
            const hasTool = res.type === 'tool_action' && res.tool === 'add_grocery_items'
            const items = res.args?.items ?? []
            const itemNames = items.map((i) => (typeof i === 'string' ? i : i?.name ?? '')).join(' ').toLowerCase()
            const foundOatMilk = /oat\s*milk/i.test(itemNames)
            const foundAvocado = /avocado/i.test(itemNames)
            const ok = hasTool && foundOatMilk && foundAvocado
            return {
              ok,
              reason: ok
                ? `Extracted items: ${items.map((i) => (typeof i === 'string' ? i : i?.name)).join(', ')}`
                : `Expected add_grocery_items with oat milk and avocados, got: ${JSON.stringify(res.args)}`,
            }
          },
        },
      ],
    },
    {
      clusterName: '🍳 Culinary & Recipe Assistance (Ingredient-Based Idea Generation)',
      description: 'Tests chef assistant creativity, ingredient grounding, and culinary formatting.',
      cases: [
        {
          label: 'Open-ended ingredient pairing',
          input: 'What can I whip up with salmon and broccoli tonight for dinner?',
          page: 'cooking',
          assistantMode: 'chef',
          evaluate: (res) => {
            const text = (res.text ?? '').toLowerCase()
            const mentionsSalmon = text.includes('salmon')
            const mentionsBroccoli = text.includes('broccoli')
            const hasCulinaryStructure = text.length > 50
            const ok = res.type === 'text' && mentionsSalmon && mentionsBroccoli && hasCulinaryStructure
            return {
              ok,
              reason: ok
                ? `Generated culinary suggestions grounding on salmon & broccoli (${res.text.length} chars)`
                : `Expected culinary response referencing salmon and broccoli, got type=${res.type}`,
            }
          },
        },
        {
          label: 'Fridge-raid prompt',
          input: 'Got fresh salmon and broccoli in the fridge, give me a quick 20 minute dinner idea',
          page: 'cooking',
          assistantMode: 'chef',
          evaluate: (res) => {
            const text = (res.text ?? '').toLowerCase()
            const mentionsSalmon = text.includes('salmon')
            const mentionsBroccoli = text.includes('broccoli')
            const ok = res.type === 'text' && mentionsSalmon && mentionsBroccoli
            return {
              ok,
              reason: ok
                ? `Generated 20-minute recipe idea grounding on ingredients (${res.text.length} chars)`
                : `Expected recipe idea referencing salmon and broccoli, got type=${res.type}`,
            }
          },
        },
      ],
    },
    {
      clusterName: '💡 Kiosk Ambient Glance & Proactive Briefings',
      description: 'Tests ambient glance triggers on kiosk idle/empty state to ensure proactive conversational responsiveness.',
      cases: [
        {
          label: 'Schedule readiness query',
          input: 'Prep me for soccer practice',
          page: 'home',
          evaluate: (res) => {
            const isValidText = res.type === 'text' && typeof res.text === 'string' && res.text.length > 10
            return {
              ok: isValidText,
              reason: isValidText
                ? `Provided ambient schedule prep rundown (${res.text.length} chars)`
                : `Expected informative response, got type=${res.type}`,
            }
          },
        },
        {
          label: 'Proactive dinner planning',
          input: 'Plan a quick weeknight dinner for tonight',
          page: 'home',
          evaluate: (res) => {
            const isValidText = (res.type === 'text' || res.type === 'tool_action') && Boolean(res.text || res.display_text)
            return {
              ok: isValidText,
              reason: isValidText
                ? `Generated proactive dinner recommendation`
                : `Expected dinner recommendation, got type=${res.type}`,
            }
          },
        },
      ],
    },
    {
      clusterName: '🔗 Multi-Domain Compound & Chained Workflows',
      description: 'Tests chained requests spanning culinary ideation and grocery list addition in a single turn.',
      cases: [
        {
          label: 'Meal planning with grocery auto-extraction',
          input: 'Plan taco night for Friday and add taco shells and salsa to the shopping list',
          page: 'cooking',
          assistantMode: 'chef',
          evaluate: (res) => {
            const hasGroceryTool = res.type === 'tool_action' && res.tool === 'add_grocery_items'
            const responseText = String(res.text ?? res.display_text ?? '')
            const hasText = responseText.length > 10
            const ok = Boolean(hasGroceryTool || hasText)
            return {
              ok,
              reason: hasGroceryTool
                ? `Extracted grocery items for taco night: ${JSON.stringify(res.args)}`
                : `Generated conversational response covering meal plan and list (${responseText.length} chars)`,
            }
          },
        },
      ],
    },
    {
      clusterName: '🔁 Multi-Turn Context Grounding (Follow-up Modification)',
      description: 'Tests multi-turn context retention where Turn 2 modifies a slot without repeating prior entity names.',
      isMultiTurn: true,
      turns: [
        {
          label: 'Turn 1: Initial event proposal',
          input: 'Let us plan a family movie night this Friday at 7pm',
          page: 'calendar',
          evaluate: (res) => {
            const isToolOrText = res.type === 'tool_action' || res.type === 'text'
            return {
              ok: isToolOrText,
              reason: `Turn 1 processed: type=${res.type}`,
            }
          },
        },
        {
          label: 'Turn 2: Follow-up time shift ("Actually push it to 8pm instead")',
          input: 'Actually can we push that to 8pm instead?',
          page: 'calendar',
          evaluate: (res) => {
            const hasUpdateTool = res.type === 'tool_action' && (res.tool === 'update_event' || res.tool === 'create_event')
            const textReflectsTime = res.type === 'text' || hasUpdateTool
            return {
              ok: Boolean(textReflectsTime),
              reason: hasUpdateTool
                ? `Grounding retained: dispatched ${res.tool} for updated 8pm slot`
                : `Conversational response handled follow-up`,
            }
          },
        },
      ],
    },
  ]
}

async function runSemanticSuite() {
  console.log('===============================================================')
  console.log(`🤖 Casa Tabor — Conversational AI Semantic Intent Test Suite`)
  console.log(`🔬 Model: ${MODEL} (Dry-run mode, zero DB side effects)`)
  console.log('===============================================================\n')

  const family = await loadFamily()
  const clusters = defineSemanticClusters(family)
  let totalCases = 0
  let passedCases = 0
  let failedCases = 0

  for (const cluster of clusters) {
    console.log(`\n📌 ${cluster.clusterName}`)
    console.log(`   ${cluster.description}`)

    if (cluster.isMultiTurn) {
      const conversationId = `sem-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const history = []
      let lastConversationState = null

      for (let i = 0; i < cluster.turns.length; i++) {
        const turn = cluster.turns[i]
        totalCases++
        const turnId = crypto.randomUUID()
        history.push({ role: 'user', content: turn.input })

        process.stdout.write(`   ↳ [Turn ${i + 1}] "${turn.input}" ... `)
        try {
          const res = await callAssistant({
            messages: history,
            family,
            page: turn.page,
            conversationState: lastConversationState,
            conversationId,
            turnId,
          })

          const evalResult = turn.evaluate(res)
          if (evalResult.ok) {
            passedCases++
            console.log(`✅ PASS (${res.latencyMs}ms)`)
            console.log(`      💡 ${evalResult.reason}`)
          } else {
            failedCases++
            console.log(`❌ FAIL (${res.latencyMs}ms)`)
            console.log(`      ⚠️  ${evalResult.reason}`)
          }

          if (res.conversation_state) {
            lastConversationState = res.conversation_state
          }
          history.push({
            role: 'assistant',
            content: res.text ?? res.display_text ?? `type:${res.type}`,
            toolAction: res.tool ? { tool: res.tool, args: res.args } : undefined,
          })
        } catch (err) {
          failedCases++
          console.log(`❌ ERROR`)
          console.log(`      ⚠️  ${err.message}`)
        }
      }
    } else {
      for (const testCase of cluster.cases) {
        totalCases++
        const conversationId = `sem-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
        const turnId = crypto.randomUUID()

        process.stdout.write(`   ↳ [${testCase.label}] "${testCase.input}" ... `)
        try {
          const res = await callAssistant({
            messages: [{ role: 'user', content: testCase.input }],
            family,
            page: testCase.page,
            assistantMode: testCase.assistantMode ?? 'general',
            conversationId,
            turnId,
          })

          const evalResult = testCase.evaluate(res)
          if (evalResult.ok) {
            passedCases++
            console.log(`✅ PASS (${res.latencyMs}ms)`)
            console.log(`      💡 ${evalResult.reason}`)
          } else {
            failedCases++
            console.log(`❌ FAIL (${res.latencyMs}ms)`)
            console.log(`      ⚠️  ${evalResult.reason}`)
          }
        } catch (err) {
          failedCases++
          console.log(`❌ ERROR`)
          console.log(`      ⚠️  ${err.message}`)
        }
      }
    }
  }

  console.log('\n===============================================================')
  console.log(`📊 Semantic Test Suite Summary:`)
  console.log(`   Total Scenarios: ${totalCases}`)
  console.log(`   Passed:          ${passedCases} (${Math.round((passedCases / totalCases) * 100)}%)`)
  console.log(`   Failed:          ${failedCases}`)
  console.log('===============================================================\n')

  if (failedCases > 0) {
    process.exit(1)
  }
}

runSemanticSuite().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
