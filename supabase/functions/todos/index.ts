// todos — Jake's Reminders to-dos, organised (FAMILY_WALL_PLAN.md P3.22, design section 09).
// Body { action }:
//   'list'                         → buildTodoList: Next up, folded groups, projects
//   'done'   with { id }           → the reminder is done (status 'cancelled', as the app always
//                                    marks a finished to-do); the Casa-origin trigger on
//                                    event_ios_reminder_links sends it to his iOS list
//   'snooze' with { id, days }     → "Not now": out of Next up until then (1–30 days)
//   'edit'   with { id, patch }    → his own shape / minutes / cost / next step / needs; the sorter
//                                    leaves anything he's changed alone
//   'sort'                         → Casa sorts unsorted to-dos (step 2); 'list' also starts it in the
//                                    background whenever something is unsorted
//   'accept' with { id }           → apply Casa's suggestion: merge (close this repeat), done (close
//                                    it), shopping (add to the grocery list, close the to-do)
//   'dismiss' with { id }          → keep it as it is; the suggestion goes away
//   'project' with { id }          → a project with all its steps (the project screen)
//   'project_edit' with { id, op, args } → todo_project_edit (rename, target date, steps: add / edit /
//                                    move / delete / done / undo, delete the project)
//   'update' with { id, patch }    → a to-do's title and date/time (todo_update); 'delete' → todo_delete
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildTodoList } from '../_shared/todos.mjs'
import { buildSortPrompt, parseSortResult } from '../_shared/todo-sort.mjs'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { PRIMARY_GEMINI_MODEL, resolveProductionGeminiModel } from '../_shared/llm-model-policy.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const TZ = 'America/New_York'
const todayLocal = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
const plusDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400e3).toISOString().slice(0, 10)
const SHAPES = new Set(['nudge', 'quick', 'fix', 'project', 'dated', 'unsorted'])
const SORT_BATCH = 25
const providerFetch = createTrackedProviderFetch({ functionName: 'todos', capability: 'todo-sort', trafficClass: 'background' })
type Sb = ReturnType<typeof createClient>

