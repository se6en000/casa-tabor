// coming-up — the "coming up" digest (FAMILY_WALL_PLAN.md P3.19 step 3).
// Body { action }:
//   'list'                     → { items } for the wall and phone (gift ideas included — Jake,
//                                2026-09-27: "I'd still like it all to show up on the wall as well as phone")
//   'done' | 'dismiss' | 'snooze' with { key } (snooze: a week) → marks the item
//   'send_digest'              → Sunday evening push: what's coming up (cron coming-up-sunday-digest)
//   'send_pokes'               → morning push for items whose plan-by day is today, once each (cron coming-up-daily-pokes)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { memberNamed } from '../_shared/family-names.mjs'
import { aheadMarks, buildComingUp, fewerLikeMatch, handledFromState, SEASONS } from '../_shared/coming-up.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const TZ = 'America/New_York'
const todayLocal = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
const plusDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400e3).toISOString().slice(0, 10)
// A season's project on Coming up: how far along, and what's Now (P3.23).
const progressOf = (steps: Array<{ project_id: string; title: string; grp: number; position: number; done_at: string | null; child_project_id: string | null }>) => {
  const out: Record<string, { done: number; total: number; now: string | null }> = {}
  for (const st of [...steps].sort((a, b) => a.grp - b.grp || a.position - b.position)) {
    const p = (out[st.project_id] ??= { done: 0, total: 0, now: null })
    p.total += 1
    if (st.done_at) p.done += 1
    else if (!p.now && !st.child_project_id) p.now = st.title
  }
  return out
}
const niceDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

