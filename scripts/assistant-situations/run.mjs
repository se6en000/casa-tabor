#!/usr/bin/env node
// Plays each conversation situation against the live assistant as the client does
// (whole history, the last conversation state, the open draft), with dry_run: true, so
// nothing is ever saved. Situations are bound to the family's real calendar, read only.
//
//   node scripts/assistant-situations/run.mjs [--set=dev|heldout|fresh] [--seed=7] [--only=id] [--page=wall] [--json=out.json]
//     [--thinking=0,1024]  play every situation once per thinking budget, with the same words, alternating
//                          which goes first (dry runs may override the server's budget); omit for the server's own
//     [--live=live.json]   rewrite this file after every turn (for a page that watches the run)
//
// --set=dev      the phrasings in situations.mjs (one picked per turn by the seed)
// --set=heldout  the phrasings in heldout.mjs (not used while fixing things)
// --set=fresh    new phrasings written by Gemini for this run, from what each turn means
// --set=life     lifelike conversations (life.mjs): small talk, slips, corrections, "that one"
// --set=abilities the rest of layer 2 (abilities.mjs): weather, drive times, contacts, groceries, recipes, the web
import { loadWorld, SUPABASE_URL, ANON_KEY, sql } from './world.mjs'
import { SITUATIONS } from './situations.mjs'
import { HELDOUT } from './heldout.mjs'
import { LIFE } from './life.mjs'
import { ABILITIES } from './abilities.mjs'
import { freshPhrasings, judge } from './llm.mjs'
import fs from 'node:fs'

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback
const SET = arg('set', 'dev')
const PAGE = arg('page', 'wall')
const ONLY = arg('only', null)
const JSON_OUT = arg('json', null)
const LIST = SET === 'life' ? LIFE : SET === 'abilities' ? ABILITIES : SITUATIONS
// "0", "1024", "1024-norules" (thinking budget; -norules skips the server's turn-reading rules),
// "full" (version D: Gemini with the family's data in context and a few broad tools, P3.16), or
// "classic" / "hybrid" (the rules, then the old path or D for what they don't take, P3.17).
const VARIANTS = arg('thinking', null)?.split(',').map((v) => (v === 'full' ? { full: true } : v === 'hybrid' ? { hybrid: true } : v === 'classic' ? { hybrid: false } : { thinking: Number(v.split('-')[0]), rulesOff: v.endsWith('-norules') })) ?? [null]
const labelOf = (v) => (v == null ? 'server' : v.full ? 'full AI' : v.hybrid === true ? 'hybrid' : v.hybrid === false ? 'classic' : `thinking ${v.thinking}${v.rulesOff ? ' · rules off' : ''}`)
const LIVE = arg('live', null)
const SEED = Number(arg('seed', String(Math.floor(Math.random() * 1e6))))
let seed = SEED
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = (list) => list[Math.floor(rand() * list.length)]

const fill = (text, b) => text.replace(/\{(\w+)\}/g, (m, k) => {
  const v = b[k]
  if (v == null) return m
  return typeof v === 'object' && 'name' in v ? v.name : String(v)
})

const words = (s) => new Set(String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['for', 'the', 'and', 'with', 'appointment'].includes(w)))
const sameDraft = (a, b) => a && b && a.tool === b.tool && [...words(a.args.title)].some((w) => words(b.args.title).has(w))

