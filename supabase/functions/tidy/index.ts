// Alexa tidies up (canvas 75; Jake, Oct 8: "have alexa review the day and maybe a few days forward … merged or cleaned
// up with a suggested resolution" → the wall's "I have something for you"). POST
//   { action: 'review', force?, dry_run? }  — each morning (cron tidy-review): today and the next few days, by rule and by
//                                             the AI (_shared/tidy.mjs); yesterday's unanswered ones expire
//   { action: 'list' }                       — what's open today (one whose rows have changed since is dropped)
//   { action: 'answer', id, choice }         — a choice's ops written (what they changed kept for Undo), Google told
//   { action: 'undo', id }                   — every row back
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { TALK_PLAN_GEMINI_MODEL } from '../_shared/llm-model-policy.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import { applyOps, findTidy, parseTidyAi, tidyPrompt, undoOps } from '../_shared/tidy.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const providerFetch = createTrackedProviderFetch({ functionName: 'tidy', capability: 'briefing', trafficClass: 'background' })
const ymdNY = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const EVENT_COLS = 'id, title, event_type, all_day, has_due_date, status, deleted_at, purge_after, description, start_time, end_time, created_at, google_event_id'
type Row = Record<string, any>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const body = await req.json().catch(() => ({})) as { action?: string; force?: boolean; dry_run?: boolean; id?: string; choice?: string }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const today = ymdNY()

  // Write patches (events and steps), stamped.
  const write = async (patches: Array<{ table: string; id: string; patch: Row }>) => {
    for (const p of patches) {
      const { error } = await sb.from(p.table).update({ ...p.patch, updated_at: new Date().toISOString() }).eq('id', p.id)
      if (error) throw new Error(error.message)
    }
  }
  // Google, after: a removed one deleted there; a changed one pushed; one put back made again.
  const tellGoogle = (removed: string[], changed: string[], restored: string[]) => {
    const job = Promise.all([
      ...removed.map((id) => sb.functions.invoke('delete-google-event', { body: { event_id: id } }).catch(() => null)),
      ...changed.map((id) => sb.functions.invoke('push-to-google', { body: { event_id: id } }).catch(() => null)),
      ...restored.map((id) => sb.functions.invoke('create-google-event', { body: { event_id: id } }).catch(() => null)),
    ])
    // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job)
  }

  try {
    if (body.action === 'list') {
      const { data: open } = await sb.from('tidy_suggestions').select('id, kind, items, says, fix, choices, why, made_on').eq('status', 'open').gte('made_on', addDays(today, -1)).order('created_at')
      const ids = [...new Set((open ?? []).flatMap((s: Row) => s.items as string[]))]
      const { data: rows } = ids.length ? await sb.from('events').select('id, deleted_at, status').in('id', ids) : { data: [] }
      const alive = new Set((rows ?? []).filter((r: Row) => !r.deleted_at && r.status !== 'cancelled').map((r: Row) => r.id))
      // One whose rows have gone since (done by hand, deleted) is no longer for them.
      const gone = (open ?? []).filter((s: Row) => (s.items as string[]).some((id) => !alive.has(id)))
      if (gone.length) await sb.from('tidy_suggestions').update({ status: 'expired' }).in('id', gone.map((s: Row) => s.id))
      return json({ suggestions: (open ?? []).filter((s: Row) => !gone.includes(s)), today })
    }

    if (body.action === 'answer' || body.action === 'undo') {
      const { data: s } = await sb.from('tidy_suggestions').select('*').eq('id', String(body.id ?? '')).maybeSingle()
      if (!s) return json({ error: 'not found' }, 404)
      if (body.action === 'undo') {
        if (s.status !== 'done' || !s.before) return json({ error: 'nothing to undo' }, 409)
        const before = s.before as { rows: Array<{ table: string; id: string; row: Row }>; google: string[] }
        await write(undoOps(before.rows, { events: {}, steps: {} }))
        // Back as it was, and still hers to ask about.
        await sb.from('tidy_suggestions').update({ status: 'open', chosen: null, before: null, answered_at: null }).eq('id', s.id)
        const removed = before.rows.filter((b) => b.table === 'events' && b.row.deleted_at === null).map((b) => b.id)
        tellGoogle([], [], removed.filter((id) => before.google.includes(id)))
        return json({ ok: true })
      }
      // Undone, it's open again (the band's Undo, then a second answer).
      if (s.status !== 'open' && s.status !== 'undone') return json({ error: 'already answered' }, 409)
      const choice = (s.choices as Array<{ key: string; label: string; ops: Row[] }>).find((c) => c.key === body.choice)
      if (!choice) return json({ error: 'which?' }, 400)
      if (!choice.ops.length) {
        await sb.from('tidy_suggestions').update({ status: 'kept', chosen: choice.key, answered_at: new Date().toISOString() }).eq('id', s.id)
        return json({ ok: true, kept: true })
      }
      const eventIds = [...new Set(choice.ops.filter((o) => o.id).map((o) => String(o.id)))]
      const stepIds = choice.ops.filter((o) => o.step_id).map((o) => String(o.step_id))
      const [{ data: evs }, { data: sts }] = await Promise.all([
        sb.from('events').select(EVENT_COLS).in('id', eventIds),
        sb.from('todo_steps').select('id, reminder_event_id, cal_start, done_at').or([stepIds.length ? `id.in.(${stepIds.join(',')})` : null, `reminder_event_id.in.(${eventIds.join(',')})`].filter(Boolean).join(',')),
      ])
      const state = { events: Object.fromEntries((evs ?? []).map((e: Row) => [e.id, { ...e }])), steps: Object.fromEntries((sts ?? []).map((t: Row) => [t.id, { ...t }])), now: new Date().toISOString() }
      if (eventIds.some((id) => !state.events[id] || state.events[id].deleted_at)) {
        await sb.from('tidy_suggestions').update({ status: 'expired' }).eq('id', s.id)
        return json({ error: 'It changed since — nothing done.' }, 409)
      }
      const google = eventIds.filter((id) => state.events[id].google_event_id)
      const { before, patches } = applyOps(choice.ops, state)
      await write(patches)
      await sb.from('tidy_suggestions').update({ status: 'done', chosen: choice.key, before: { rows: before, google }, answered_at: new Date().toISOString() }).eq('id', s.id)
      const removed = choice.ops.filter((o) => o.op === 'remove').map((o) => String(o.id))
      const changed = choice.ops.filter((o) => ['retime', 'notes', 'done'].includes(o.op)).map((o) => String(o.id))
      tellGoogle(removed.filter((id) => google.includes(id)), changed.filter((id) => google.includes(id)), [])
      return json({ ok: true })
    }

    if (body.action !== 'review') return json({ error: 'Unknown action' }, 400)
    if (!body.force && !body.dry_run) {
      const { count } = await sb.from('tidy_suggestions').select('id', { count: 'exact', head: true }).eq('made_on', today)
      if (count) return json({ ok: true, skipped: 'reviewed today' })
    }
    const [{ data: evs }, { data: steps }, { data: projects }, { data: details }, { data: answered }, { data: llmRow }] = await Promise.all([
      sb.from('events').select(EVENT_COLS).is('deleted_at', null).neq('status', 'cancelled').eq('record_kind', 'single')
        .gte('start_time', `${addDays(today, -40)}T00:00:00Z`).lte('start_time', `${addDays(today, 5)}T00:00:00Z`).limit(2000),
      sb.from('todo_steps').select('id, project_id, title, reminder_event_id, cal_event_id, cal_start, done_at'),
      sb.from('todo_projects').select('id, title').in('status', ['active', 'paused']),
      sb.from('todo_details').select('event_id, snoozed_until'),
      sb.from('tidy_suggestions').select('pair_key, status').in('status', ['kept', 'done', 'undone', 'open']),
      sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
    ])
    const kept = (answered ?? []).map((a: Row) => a.pair_key)
    const detailMap = Object.fromEntries((details ?? []).map((d: Row) => [d.event_id, d]))
    const ruled = findTidy({ events: evs ?? [], steps: steps ?? [], projects: projects ?? [], details: detailMap, today, kept })
    // The same thing in other words: the AI's to see, with the rules' finds already taken.
    let judged: Row[] = []
    const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
    if (llm?.api_key) {
      const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${TALK_PLAN_GEMINI_MODEL}:generateContent?key=${llm.api_key}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: tidyPrompt(evs ?? [], { today, steps: steps ?? [], projects: projects ?? [] }) }] }],
          generationConfig: { maxOutputTokens: 1500, temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      const text = ((res?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
      const taken = new Set<string>(ruled.flatMap((s: Row) => s.items))
      judged = parseTidyAi(text, { events: evs ?? [], steps: steps ?? [], projects: projects ?? [], today, taken }).filter((s: Row) => !kept.includes(s.pair_key))
    }
    const found = [...ruled, ...judged]
    if (body.dry_run) return json({ suggestions: found, today })
    await sb.from('tidy_suggestions').update({ status: 'expired' }).eq('status', 'open').lt('made_on', today)
    if (found.length) {
      const { error } = await sb.from('tidy_suggestions').insert(found.map((s: Row) => ({
        made_on: today, kind: s.kind, pair_key: s.pair_key, items: s.items, says: s.says, fix: s.fix, choices: s.choices, why: s.why ?? null,
      })))
      if (error) throw new Error(error.message)
    }
    return json({ ok: true, found: found.length })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
