#!/usr/bin/env node
// Plays each conversation situation against the live assistant as the client does
// (whole history, the last conversation state, the open draft), with dry_run: true, so
// nothing is ever saved. Situations are bound to the family's real calendar, read only.
//
//   node scripts/assistant-situations/run.mjs [--set=dev|heldout|fresh] [--seed=7] [--only=id] [--page=wall] [--json=out.json]
//
// --set=dev      the phrasings in situations.mjs (one picked per turn by the seed)
// --set=heldout  the phrasings in heldout.mjs (not used while fixing things)
// --set=fresh    new phrasings written by Gemini for this run, from what each turn means
import { loadWorld, SUPABASE_URL, ANON_KEY, sql } from './world.mjs'
import { SITUATIONS } from './situations.mjs'
import { HELDOUT } from './heldout.mjs'
import { freshPhrasings, judge } from './llm.mjs'
import fs from 'node:fs'

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback
const SET = arg('set', 'dev')
const PAGE = arg('page', 'wall')
const ONLY = arg('only', null)
const JSON_OUT = arg('json', null)
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

async function ask(messages, family) {
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
  const [hour] = await sql(`select count(*)::int as calls, coalesce(sum(total_tokens), 0)::bigint as tokens from ai_provider_calls where occurred_at > now() - interval '1 hour'`)
  return { paused: b.paused === true, calls: hour.calls, tokens: Number(hour.tokens), callCap: b.hourly_call_cap ?? 600, tokenCap: b.hourly_token_cap ?? 1500000 }
}
const PER_TURN_CALLS = 4
const room = await aiHeadroom()
const planned = SITUATIONS.filter((s) => !ONLY || s.id === ONLY).reduce((n, s) => n + s.turns.length, 0) * PER_TURN_CALLS
if (room.paused) {
  console.error('Casa AI is paused (circuit breaker). Resume it in Settings → System Health first; nothing was run.')
  process.exit(2)
}
if (room.calls + planned > room.callCap * HEADROOM || room.tokens > room.tokenCap * HEADROOM) {
  console.error(`Not enough AI headroom this hour: ${room.calls} calls / ${room.tokens} tokens used, this run needs ~${planned} calls; the breaker trips at ${room.callCap} calls / ${room.tokenCap} tokens. Try later.`)
  process.exit(2)
}

const world = await loadWorld()
const family = world.family.map((m) => ({ id: m.id, name: m.name, full_name: m.full_name }))
const results = []
console.log(`Situations · set=${SET} · page=${PAGE} · seed=${SEED} · ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`)

for (const situation of SITUATIONS.filter((s) => !ONLY || s.id === ONLY)) {
  const bound = situation.bind(world)
  if (!bound) {
    console.log(`\n· ${situation.id}: not playable on this calendar right now (skipped)`)
    results.push({ id: situation.id, skipped: true })
    continue
  }
  ask.session = null
  const messages = []
  let lastCard = null
  const turns = []
  console.log(`\n■ ${situation.id} — ${situation.gist}`)
  for (const [i, turn] of situation.turns.entries()) {
    const pool = SET === 'heldout' ? HELDOUT[situation.id]?.[i] ?? [] : SET === 'fresh' ? await freshPhrasings(fill(turn.means, bound), fill(turn.say[0], bound)).catch(() => []) : turn.say
    const said = fill(pick(pool.length ? pool : turn.say), bound)
    messages.push({ id: `u${i}`, role: 'user', content: said })
    const { body, ms } = await ask(messages, family)
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
    turns.push({ turnContext: body.turn_context ?? null, said, reply: reply.slice(0, 300), card: card && { tool: card.tool, display: card.display, args: card.args }, ms, ...verdict })
    console.log(`  ${verdict.pass ? '✓' : '✗'} "${said}"  (${ms} ms${ms > 30000 ? ' — SLOW' : ''})`)
    console.log(`      → ${card ? `CARD ${card.display}` : reply.slice(0, 160).replace(/\n/g, ' ')}`)
    if (body.turn_context) console.log(`      ⋯ read as ${body.turn_context.act}${body.turn_context.is_question ? ' (question)' : ''}${body.turn_context.rewritten ? `: "${body.turn_context.standalone}"` : ''} · ${body.turn_context.ms} ms`)
    if (!verdict.pass) console.log(`      ✗ ${verdict.problems.join('; ')}`)
  }
  const pass = turns.every((t) => t.pass)
  results.push({ id: situation.id, pass, turns })
}

const played = results.filter((r) => !r.skipped)
const passed = played.filter((r) => r.pass).length
const turnTotal = played.flatMap((r) => r.turns)
console.log(`\n${passed}/${played.length} situations · ${turnTotal.filter((t) => t.pass).length}/${turnTotal.length} turns · set=${SET} seed=${SEED}`)
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ set: SET, page: PAGE, seed: SEED, at: new Date().toISOString(), results }, null, 2))
void sql
process.exitCode = passed === played.length ? 0 : 1