async function ask(messages, family, thinking = null) {
  const state = [...messages].reverse().find((m) => m.role === 'assistant' && m.conversationState)?.conversationState
  const pending = [...messages].reverse().find((m) => m.role === 'assistant' && m.toolAction?.status === 'pending')?.toolAction
  const session = ask.session ??= crypto.randomUUID()
  const t0 = Date.now()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
      context: {
        page: PAGE, assistant_mode: 'general', experience_mode: 'do', currentDate: new Date().toISOString(), utcOffset: '-04:00',
        family, homeCity: 'West Palm Beach', conversationState: state,
        pendingAction: pending ? { tool: pending.tool, args: pending.args } : undefined,
        ...(thinking?.full ? { full_ai: true } : typeof thinking?.hybrid === 'boolean' ? { hybrid: thinking.hybrid } : thinking != null ? { thinking_budget_override: thinking.thinking, ...(thinking.rulesOff ? { turn_rules_off: true } : {}) } : {}),
      },
      session_id: session, correlation_id: `${session}:${messages.length}`, turn_id: String(messages.length),
      lane: 'text', client_build: 'situations', client_trace_source: 'assistant-situations', stream: false, dry_run: true,
    }),
  })
  const b = await res.json().catch(() => ({}))
  return { body: b, ms: Date.now() - t0 }
}

