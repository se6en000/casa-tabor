#!/usr/bin/env node
// The month check for To do and projects (FAMILY_WALL_PLAN.md P3.22 step 8 / P3.23): what was actually
// used, and what became noise — so the next pass cuts, not adds. Read-only.
//   node scripts/todo-month-check.mjs [days=30]
// Uses SUPABASE_ACCESS_TOKEN from .env.local through the Management API in read-only mode; the token
// is never printed. Usage comes from the `todos` / `coming-up` functions' 'todo_use' / 'coming_up_use'
// lines (from 2026-09-29), the rest from the tables themselves.
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
const PROJECT = 'sjiejymuuuqzqukyeagk'
const days = Math.max(1, Math.min(120, Number(process.argv[2] ?? 30)))
const q = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }),
  })
  if (!r.ok) throw new Error(`query failed: ${r.status}`)
  return r.json()
}
const since = `now() - interval '${days} days'`
const line = (label, value) => console.log(`  ${label.padEnd(46)} ${value}`)

console.log(`To do and projects — the last ${days} days\n`)

// What was touched, where. Every control on the list and the project page is one of these.
const use = await q(`select event, coalesce(page, 'unknown') as surface, detail, count(*)::int as n
  from ai_drawer_debug_events where event in ('todo_use', 'coming_up_use') and received_at > ${since}
  group by 1, 2, 3 order by n desc`)
console.log('USED (answers and changes, by screen)')
if (use.length === 0) console.log('  nothing logged yet')
for (const u of use) line(`${u.detail} · ${u.surface}`, u.n)
const KNOWN = ['done', 'snooze', 'update', 'delete', 'accept', 'dismiss', 'project_edit:done_step', 'project_edit:undo_step', 'project_edit:arrange',
  'project_edit:add_step', 'project_edit:set_step', 'project_edit:delete_step', 'project_edit:add_child', 'project_edit:take_out', 'project_edit:settings',
  'project_edit:status', 'project_edit:move_to', 'project_edit:rename', 'project_edit:part_of']
const seen = new Set(use.map((u) => u.detail))
console.log('\nNEVER USED (candidates to cut or hide)')
for (const k of KNOWN.filter((k) => !seen.has(k))) console.log(`  ${k}`)

const [todos] = await q(`select
    count(*) filter (where e.created_at > ${since})::int as captured,
    count(*) filter (where e.status = 'cancelled' and e.updated_at > ${since})::int as finished,
    count(*) filter (where e.status <> 'cancelled' and e.deleted_at is null)::int as open,
    count(*) filter (where e.status <> 'cancelled' and e.deleted_at is null and d.snooze_count >= 3)::int as snoozed_3,
    count(*) filter (where e.status <> 'cancelled' and e.deleted_at is null and coalesce(d.shape, 'unsorted') = 'unsorted')::int as not_sure,
    count(*) filter (where d.sorted_by = 'jake')::int as resorted_by_jake
  from events e left join todo_details d on d.event_id = e.id
  where e.event_type = 'reminder' and e.record_kind = 'single'`)
console.log('\nTO-DOS')
line('captured (watch, phone, Siri, wall)', todos.captured)
line('finished', todos.finished)
line('still open', todos.open)
line('open and snoozed 3+ times (noise?)', todos.snoozed_3)
line('open and "Not sure"', todos.not_sure)
line('set by Jake, not Casa (his changes, project steps)', todos.resorted_by_jake)

const projects = await q(`select p.title, p.status, p.yearly, p.created_at,
    count(s.*) filter (where s.child_project_id is null)::int as steps,
    count(s.*) filter (where s.done_at > ${since})::int as done_lately,
    max(s.done_at) as last_done,
    count(s.*) filter (where s.cal_start is not null)::int as dated,
    count(distinct s.grp)::int as groups
  from todo_projects p left join todo_steps s on s.project_id = p.id
  where p.status in ('active', 'paused') or p.updated_at > ${since}
  group by p.id order by p.created_at`)
console.log('\nPROJECTS')
for (const p of projects) {
  // Stalled: nothing ticked for two weeks (counted from its start when nothing's been ticked yet).
  const stale = p.status === 'active' && Date.now() - Date.parse(p.last_done ?? p.created_at) > 14 * 86400e3
  line(`${p.title} (${p.status}${p.yearly ? ', every year' : ''})`, `${p.done_lately} steps done · ${p.steps} steps in ${p.groups} groups · ${p.dated} dated${stale ? ' · STALLED 2+ weeks' : ''}`)
}

const [seasons] = await q(`select count(*) filter (where season_id is not null)::int as started from todo_projects where created_at > ${since}`)
console.log('\nCOMING UP')
line('seasons started as projects', seasons.started)
console.log('\nRead it with Jake: keep what he used, cut or fold away what he never touched, and look hard at anything snoozed 3+ times or stalled.')
