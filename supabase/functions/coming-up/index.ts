// coming-up — the "coming up" digest (FAMILY_WALL_PLAN.md P3.19 step 3).
// Body { action }:
//   'list'                     → { items } for the wall and phone (gift ideas included — Jake,
//                                2026-09-27: "I'd still like it all to show up on the wall as well as phone")
//   'done' | 'dismiss' | 'snooze' with { key } (snooze: a week) → marks the item
//   'send_digest'              → Sunday evening push: what's coming up (cron coming-up-sunday-digest)
//   'send_pokes'               → morning push for items whose plan-by day is today, once each (cron coming-up-daily-pokes)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { memberNamed } from '../_shared/family-names.mjs'
import { buildComingUp, SEASONS } from '../_shared/coming-up.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const TZ = 'America/New_York'
const todayLocal = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
const plusDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400e3).toISOString().slice(0, 10)
const niceDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

type Item = { key: string; kind: string; title: string; date: string; daysAway: number; nextStep: string; pokeOn: string; late: boolean; ideas?: string[]; projectId?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const body = await req.json().catch(() => ({})) as { action?: string; key?: string }
    const action = body.action ?? 'list'
    const now = new Date()
    const today = todayLocal(now)

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
      const patch = action === 'done' ? { done_at: now.toISOString() }
        : action === 'dismiss' ? { dismissed_at: now.toISOString() }
        : { snoozed_until: plusDays(today, 7) }
      const { error } = await sb.from('coming_up_state').upsert({ item_key: key, ...patch, updated_at: now.toISOString() }, { onConflict: 'item_key' })
      if (error) throw new Error(error.message)
      return json({ ok: true, key, action })
    }

    // Two months for birthdays plus the six-week window: look ~110 days out.
    const [eventsRes, giftsRes, stateRes, rulesRes, familyRes, projectsRes, stepsRes] = await Promise.all([
      sb.from('events').select('id, title, start_time, end_time, all_day, event_type, description')
        .is('deleted_at', null).neq('status', 'cancelled').neq('record_kind', 'series_template')
        .gte('start_time', new Date(now.getTime() - 86400e3).toISOString())
        .lt('start_time', new Date(now.getTime() + 110 * 86400e3).toISOString())
        .order('start_time').limit(1000),
      sb.from('gift_ideas').select('for_name, for_member_id, idea, created_at').is('done_at', null).is('dismissed_at', null).order('created_at'),
      sb.from('coming_up_state').select('item_key, done_at, dismissed_at, snoozed_until, poked_on, custom_step, custom_lead_days'),
      // Newest first: when two rules fit, the newer one wins.
      sb.from('coming_up_rules').select('match, step, lead_days, off').is('removed_at', null).order('created_at', { ascending: false }),
      // Ideas saved under a full name ("Olivia") still belong on that person's birthday.
      sb.from('family_members').select('id, name, full_name'),
      // Projects' dated steps and targets (P3.23).
      sb.from('todo_projects').select('id, title, status, aim_date').eq('status', 'active'),
      sb.from('todo_steps').select('id, project_id, title, cal_start, cal_end, cal_event_id, done_at').not('cal_start', 'is', null),
    ])
    for (const r of [eventsRes, giftsRes, stateRes, rulesRes, projectsRes, stepsRes]) if (r.error) throw new Error(r.error.message)
    const state = Object.fromEntries((stateRes.data ?? []).map((s: Record<string, unknown>) => [s.item_key as string, s]))
    const rules = rulesRes.data ?? []
    const items = buildComingUp({ now, events: eventsRes.data ?? [], giftIdeas: giftsRes.data ?? [], state, rules, family: familyRes.data ?? [], seasons: SEASONS, projects: { projects: projectsRes.data ?? [], steps: stepsRes.data ?? [] } }) as Item[]

    // The screens show every gift idea (on the wall too, for now — Jake, 2026-09-27).
    // Each under the family member's own name, so "Olivia" and "Liv" are one person on screen.
    const family = familyRes.data ?? []
    const ideas = (giftsRes.data ?? []).map((g) => {
      const member = family.find((m) => m.id === g.for_member_id) ?? memberNamed(g.for_name, family)
      return { ...g, for_name: member?.name ?? g.for_name }
    })
    if (action === 'list') return json({ items, rules, today, ideas })

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
