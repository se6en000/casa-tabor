// Re-run a child's routine school-run sync against production (the same code Family settings runs on
// save), e.g. to clean up duplicate series. Previews by default; --apply makes the changes.
//   npx tsx scripts/resync-routine-series.ts Emme [--apply]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { deserializeRoutineFromAvailabilityRules } from '../src/lib/familyRoutines.ts'
import { extractDesiredRoutineSeries, planRoutineSeriesSync, syncMemberRoutineExceptions, type ExistingRoutineSeries } from '../src/lib/routineRecurrenceCoordinator.ts'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const name = process.argv[2]
const apply = process.argv.includes('--apply')

const { data: members } = await supabase.from('family_members').select('id, name, role')
const child = members!.find((m) => m.name === name)
if (!child) throw new Error(`No family member named ${name}`)
const { data: rules } = await supabase.from('member_availability_rules').select('*').eq('member_id', child.id)
const routine = deserializeRoutineFromAvailabilityRules(child.id, rules ?? [])
if (!routine) throw new Error(`${name} has no routine`)
const desired = extractDesiredRoutineSeries(child.id, routine, members!)

const { data: seriesRows } = await supabase
  .from('event_series')
  .select('id, ownership, created_at, recurrence_lines, google_recurring_event_id, template:events!event_series_template_event_id_fkey(id, title, rrule, deleted_at, google_event_id)')
  .eq('status', 'active').is('deleted_at', null)
const existing: ExistingRoutineSeries[] = (seriesRows ?? [])
  .filter((r: any) => r.template && !r.template.deleted_at && new RegExp(`^(Drop off|Pick up) ${name} @`, 'i').test(r.template.title))
  .map((r: any) => ({ seriesId: r.id, templateId: r.template.id, title: r.template.title, byDay: ([...(r.recurrence_lines ?? []), r.template.rrule ?? ''].join(';').match(/BYDAY=([A-Z]{2})/) ?? [])[1] ?? null, gid: r.google_recurring_event_id, ownership: r.ownership, createdAt: r.created_at, templateGoogleId: r.template.google_event_id }))
const plan = planRoutineSeriesSync(desired, existing)
console.log('Wanted:', desired.map((d) => `${d.dayCode} ${d.startTimeLocal} ${d.title}`))
console.log('Keep:', plan.keep.map((k) => `${k.byDay} ${k.title} [${k.ownership} ${k.gid}]`))
console.log('Retire:', plan.retire.map((r) => `${r.byDay} ${r.title} [${r.ownership} ${r.gid}]${r.deleteGoogle ? ' + delete in Google' : ''}`))
console.log('Create:', plan.create.map((d) => `${d.dayCode} ${d.title}`))
if (apply) console.log('Applied:', await syncMemberRoutineExceptions(supabase, child.id, routine, members as any))
else console.log('(preview — add --apply to make these changes)')
