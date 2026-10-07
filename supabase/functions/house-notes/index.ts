// Alexa's house notes, the weekly look back (canvas 60; Jake, Oct 7: "a personality, that evolves over time"). Once a
// week (cron `house-notes`, Sunday 9 PM): the week's conversations against the notes so far — a few new ones, stale
// ones not kept by the family dropped, kept ones never touched (house-persona.mjs). Runs at most once in six days,
// whoever calls; the reader's key may force a run or a dry run.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import { PERSONA_KEY, applyReflection, cleanPersona, reflectPrompt } from '../_shared/house-persona.mjs'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const providerFetch = createTrackedProviderFetch({ functionName: 'house-notes', capability: 'memory', trafficClass: 'background' })
const MODEL = 'gemini-2.5-flash'

async function reflect(sb: ReturnType<typeof createClient>, dryRun: boolean) {
  const now = new Date()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const [{ data: family }, { data: msgs }, { data: row }, { data: llmRow }] = await Promise.all([
    sb.from('family_members').select('name').neq('name', 'Tabor Family').order('sort_order'),
    sb.from('ai_conversation_messages').select('role, content, created_at').gte('created_at', new Date(now.getTime() - 7 * 86400e3).toISOString()).order('created_at').limit(600),
    sb.from('settings').select('value').eq('key', PERSONA_KEY).maybeSingle(),
    sb.from('settings').select('value').eq('key', 'llm_config').single(),
  ])
  const persona = cleanPersona(row?.value)
  const conversations = ((msgs ?? []) as Array<{ role: string; content: string }>).filter((m) => m.role === 'user' || m.role === 'assistant').slice(-300)
  if (!conversations.length) return { persona, quiet: true }
  const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
  if (!llm?.api_key) return { error: 'AI not configured' }
  const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': llm.api_key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: reflectPrompt({ persona, conversations, family: ((family ?? []) as Array<{ name: string }>).map((m) => m.name) }) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4, thinkingConfig: { thinkingBudget: 512 } },
    }),
  }, { callPurpose: 'house-notes', model: MODEL })
  const body = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>; error?: { message?: string } }
  if (!res.ok) return { error: body?.error?.message ?? `HTTP ${res.status}` }
  const next = applyReflection(persona, (body.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join(''), today)
  if (!next) return { error: 'The look back didn’t come out right.' }
  // Read again just before writing: a note kept or forgotten in Settings while the model thought wins.
  if (!dryRun) {
    const { data: latest } = await sb.from('settings').select('value').eq('key', PERSONA_KEY).maybeSingle()
    const now_ = cleanPersona(latest?.value)
    const ids = new Set(persona.notes.map((n) => n.id))
    const added = next.notes.filter((n) => !ids.has(n.id))
    const dropped = new Set(persona.notes.filter((n) => !next.notes.some((m) => m.id === n.id)).map((n) => n.id))
    const merged = { ...now_, notes: [...now_.notes.filter((n) => n.pinned || !dropped.has(n.id)), ...added], updatedAt: today }
    await sb.from('settings').upsert({ key: PERSONA_KEY, value: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    return { persona: merged, added: added.map((n) => n.text), dropped: [...dropped] }
  }
  return { persona: next, read: conversations.length }
}

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; force?: boolean }
  const key = Deno.env.get('EMAIL_READER_KEY')
  const trusted = Boolean(key) && req.headers.get('x-casa-email-reader') === key
  const { data: setting } = await sb.from('settings').select('value').eq('key', 'house_notes').maybeSingle()
  const state = (setting?.value ?? {}) as Record<string, unknown>
  const last = typeof state.last_run === 'string' ? Date.parse(state.last_run) : 0
  const dryRun = trusted && body.dry_run === true
  if (dryRun) return json(await reflect(sb, true))
  if (!(trusted && body.force) && Date.now() - last < 6 * 86400e3) return json({ skipped: 'ran in the last six days' })
  await sb.from('settings').upsert({ key: 'house_notes', value: { ...state, last_run: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  const job = reflect(sb, false).then(async (result) => {
    const { persona: _p, ...summary } = result as Record<string, unknown>
    await sb.from('settings').upsert({ key: 'house_notes', value: { ...state, last_run: new Date().toISOString(), last_result: summary }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  }).catch(() => null)
  // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job)
  else await job
  return json({ started: true }, 202)
})