type Item = { key: string; kind: string; title: string; date: string; daysAway: number; nextStep: string; pokeOn: string; late: boolean; ideas?: string[]; projectId?: string; startable?: boolean }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const body = await req.json().catch(() => ({})) as { action?: string; key?: string }
    const action = body.action ?? 'list'
    const now = new Date()
    const today = todayLocal(now)

    // What gets used, for the month check (P3.22 step 8).
    if (action !== 'list' && action !== 'send_digest' && action !== 'send_pokes') {
      const log = sb.from('ai_drawer_debug_events').insert({ event: 'coming_up_use', channel: 'server', page: String((body as { surface?: string }).surface ?? 'unknown').slice(0, 16), detail: `${action}:${String(body.key ?? '').split(':')[0]}` }).then(() => null, () => null)
      // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(log)
    }

    // A gift idea corrected by hand, or removed (Jake, 2026-09-29: voice mishears brand names, and a
    // wrong one means "I will forget what I was talking about").
    if (action === 'idea_edit' || action === 'idea_remove') {
      const id = String((body as { id?: string }).id ?? '').slice(0, 64)
      const text = String((body as { idea?: string }).idea ?? '').trim().replace(/\s+/g, ' ').slice(0, 1000)
      if (!id) return json({ error: 'id required' }, 400)
      if (action === 'idea_edit' && !text) return json({ error: 'An idea needs words' }, 400)
      const { error } = await sb.from('gift_ideas').update(action === 'idea_edit' ? { idea: text } : { dismissed_at: now.toISOString() }).eq('id', id)
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    // A season starts as this year's project (P3.23, canvas 11c): from last year's, or Casa's starter plan.
    if (action === 'start') {
      const m = /^season:([a-z_]+):(\d{4})$/.exec(String(body.key ?? ''))
      const season = m && SEASONS.find((x) => x.id === m[1])
      if (!m || !season?.template) return json({ error: 'not a season that starts' }, 400)
      const year = Number(m[2])
      const { data, error } = await sb.rpc('todo_start_season', { p_season: season.id, p_year: year, p_title: season.title, p_target: season.date(year), p_template: season.template })
      if (error) throw new Error(error.message)
      return json({ ok: true, project_id: data })
    }

    if (action === 'done' || action === 'dismiss' || action === 'snooze') {
      const key = String(body.key ?? '').slice(0, 80)
      if (!key) return json({ error: 'key required' }, 400)
      // A project step's Done is the step done (P3.23): the project moves on, his phone with it.
      if (action === 'done' && key.startsWith('step:')) {
        const { data: st } = await sb.from('todo_steps').select('project_id').eq('id', key.slice(5)).maybeSingle()
        if (st) {
          const { error } = await sb.rpc('todo_project_edit_with_calendar', { p_project: st.project_id, p_op: 'done_step', p_args: { step_id: key.slice(5) } })
          if (error) throw new Error(error.message)
          return json({ ok: true, key, action })
        }
      }
      // On the Horizon (canvas 63–64): a ✓ keeps what was done ("Reminder: Thu Oct 8, 9 AM", its event to open), so the
      // timeline shows it as done; a ✕ "not for us" can teach fewer like it — a "never flag" rule, undoable.
      const b = body as { outcome?: Record<string, unknown>; fewer?: boolean; item?: { title?: string; kind?: string } }
      const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null)
      const outcome = action === 'done' && b.outcome && typeof b.outcome === 'object'
        ? { text: str(b.outcome.text, 160) ?? 'Marked handled', title: str(b.outcome.title, 160), date: str(b.outcome.date, 10), eventId: str(b.outcome.eventId, 64), by: b.outcome.by === 'alexa' ? 'alexa' : 'you' }
        : null
      let ruleId: string | null = null
      let taught: string | null = null
      if (action === 'dismiss' && b.fewer && b.item?.title) {
        const { data: fam } = await sb.from('family_members').select('name, full_name')
        taught = fewerLikeMatch(b.item, fam ?? [])
        if (taught) {
          const { data: rule, error: ruleError } = await sb.from('coming_up_rules').insert({ match: taught, off: true }).select('id').single()
          if (ruleError) throw new Error(ruleError.message)
          ruleId = (rule as { id: string }).id
        }
      }
      const patch = action === 'done' ? { done_at: now.toISOString(), ...(outcome ? { outcome } : {}) }
        : action === 'dismiss' ? { dismissed_at: now.toISOString(), ...(ruleId ? { rule_id: ruleId } : {}) }
        : { snoozed_until: plusDays(today, 7) }
      const { error } = await sb.from('coming_up_state').upsert({ item_key: key, ...patch, updated_at: now.toISOString() }, { onConflict: 'item_key' })
      if (error) throw new Error(error.message)
      return json({ ok: true, key, action, ...(taught ? { taught } : {}) })
    }

    // Undo (On the Horizon): the item back on the list as it was, and any "fewer like this" rule its ✕ made, gone.
    if (action === 'undo') {
      const key = String(body.key ?? '').slice(0, 80)
      if (!key) return json({ error: 'key required' }, 400)
      const { data: row } = await sb.from('coming_up_state').select('rule_id').eq('item_key', key).maybeSingle()
      if (row?.rule_id) await sb.from('coming_up_rules').update({ removed_at: now.toISOString() }).eq('id', row.rule_id)
      const { error } = await sb.from('coming_up_state').update({ done_at: null, dismissed_at: null, outcome: null, rule_id: null, updated_at: now.toISOString() }).eq('item_key', key)
      if (error) throw new Error(error.message)
      return json({ ok: true, key, action })
    }

    // Two months for birthdays plus the six-week window: look ~110 days out.
    const [eventsRes, giftsRes, stateRes, rulesRes, familyRes, projectsRes, stepsRes] = await Promise.all([
      sb.from('events').select('id, title, start_time, end_time, all_day, event_type, description, has_due_date')
        .is('deleted_at', null).neq('status', 'cancelled').neq('record_kind', 'series_template')
        .gte('start_time', new Date(now.getTime() - 86400e3).toISOString())
        .lt('start_time', new Date(now.getTime() + 110 * 86400e3).toISOString())
        .order('start_time').limit(1000),
      sb.from('gift_ideas').select('id, for_name, for_member_id, idea, created_at').is('done_at', null).is('dismissed_at', null).order('created_at'),
      sb.from('coming_up_state').select('item_key, done_at, dismissed_at, snoozed_until, poked_on, custom_step, custom_lead_days, outcome'),
      // Newest first: when two rules fit, the newer one wins.
      sb.from('coming_up_rules').select('match, step, lead_days, off').is('removed_at', null).order('created_at', { ascending: false }),
      // Ideas saved under a full name ("Olivia") still belong on that person's birthday.
      sb.from('family_members').select('id, name, full_name'),
      // Projects' dated steps and targets (P3.23).
      sb.from('todo_projects').select('id, title, status, aim_date, season_id').in('status', ['active', 'paused', 'done']).gte('updated_at', new Date(now.getTime() - 400 * 86400e3).toISOString()),
      sb.from('todo_steps').select('id, project_id, title, grp, position, cal_start, cal_end, cal_event_id, done_at, child_project_id'),
    ])
    for (const r of [eventsRes, giftsRes, stateRes, rulesRes, projectsRes, stepsRes]) if (r.error) throw new Error(r.error.message)
    const state = Object.fromEntries((stateRes.data ?? []).map((s: Record<string, unknown>) => [s.item_key as string, s]))
    const rules = rulesRes.data ?? []
    const items = buildComingUp({ now, events: eventsRes.data ?? [], giftIdeas: giftsRes.data ?? [], state, rules, family: familyRes.data ?? [], seasons: SEASONS, projects: { projects: (projectsRes.data ?? []).filter((p) => p.status !== 'done' || p.season_id), steps: (stepsRes.data ?? []).filter((st) => st.cal_start), progress: progressOf(stepsRes.data ?? []) } }) as Item[]

    // The screens show every gift idea (on the wall too, for now — Jake, 2026-09-27).
    // Each under the family member's own name, so "Olivia" and "Liv" are one person on screen.
    const family = familyRes.data ?? []
    const ideas = (giftsRes.data ?? []).map((g) => {
      const member = family.find((m) => m.id === g.for_member_id) ?? memberNamed(g.for_name, family)
      return { ...g, for_name: member?.name ?? g.for_name }
    })
    // What's already set on each line (canvas 66): on the calendar, a reminder for it.
    if (action === 'list') return json({ items: aheadMarks(items, eventsRes.data ?? []), rules, today, ideas, handled: handledFromState(stateRes.data ?? [], today) })

    const push = async (title: string, text: string, tag: string) => {
      const { error } = await sb.functions.invoke('send-push-notification', { body: { title, body: text, url: '/', tag } })
      if (error) throw new Error(error.message)
    }
    const line = (i: Item) => `${i.title} (${niceDate(i.date)}): ${i.nextStep.toLowerCase()}${i.ideas?.length ? ` — ideas: ${i.ideas.join('; ')}` : ''}`

    if (action === 'send_digest') {
      const soon = items.filter((i) => i.pokeOn <= plusDays(today, 14))
      if (!soon.length) return json({ ok: true, sent: false, reason: 'nothing needs planning in the next two weeks' })
      const text = soon.slice(0, 4).map(line).join('\n') + (soon.length > 4 ? `\n+ ${soon.length - 4} more` : '')
      await push(`Coming up: ${soon.length} thing${soon.length === 1 ? '' : 's'} to plan`, text, `coming-up-${today}`)
      return json({ ok: true, sent: true, count: soon.length })
    }

    if (action === 'send_pokes') {
      // A season done before starts by itself on its start date, from last year's project.
      for (const i of items.filter((x) => x.kind === 'season' && x.startable && !x.projectId && x.pokeOn <= today)) {
        const [, id, y] = i.key.split(':')
        const season = SEASONS.find((x) => x.id === id)
        if (season?.template) await sb.rpc('todo_start_season', { p_season: id, p_year: Number(y), p_title: season.title, p_target: season.date(Number(y)), p_template: season.template, p_auto: true })
      }
      // Today's pokes, plus any late one never poked; at most two a day.
      const due = items.filter((i) => (i.pokeOn === today || i.late) && state[i.key]?.poked_on == null).slice(0, 2)
      for (const i of due) {
        await push(`Time to plan: ${i.title}`, `${niceDate(i.date)}, in ${i.daysAway} day${i.daysAway === 1 ? '' : 's'}. ${i.nextStep}.${i.ideas?.length ? ` Ideas: ${i.ideas.join('; ')}.` : ''}`, `poke-${i.key}`)
        await sb.from('coming_up_state').upsert({ item_key: i.key, poked_on: today, updated_at: now.toISOString() }, { onConflict: 'item_key' })
      }
      return json({ ok: true, poked: due.map((i) => i.title) })
    }

    return json({ error: `Unknown action ${action}` }, 400)
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : String(cause) }, 500)
  }
})
