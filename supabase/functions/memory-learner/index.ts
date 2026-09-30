// Casa's memory, phase 2 — the nightly learner (design doc https://claude.ai/code/artifact/c1bc97e8-3b45-4c9f-b005-7a06d57d7db6).
// Once a night (cron `memory-learner`, 3:30 AM): the calendar's patterns, the email reader's last week, yesterday's
// conversations, against everything Casa already knows. New facts are written with their evidence; "sure" is decided
// here (decideConfidence) — and in the first week (settings.memory_learner.shadow_until) everything new is "not sure
// yet". Unfinished topics from conversations become open thoughts. It runs at most once every 20 hours, whoever calls.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import { buildLearnerPrompt, calendarPatterns, decideConfidence, isKnown, readLearnerOutput } from '../_shared/memory-learner.mjs'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const providerFetch = createTrackedProviderFetch({ functionName: 'memory-learner', capability: 'memory', trafficClass: 'background' })
const MODEL = 'gemini-2.5-flash'

async function learn(sb: ReturnType<typeof createClient>, state: Record<string, unknown>, dryRun: boolean) {
  const now = new Date()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const shadow = typeof state.shadow_until === 'string' && today < state.shadow_until
  const [{ data: family }, { data: evRows }, { data: mail }, { data: msgs }, { data: memory }, { data: llmRow }, { data: projects }, { data: todos }] = await Promise.all([
    sb.from('family_members').select('id, name').neq('name', 'Tabor Family').order('sort_order'),
    sb.from('events').select('title, start_time, location_name, event_members(family_members(name))').is('deleted_at', null)
      .gte('start_time', new Date(now.getTime() - 60 * 86400e3).toISOString()).lt('start_time', new Date(now.getTime() + 30 * 86400e3).toISOString()).limit(1500),
    sb.from('email_offers').select('from_email, subject, gist, received_at').gte('received_at', new Date(now.getTime() - 7 * 86400e3).toISOString()).neq('decision', 'skipped').order('received_at', { ascending: false }).limit(80),
    sb.from('ai_conversation_messages').select('conversation_id, role, content, created_at').gte('created_at', new Date(now.getTime() - 26 * 3600e3).toISOString()).order('created_at').limit(400),
    sb.from('casa_memory').select('id, kind, about_label, about_member_id, text, confidence, status, evidence').order('created_at').limit(500),
    sb.from('settings').select('value').eq('key', 'llm_config').single(),
    sb.from('todo_projects').select('title').eq('status', 'active').limit(80),
    sb.from('events').select('title').eq('event_type', 'reminder').is('deleted_at', null).neq('status', 'cancelled').gte('updated_at', new Date(now.getTime() - 60 * 86400e3).toISOString()).limit(120),
  ])
  const lists = [...((projects ?? []) as Array<{ title: string }>).map((p) => `Project: ${p.title}`), ...((todos ?? []) as Array<{ title: string }>).map((t) => `To-do: ${t.title}`)]
  const people = (family ?? []) as Array<{ id: string; name: string }>
  const events = ((evRows ?? []) as Array<{ title: string; start_time: string; location_name: string | null; event_members: Array<{ family_members: { name: string } | null }> }>)
    .filter((e) => !/smoke test|\[test\]/i.test(e.title))
    .map((e) => ({ title: e.title, start_time: e.start_time, place: e.location_name, people: (e.event_members ?? []).map((m) => m.family_members?.name).filter(Boolean) as string[] }))
  const patterns = calendarPatterns(events).slice(0, 60)
  const emails = ((mail ?? []) as Array<{ from_email: string | null; subject: string | null; gist: string | null; received_at: string | null }>)
    .map((m) => ({ from: String(m.from_email ?? '').replace(/\s*<.*>/, '').replace(/"/g, ''), subject: m.subject ?? '', gist: m.gist, received: m.received_at }))
  const byConv = new Map<string, Array<{ role: string; content: string }>>()
  for (const m of (msgs ?? []) as Array<{ conversation_id: string; role: string; content: string }>) byConv.set(m.conversation_id, [...(byConv.get(m.conversation_id) ?? []), { role: m.role, content: m.content }])
  const conversations = [...byConv.values()].filter((c) => c.length >= 2).slice(-25)
  const rows = (memory ?? []) as Array<{ id: string; kind: string; about_label: string; about_member_id: string | null; text: string; confidence: string; status: string; evidence: unknown }>

  const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
  if (!llm?.api_key) return { error: 'AI not configured' }
  const prompt = buildLearnerPrompt({ patterns, emails, conversations, memory: rows.filter((r) => r.kind === 'fact' || r.status === 'active'), family: people, today, lists })
  const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': llm.api_key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
  }, { callPurpose: 'memory-learner', model: MODEL })
  const body = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } }
  if (!res.ok) return { error: body?.error?.message ?? `HTTP ${res.status}` }
  const out = readLearnerOutput(JSON.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || '{}'))

  const added: string[] = []
  const confirmed: string[] = []
  const thoughts: string[] = []
  for (const f of out.facts) {
    if (isKnown(f, rows)) continue
    const member = people.find((m) => m.name.toLowerCase() === f.about.toLowerCase())
    const row = { kind: 'fact', about_label: member?.name ?? f.about, about_member_id: member?.id ?? null, text: f.text, words: f.words, confidence: decideConfidence(f, { shadow }), status: 'active', source: 'learned', evidence: f.evidence, sensitive: f.sensitive }
    if (!dryRun) await sb.from('casa_memory').insert(row)
    added.push(`${row.about_label}: ${row.text} (${row.confidence})`)
  }
  for (const c of out.confirms) {
    const r = rows.find((x) => x.id === c.id && x.status === 'active' && x.confidence !== 'sure')
    if (!r) continue
    const before = Array.isArray(r.evidence) ? r.evidence as Array<{ what: string }> : []
    const kinds = new Set([...c.kinds, ...(before.length ? ['calendar'] : [])])
    const confidence = decideConfidence({ kinds: [...kinds], count: 0, weeks: 0 }, { shadow })
    if (!dryRun) await sb.from('casa_memory').update({ evidence: [...before, ...c.evidence].slice(-6), confidence, updated_at: new Date().toISOString() }).eq('id', r.id)
    confirmed.push(`${r.about_label}: ${r.text} (${confidence})`)
  }
  for (const t of out.thoughts) {
    if (isKnown(t, rows)) continue
    const member = people.find((m) => m.name.toLowerCase() === t.about.toLowerCase())
    if (!dryRun) await sb.from('casa_memory').insert({ kind: 'thought', about_label: member?.name ?? t.about, about_member_id: member?.id ?? null, text: t.text, confidence: 'not_sure', status: 'active', source: 'learned', evidence: [{ what: 'left open in a conversation', when: t.when ?? today }] })
    thoughts.push(`${t.about}: ${t.text}`)
  }
  return { shadow, read: { patterns: patterns.length, emails: emails.length, conversations: conversations.length }, added, confirmed, thoughts }
}

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; force?: boolean }
  // Casa's own scripts may force a run or a dry run (the reader's key); anyone else gets at most one a night.
  const key = Deno.env.get('EMAIL_READER_KEY')
  const trusted = Boolean(key) && req.headers.get('x-casa-email-reader') === key
  const { data: setting } = await sb.from('settings').select('value').eq('key', 'memory_learner').maybeSingle()
  const state = (setting?.value ?? {}) as Record<string, unknown>
  const last = typeof state.last_run === 'string' ? Date.parse(state.last_run) : 0
  const dryRun = trusted && body.dry_run === true
  if (!dryRun && !(trusted && body.force) && Date.now() - last < 20 * 3600e3) return json({ skipped: 'ran in the last 20 hours' })
  if (dryRun) return json(await learn(sb, state, true))
  await sb.from('settings').upsert({ key: 'memory_learner', value: { ...state, last_run: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  const job = learn(sb, state, false).then(async (result) => {
    await sb.from('settings').upsert({ key: 'memory_learner', value: { ...state, last_run: new Date().toISOString(), last_result: result }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  }).catch(() => null)
  // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job)
  else await job
  return json({ started: true }, 202)
})