// The family's AI circuit breaker pauses Casa for everyone when an hour's usage runs far
// above normal — and a full run is ~70 model calls. On 2026-09-26 back-to-back runs tripped
// it (676 calls in an hour, cap 600). So a run checks the room first and stops well short.
const HEADROOM = 0.5
async function aiHeadroom() {
  const [breaker] = await sql(`select value from settings where key = 'ai_circuit_breaker'`)
  const b = typeof breaker?.value === 'string' ? JSON.parse(breaker.value) : breaker?.value ?? {}
  // The breaker's own window: the last hour, or since it was last resumed if that's later.
  const since = b.resumed_at && Date.parse(b.resumed_at) > Date.now() - 3600e3 ? new Date(b.resumed_at).toISOString() : new Date(Date.now() - 3600e3).toISOString()
  const [hour] = await sql(`select count(*)::int as calls, coalesce(sum(total_tokens), 0)::bigint as tokens from ai_provider_calls where occurred_at >= '${since}'`)
  // Dollars too (the breaker also caps spend per hour and per day), at Gemini 2.5 Flash list price.
  const usd = `coalesce(sum((coalesce(input_tokens,0) * 0.30 + (coalesce(output_tokens,0) + coalesce(thought_tokens,0)) * 2.50) / 1e6), 0)::float`
  const [spend] = await sql(`select ${usd.replace('sum(', `sum(case when occurred_at >= '${since}' then `).replace('/ 1e6)', '/ 1e6 end)')} as hour_usd, ${usd} as day_usd from ai_provider_calls where occurred_at >= (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York')`)
  return { paused: b.paused === true, calls: hour.calls, tokens: Number(hour.tokens), callCap: b.hourly_call_cap ?? 600, tokenCap: b.hourly_token_cap ?? 1500000, hourUsd: spend.hour_usd, dayUsd: spend.day_usd, hourUsdCap: b.hourly_cost_cap_usd ?? 0.5, dayUsdCap: b.daily_cost_cap_usd ?? 2 }
}
const PER_TURN_CALLS = 4
const room = await aiHeadroom()
const planned = LIST.filter((s) => !ONLY || s.id === ONLY).reduce((n, s) => n + s.turns.length, 0) * PER_TURN_CALLS * VARIANTS.length
if (room.paused) {
  console.error('Casa AI is paused (circuit breaker). Resume it in Settings → System Health first; nothing was run.')
  process.exit(2)
}
// A thinking turn can cost ~2.5x a plain one; a turn is budgeted at $0.008 to stay on the safe side.
const plannedUsd = planned / PER_TURN_CALLS * 0.008
// --spend-watched: a person is watching the breaker and chose to run anyway (it still stops the moment AI pauses).
if (!process.argv.includes('--spend-watched') && (room.hourUsd + plannedUsd > room.hourUsdCap * 0.8 || room.dayUsd + plannedUsd > room.dayUsdCap * 0.8)) {
  console.error(`Not enough AI spend left: $${room.hourUsd.toFixed(2)} this hour (cap $${room.hourUsdCap}), $${room.dayUsd.toFixed(2)} today (cap $${room.dayUsdCap}); this run may cost ~$${plannedUsd.toFixed(2)}. Try later.`)
  process.exit(2)
}
if (!process.argv.includes('--spend-watched') && (room.calls + planned > room.callCap * HEADROOM || room.tokens > room.tokenCap * HEADROOM)) {
  console.error(`Not enough AI headroom this hour: ${room.calls} calls / ${room.tokens} tokens used, this run needs ~${planned} calls; the breaker trips at ${room.callCap} calls / ${room.tokenCap} tokens. Try later.`)
  process.exit(2)
}

const world = await loadWorld()
const family = world.family.map((m) => ({ id: m.id, name: m.name, full_name: m.full_name }))
const results = []
console.log(`Situations · set=${SET} · page=${PAGE} · seed=${SEED} · ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`)

const live = { set: SET, seed: SEED, variants: VARIANTS.map(labelOf), startedAt: new Date().toISOString(), situations: [] }
const writeLive = () => { if (LIVE) fs.writeFileSync(LIVE, JSON.stringify(live, null, 2)) }
let order = 0
for (const situation of LIST.filter((s) => !ONLY || s.id === ONLY)) {
  const bound = situation.bind(world)
  if (!bound) {
    console.log(`\n· ${situation.id}: not playable on this calendar right now (skipped)`)
    results.push({ id: situation.id, skipped: true })
    continue
  }
  // The same words for every variant: picked once per turn.
  const sayings = []
  for (const [i, turn] of situation.turns.entries()) {
    const pool = SET === 'life' || SET === 'abilities' ? turn.say : SET === 'heldout' ? HELDOUT[situation.id]?.[i] ?? [] : SET === 'fresh' ? await freshPhrasings(fill(turn.means ?? '', bound), fill(turn.say[0], bound)).catch(() => []) : turn.say
    sayings.push(fill(pick(pool.length ? pool : turn.say), bound))
  }
  const liveSituation = { id: situation.id, gist: situation.gist, runs: {} }
  live.situations.push(liveSituation)
  // Alternate which variant goes first, so drift over the run lands on both alike.
  const shift = order++ % VARIANTS.length
  const variants = [...VARIANTS.slice(shift), ...VARIANTS.slice(0, shift)]
  for (const variant of variants) {
    const label = labelOf(variant)
    const liveRun = { turns: [], done: false }
    liveSituation.runs[label] = liveRun
    writeLive()
    const played = await play(situation, bound, sayings, variant, label, (t) => { liveRun.turns.push(t); writeLive() })
    liveRun.done = true
    liveRun.pass = played.every((t) => t.pass)
    writeLive()
    results.push({ id: situation.id, variant, pass: played.every((t) => t.pass), turns: played })
  }
}
live.finishedAt = new Date().toISOString()
writeLive()

async function play(situation, bound, sayings, variant, label, onTurn) {
  ask.session = null
  const messages = []
  let lastCard = null
  const turns = []
  console.log(`\n■ ${situation.id} [${label}] — ${situation.gist}`)
  for (const [i, turn] of situation.turns.entries()) {
    const said = sayings[i]
    messages.push({ id: `u${i}`, role: 'user', content: said })
        const { body, ms } = await ask(messages, family, variant)
    if (body.code === 'ai_paused' || /circuit breaker/i.test(String(body.text ?? body.message ?? ''))) {
      console.error('\nCasa AI paused mid-run (circuit breaker) — stopping now.')
      process.exit(2)
    }
    const card = body.type === 'tool_action' ? { tool: body.tool ?? body.tool_name, args: body.args ?? {}, display: body.display_text } : null
    const reply = String(body.text ?? body.content ?? body.message ?? '')
    // As the client does (useAIAssistant): a new card replaces the open one of the same kind
    // and target; "called off" closes it; anything else leaves it waiting for a yes.
    for (const m of messages) {
      if (m.toolAction?.status !== 'pending') continue
      if (body.closes_draft === true) m.toolAction.status = 'cancelled'
      else if (card && card.tool === m.toolAction.tool && (card.args.id ?? card.args.item_id) === (m.toolAction.args.id ?? m.toolAction.args.item_id)) m.toolAction.status = 'cancelled'
    }
    messages.push({ id: `a${i}`, role: 'assistant', content: reply || card?.display || '', conversationState: body.conversation_state, toolAction: card ? { ...card, status: 'pending' } : undefined })

    // Grade the outcome against the turn's expectation (or any of its alternatives).
    const options = turn.expect.either ?? [turn.expect]
    let verdict = null
    for (const want of options) {
      const problems = []
      if (want.card === 'none') {
        if (card) problems.push(`proposed a change (${card.tool}: ${card.display})`)
        if (body.type === 'tool_action_batch') problems.push('proposed a batch of changes')
      } else if (want.card) {
        if (!card) problems.push(`no ${want.card} card (said: "${reply.slice(0, 120)}")`)
        else if (card.tool !== want.card) problems.push(`${card.tool} instead of ${want.card}`)
        else {
          for (const check of want.checks?.(bound) ?? []) {
            const wrong = check(card, { world })
            if (wrong) problems.push(wrong)
          }
          if (want.sameDraft && !sameDraft(lastCard, card)) problems.push(`not the same draft ("${lastCard?.args?.title}" → "${card.args.title}")`)
          // Every add has a real title: a short name, not the request sentence.
          if (card.tool === 'create_event') {
            const title = String(card.args.title ?? '')
            if (!title.trim() || title.split(/\s+/).length > 7 || /\b(please|calendar|add|schedule|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\d{1,2}(:\d{2})?\s*(am|pm)/i.test(title)) problems.push(`title reads like a request: "${title}"`)
          }
        }
      }
      if (!problems.length && want.answer) {
        const graded = await judge({ conversation: messages.slice(0, -1), reply: reply || card?.display || '(nothing)', gist: want.answer, facts: bound.facts ?? {} }).catch((e) => ({ pass: false, why: `judge failed: ${e.message}` }))
        if (!graded.pass) problems.push(`answer: ${graded.why}`)
      }
      verdict = problems.length ? { pass: false, problems } : { pass: true }
      if (verdict.pass) break
    }
    if (card) lastCard = card
    const record = { turnContext: body.turn_context ?? null, said, reply: reply.slice(0, 600), card: card && { tool: card.tool, display: card.display, args: card.args }, ms, correlationId: `${ask.session}:${messages.length - 1}`, ...verdict }
    turns.push(record)
    onTurn(record)
    console.log(`  ${verdict.pass ? '✓' : '✗'} "${said}"  (${ms} ms${ms > 30000 ? ' — SLOW' : ''})`)
    console.log(`      → ${card ? `CARD ${card.display}` : reply.slice(0, 160).replace(/\n/g, ' ')}`)
    if (body.turn_context) console.log(`      ⋯ read as ${body.turn_context.act}${body.turn_context.is_question ? ' (question)' : ''}${body.turn_context.rewritten ? `: "${body.turn_context.standalone}"` : ''} · ${body.turn_context.ms} ms`)
    if (!verdict.pass) console.log(`      ✗ ${verdict.problems.join('; ')}`)
  }
  return turns
}

for (const variant of VARIANTS) {
  const played = results.filter((r) => !r.skipped && r.variant === variant)
  const turnTotal = played.flatMap((r) => r.turns)
  console.log(`\n${labelOf(variant)}: ${played.filter((r) => r.pass).length}/${played.length} situations · ${turnTotal.filter((t) => t.pass).length}/${turnTotal.length} turns · set=${SET} seed=${SEED}`)
}
const played = results.filter((r) => !r.skipped)
const passed = played.filter((r) => r.pass).length
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ set: SET, page: PAGE, seed: SEED, at: new Date().toISOString(), results }, null, 2))
void sql
process.exitCode = passed === played.length ? 0 : 1