/** Casa sorts what's unsorted (never what Jake has changed himself), a batch at a time. */
async function sortUnsorted(sb: Sb, today: string, redo = false): Promise<{ sorted: number; error?: string }> {
  const [remRes, detRes, cfgRes] = await Promise.all([
    sb.from('events').select('id, title, has_due_date, start_time').eq('event_type', 'reminder').eq('record_kind', 'single')
      .is('deleted_at', null).neq('status', 'cancelled').order('created_at').limit(500),
    sb.from('todo_details').select('event_id, sorted_by'),
    sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
  ])
  if (remRes.error || detRes.error) return { sorted: 0, error: (remRes.error ?? detRes.error)!.message }
  // `redo`: sort again what Casa sorted before (after the rules improve) — never what Jake changed.
  const sortedAlready = new Set((detRes.data ?? []).filter((d) => (redo ? d.sorted_by === 'jake' : d.sorted_by)).map((d) => d.event_id))
  const localDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const open = (remRes.data ?? []).map((r) => ({ id: r.id, title: r.title, due: r.has_due_date ? localDay(r.start_time) : null }))
  const todo = open.filter((r) => !sortedAlready.has(r.id)).slice(0, SORT_BATCH)
  if (todo.length === 0) return { sorted: 0 }
  const config = resolveBackgroundLlmConfig(cfgRes.data?.value) as { provider: string; model: string; api_key: string }
  if (config.provider !== 'gemini' || !config.api_key) return { sorted: 0, error: 'background model is not Gemini' }
  // Sorting is judgment, and small (a few items a day): the assistant's model, not the bulk tier —
  // flash-lite called jobs "done" because their dates had passed (2026-09-28).
  const model = resolveProductionGeminiModel((cfgRes.data?.value as { model?: string } | null)?.model, PRIMARY_GEMINI_MODEL)
  // The whole open list goes in, so repeats of already-sorted items are noticed too.
  const others = open.filter((r) => sortedAlready.has(r.id)).slice(0, 60)
  const prompt = buildSortPrompt([...todo, ...others], { today }) + `\n\nOnly answer for these ids: ${todo.map((t) => t.id).join(', ')}.`
  const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.api_key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.2, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) return { sorted: 0, error: `model: ${res.status}` }
  const text = ((data.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
  const result = parseSortResult(text, [...todo, ...others], { today })
  const now = new Date().toISOString()
  const rows = todo.filter((t) => result[t.id]).map((t) => ({ event_id: t.id, ...result[t.id], sorted_by: 'ai', sorted_at: now, updated_at: now }))
  if (rows.length) {
    const { error } = await sb.from('todo_details').upsert(rows, { onConflict: 'event_id' })
    if (error) return { sorted: 0, error: error.message }
  }
  return { sorted: rows.length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const body = await req.json().catch(() => ({})) as { action?: string; id?: string; days?: number; patch?: Record<string, unknown> }
    const action = body.action ?? 'list'
    const now = new Date()
    const today = todayLocal(now)
    const id = String(body.id ?? '').slice(0, 64)

    if (action === 'done') {
      if (!id) return json({ error: 'id required' }, 400)
      const { error } = await sb.from('events').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('id', id).eq('event_type', 'reminder')
      if (error) throw new Error(error.message)
      await sb.from('todo_steps').update({ done_at: now.toISOString(), updated_at: now.toISOString() }).eq('reminder_event_id', id).is('done_at', null)
      return json({ ok: true })
    }

    if (action === 'snooze') {
      if (!id) return json({ error: 'id required' }, 400)
      const days = Math.min(30, Math.max(1, Math.round(Number(body.days) || 1)))
      const { data: current } = await sb.from('todo_details').select('snooze_count').eq('event_id', id).maybeSingle()
      const { error } = await sb.from('todo_details').upsert({
        event_id: id, snoozed_until: plusDays(today, days), snooze_count: (current?.snooze_count ?? 0) + 1, updated_at: now.toISOString(),
      }, { onConflict: 'event_id' })
      if (error) throw new Error(error.message)
      return json({ ok: true, until: plusDays(today, days) })
    }

    if (action === 'edit') {
      if (!id) return json({ error: 'id required' }, 400)
      const p = body.patch ?? {}
      const patch: Record<string, unknown> = { event_id: id, sorted_by: 'jake', sorted_at: now.toISOString(), updated_at: now.toISOString() }
      if (typeof p.shape === 'string' && SHAPES.has(p.shape)) patch.shape = p.shape
      if (p.minutes === null || (Number.isFinite(Number(p.minutes)) && Number(p.minutes) > 0)) patch.minutes = p.minutes === null ? null : Math.round(Number(p.minutes))
      if (p.cost_cents === null || (Number.isFinite(Number(p.cost_cents)) && Number(p.cost_cents) >= 0)) patch.cost_cents = p.cost_cents === null ? null : Math.round(Number(p.cost_cents))
      if (typeof p.next_step === 'string' || p.next_step === null) patch.next_step = p.next_step ? String(p.next_step).slice(0, 200) : null
      if (Array.isArray(p.needs)) patch.needs = p.needs.map((n) => String(n).slice(0, 30)).slice(0, 6)
      const { error } = await sb.from('todo_details').upsert(patch, { onConflict: 'event_id' })
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    if (action === 'sort') return json(await sortUnsorted(sb, today, (body as { redo?: boolean }).redo === true))

    // Editing by touch (step 5; Jake 2026-09-28: "tap into the projects and the reminders … to edit").
    const b = body as { op?: string; args?: Record<string, unknown>; patch?: Record<string, unknown> }
    if (action === 'project') {
      if (!id) return json({ error: 'id required' }, 400)
      const [projRes, stepsRes] = await Promise.all([
        sb.from('todo_projects').select('id, title, aim_date, status, created_at').eq('id', id).maybeSingle(),
        sb.from('todo_steps').select('id, position, title, minutes, cost_cents, done_at, reminder_event_id').eq('project_id', id).order('position'),
      ])
      if (projRes.error || stepsRes.error) throw new Error((projRes.error ?? stepsRes.error)!.message)
      if (!projRes.data) return json({ error: 'That project is gone' }, 404)
      return json({ project: projRes.data, steps: stepsRes.data ?? [] })
    }
    if (action === 'project_edit') {
      if (!id || !b.op) return json({ error: 'id and op required' }, 400)
      const { error } = await sb.rpc('todo_project_edit', { p_project: id, p_op: b.op, p_args: b.args ?? {} })
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }
    if (action === 'update') {
      if (!id) return json({ error: 'id required' }, 400)
      const { error } = await sb.rpc('todo_update', { p_id: id, p_patch: b.patch ?? {} })
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }
    if (action === 'delete') {
      if (!id) return json({ error: 'id required' }, 400)
      const { error } = await sb.rpc('todo_delete', { p_id: id })
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    if (action === 'accept' || action === 'dismiss') {
      if (!id) return json({ error: 'id required' }, 400)
      const { data: det } = await sb.from('todo_details').select('suggestion').eq('event_id', id).maybeSingle()
      const suggestion = det?.suggestion as { kind?: string } | null
      if (!suggestion) return json({ error: 'nothing suggested' }, 404)
      if (action === 'accept') {
        if (suggestion.kind === 'shopping') {
          const { data: ev } = await sb.from('events').select('title').eq('id', id).maybeSingle()
          const name = String(ev?.title ?? '').trim()
          if (name) {
            // Back on the list if it's there (checked off or removed); otherwise a new line.
            const { data: existing } = await sb.from('grocery_items').select('id').ilike('name', name).limit(1).maybeSingle()
            const write = existing
              ? await sb.from('grocery_items').update({ checked: false, deleted_at: null, last_modified_source: 'casa', updated_at: now.toISOString() }).eq('id', existing.id)
              : await sb.from('grocery_items').insert({ name, last_modified_source: 'casa' })
            if (write.error) throw new Error(write.error.message)
          }
        }
        const { error } = await sb.from('events').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('id', id).eq('event_type', 'reminder')
        if (error) throw new Error(error.message)
      }
      const { error } = await sb.from('todo_details').update({ suggestion: null, updated_at: now.toISOString() }).eq('event_id', id)
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    // list
    const [remindersRes, detailsRes, projectsRes, stepsRes, prepRes] = await Promise.all([
      sb.from('events').select('id, title, status, has_due_date, start_time, created_at, deleted_at')
        .eq('event_type', 'reminder').eq('record_kind', 'single').is('deleted_at', null).neq('status', 'cancelled')
        .order('created_at').limit(500),
      sb.from('todo_details').select('event_id, shape, minutes, cost_cents, next_step, needs, snoozed_until, snooze_count, project_id, sorted_by, suggestion'),
      sb.from('todo_projects').select('id, title, status, aim_date').eq('status', 'active'),
      sb.from('todo_steps').select('project_id, position, title, done_at, reminder_event_id'),
      // Morning-prep reminders are the old prep system's, not his list.
      sb.from('event_enrichments').select('event_id').eq('category', 'morning_prep'),
    ])
    for (const r of [remindersRes, detailsRes, projectsRes, stepsRes, prepRes]) if (r.error) throw new Error(r.error.message)
    const prep = new Set((prepRes.data ?? []).map((r) => r.event_id))
    const details = Object.fromEntries((detailsRes.data ?? []).map((d) => [d.event_id, d]))
    const list = buildTodoList({
      reminders: (remindersRes.data ?? []).filter((r) => !prep.has(r.id)),
      details,
      projects: projectsRes.data ?? [],
      steps: stepsRes.data ?? [],
      today,
    })
    // Anything unsorted gets sorted in the background; the next refresh shows it.
    const unsorted = (remindersRes.data ?? []).some((r) => !prep.has(r.id) && !details[r.id]?.sorted_by)
    if (unsorted) {
      const job = sortUnsorted(sb, today).catch(() => null)
      // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job)
    }
    return json({ ...list, sorting: unsorted })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
