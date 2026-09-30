// Plan it with Casa (FAMILY_WALL_PLAN.md P3.25 phase 3; canvas 12b–12d, approved by Jake 2026-09-29):
// the plan the planning model set, read three ways — the draft beside the conversation, the Agree
// card with a tick per thing, and what was saved, each opening where it lives. Shared by wall and phone.

export interface PlanStep { title: string; minutes?: number; cost_cents?: number; who?: string; cal_start?: string; cal_end?: string }
export type PlanItem =
  | { id: string; kind: 'project'; title: string; steps: PlanStep[]; part_of?: string; part_of_project_id?: string; aim_date?: string; why?: string }
  | { id: string; kind: 'tick_step'; project_id: string; step_id: string; title: string; project?: string; why?: string }
  | { id: string; kind: 'event'; title: string; start: string; end: string; why?: string }
  | { id: string; kind: 'todo'; title: string; due?: string; why?: string }
  | { id: string; kind: 'shopping'; name: string; why?: string }
  | { id: string; kind: 'pack'; label: string; event_id?: string; event_ref?: string; event_title?: string; why?: string }
  // Changes to a saved project, and a project replaced (phase 4).
  | { id: string; kind: 'edit_step'; project_id: string; step_id: string; project: string; title: string; changes: StepChanges; why?: string }
  | { id: string; kind: 'add_step'; project_id: string; project: string; title: string; after_step_id?: string; after?: string; changes?: StepChanges; why?: string }
  | { id: string; kind: 'remove_step'; project_id: string; step_id: string; project: string; title: string; why?: string }
  | { id: string; kind: 'event_details'; event_id: string; title: string; changes: { start?: string; end?: string; place?: string; notes?: string; people?: string[] }; why?: string }
  | { id: string; kind: 'move_step'; project_id: string; step_id: string; project: string; title: string; after_step_id?: string; after?: string; why?: string }
  | { id: string; kind: 'close_project'; project_id: string; title: string; reason: string; open_steps?: number; why?: string }
export interface StepChanges { title?: string; who?: string; cal_start?: string; cal_end?: string; minutes?: number; cost_cents?: number }

export interface PlanArgs { id: string; title: string; items: PlanItem[]; skip?: string[] }
export interface PlanLink { id: string; kind: string; project_id?: string; event_id?: string; start?: string }
export interface PlanResult { plan_id?: string; undo_until?: string; links?: PlanLink[]; undone?: boolean }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** "Sat, Oct 17" from a calendar day or the day of an ISO time (read as written, not converted). */
export function dayText(value: string): string {
  const d = new Date(`${value.slice(0, 10)}T12:00:00Z`)
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}
const shortDate = (value: string) => { const d = new Date(`${value.slice(0, 10)}T12:00:00Z`); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` }
const clock = (iso: string) => { const h = Number(iso.slice(11, 13)); const m = iso.slice(14, 16); return { text: `${h % 12 || 12}${m === '00' ? '' : `:${m}`}`, pm: h >= 12 } }
/** "6–8 PM", "11 AM–1 PM". */
export function timeRange(start: string, end: string): string {
  const a = clock(start)
  const b = clock(end)
  return a.pm === b.pm ? `${a.text}–${b.text} ${b.pm ? 'PM' : 'AM'}` : `${a.text} ${a.pm ? 'PM' : 'AM'}–${b.text} ${b.pm ? 'PM' : 'AM'}`
}
const effort = (m: number) => (m < 60 ? `${m} min` : `${Math.round((m / 60) * 10) / 10} hr`)
const money = (cents: number) => `$${Math.round(cents / 100)}`
const stepMeta = (st: PlanStep) => [st.cal_start ? dayText(st.cal_start) : null, st.who, st.minutes ? effort(st.minutes) : null, st.cost_cents ? money(st.cost_cents) : null].filter(Boolean).join(' · ')
const itemName = (i: PlanItem) => (i.kind === 'shopping' ? i.name : i.kind === 'pack' ? i.label : i.title)
/** "→ Sun, Oct 18 · Kelly" — what a change to a step does, in order: name, day, who, time, cost. */
const changeText = (c: StepChanges | undefined) => [c?.title ? `“${c.title}”` : null, c?.cal_start ? dayText(c.cal_start) : null, c?.who, c?.minutes ? effort(c.minutes) : null, c?.cost_cents ? money(c.cost_cents) : null].filter(Boolean).join(' · ')
type Change = Extract<PlanItem, { kind: 'edit_step' | 'add_step' | 'remove_step' | 'move_step' }>
const isChange = (i: PlanItem): i is Change => i.kind === 'edit_step' || i.kind === 'add_step' || i.kind === 'remove_step' || i.kind === 'move_step'
const changeProjects = (items: PlanItem[]) => [...new Set(items.filter(isChange).map((i) => i.project))]

export interface PlanLine { key: string; text: string; meta: string; why?: string; done?: boolean; number?: number; struck?: boolean }
export interface PlanSection { heading: string; intro?: string; why?: string; lines: PlanLine[] }

/** The draft (board 12b): steps first (ticks, then the new steps in order), then where the rest lands. */
export function planSections(items: PlanItem[]): PlanSection[] {
  const out: PlanSection[] = []
  // A photo's details for an event already on the calendar (P3.24; board 12f "Add to Owen's field trip").
  for (const d of items.filter((i): i is Extract<PlanItem, { kind: 'event_details' }> => i.kind === 'event_details')) {
    out.push({ heading: `ADD TO ${d.title.toUpperCase()}`, why: d.why, lines: detailLines(d).map((l) => ({ key: `details:${d.event_id}:${l.meta}`, text: l.text, meta: l.meta })) })
  }
  const closing = items.filter((i): i is Extract<PlanItem, { kind: 'close_project' }> => i.kind === 'close_project')
  if (closing.length) out.push({ heading: 'CLOSING', lines: closing.map((c) => ({ key: `close:${c.title}`, text: c.title, meta: `${c.reason}${c.open_steps ? ` · ${c.open_steps} ${c.open_steps === 1 ? 'step' : 'steps'} not done come${c.open_steps === 1 ? 's' : ''} off` : ''}`, struck: true, why: c.why })) })
  const projects = items.filter((i): i is Extract<PlanItem, { kind: 'project' }> => i.kind === 'project')
  const ticks = items.filter((i): i is Extract<PlanItem, { kind: 'tick_step' }> => i.kind === 'tick_step')
  if (projects.length || ticks.length) {
    const first = projects[0]
    out.push({
      heading: 'STEPS',
      intro: first ? (first.part_of ? `A project inside ${first.part_of}` : `A new project: ${first.title}`) : undefined,
      why: first?.why,
      lines: [
        ...ticks.map((t) => ({ key: `tick:${t.title}`, text: t.title, meta: 'ticks off', why: t.why, done: true })),
        ...projects.flatMap((p) => p.steps.map((st, n) => ({ key: `step:${st.title}`, text: st.title, meta: stepMeta(st), number: n + 1 }))),
      ],
    })
  }
  for (const project of changeProjects(items)) {
    out.push({ heading: `CHANGES TO ${project.toUpperCase()}`, lines: items.filter(isChange).filter((i) => i.project === project).map((i) => (
      i.kind === 'edit_step' ? { key: `edit_step:${i.title}`, text: i.title, meta: `→ ${changeText(i.changes)}`, why: i.why }
        : i.kind === 'add_step' ? { key: `add_step:${i.title}`, text: `+ ${i.title}`, meta: [i.after ? `after ${i.after}` : null, changeText(i.changes) || null].filter(Boolean).join(' · '), why: i.why }
          : i.kind === 'move_step' ? { key: `move_step:${i.title}`, text: i.title, meta: i.after ? `→ after ${i.after}` : '→ first', why: i.why }
            : { key: `remove_step:${i.title}`, text: i.title, meta: 'comes off', struck: true, why: i.why }
    )) })
  }
  const shopping = items.filter((i): i is Extract<PlanItem, { kind: 'shopping' }> => i.kind === 'shopping')
  if (shopping.length) out.push({ heading: 'SHOPPING', lines: shopping.map((i) => ({ key: `shopping:${i.name}`, text: i.name, meta: '', why: i.why })) })
  const events = items.filter((i): i is Extract<PlanItem, { kind: 'event' }> => i.kind === 'event')
  const datedSteps = projects.flatMap((p) => p.steps.filter((st) => st.cal_start))
  if (events.length || datedSteps.length) {
    out.push({
      heading: 'ON THE CALENDAR',
      lines: [
        ...events.map((e) => ({ key: `event:${e.title}`, text: e.title, meta: `${dayText(e.start)} · ${timeRange(e.start, e.end)}`, why: e.why })),
        ...datedSteps.map((st) => ({ key: `calstep:${st.title}`, text: st.title, meta: `${dayText(st.cal_start!)} · a step` })),
      ],
    })
  }
  const todos = items.filter((i): i is Extract<PlanItem, { kind: 'todo' }> => i.kind === 'todo')
  if (todos.length) out.push({ heading: 'TO DO', lines: todos.map((t) => ({ key: `todo:${t.title}`, text: t.title, meta: t.due ? `by ${dayText(t.due)}` : '', why: t.why })) })
  const packs = items.filter((i): i is Extract<PlanItem, { kind: 'pack' }> => i.kind === 'pack')
  if (packs.length) out.push({ heading: 'PACK', lines: packs.map((p) => ({ key: `pack:${p.label}`, text: p.label, meta: `for ${p.event_title ?? 'its event'}`, why: p.why })) })
  return out
}

/** What changed since the plan before (board 12b's "Just changed"), and which lines to mark. */
export function planChange(before: PlanItem[] | null, after: PlanItem[]): { line: string | null; marked: Set<string>; removed: string[] } {
  const marked = new Set<string>()
  const removed: string[] = []
  if (!before) return { line: null, marked, removed }
  const flat = (items: PlanItem[]) => {
    const m = new Map<string, { name: string; sig: string; date?: string; who?: string }>()
    for (const i of items) {
      if (i.kind === 'project') for (const st of i.steps) m.set(`step:${st.title}`, { name: st.title, sig: JSON.stringify(st), date: st.cal_start, who: st.who })
      else m.set(`${i.kind}:${itemName(i)}`, { name: itemName(i), sig: JSON.stringify({ ...i, id: undefined, why: undefined }) })
    }
    return m
  }
  const was = flat(before)
  const now = flat(after)
  const parts: string[] = []
  for (const [key, v] of now) {
    const old = was.get(key)
    if (!old) { marked.add(key); parts.push(`added “${v.name}”`); continue }
    if (old.sig === v.sig) continue
    marked.add(key)
    parts.push(v.date && v.date !== old.date ? `${v.name} → ${dayText(v.date)}` : v.who && v.who !== old.who ? `${v.name} → ${v.who}` : `${v.name} changed`)
  }
  for (const [key, v] of was) if (!now.has(key)) { parts.push(`took off “${v.name}”`); removed.push(v.name) }
  // Changes to existing lines first, then what's new, then what went.
  parts.sort((a, b) => rank(a) - rank(b))
  return { line: parts.length ? `Just changed: ${parts.join(' · ')}` : null, marked, removed }
}
const rank = (p: string) => (p.startsWith('added') ? 1 : p.startsWith('took off') ? 2 : 0)

/** What a photo adds to an event already there, one line each: the time, the place, who's going, the notes. */
function detailLines(d: Extract<PlanItem, { kind: 'event_details' }>): Array<{ text: string; meta: string }> {
  const c = d.changes
  return [
    c.start ? { text: `${dayText(c.start)} · ${c.end ? timeRange(c.start, c.end) : timeRange(c.start, c.start)}`, meta: 'the time' } : null,
    c.place ? { text: c.place, meta: 'the place' } : null,
    c.people?.length ? { text: c.people.join(', '), meta: 'going' } : null,
    c.notes ? { text: c.notes, meta: 'in the notes' } : null,
  ].filter((l): l is { text: string; meta: string } => Boolean(l))
}

const PLACE: Record<PlanItem['kind'], string> = { project: 'project', tick_step: 'project', event: 'calendar', todo: 'todo', shopping: 'shopping', pack: 'pack', edit_step: 'project', add_step: 'project', remove_step: 'project', move_step: 'project', close_project: 'project', event_details: 'calendar' }
/** "7 things, in 5 places": each line on the card is a thing. */
export function planCount(items: PlanItem[], skip: string[]): { things: number; label: string } {
  const kept = items.filter((i) => !skip.includes(i.id))
  const places = new Set(kept.map((i) => PLACE[i.kind])).size
  return { things: kept.length, label: `${kept.length} ${kept.length === 1 ? 'thing' : 'things'}, in ${places} ${places === 1 ? 'place' : 'places'}` }
}

export interface AgreeRow { id: string; label: string; meta: string }
/** The Agree card (board 12c): grouped by where each thing lands, a tick per thing. */
export function agreeGroups(items: PlanItem[]): Array<{ heading: string; rows: AgreeRow[] }> {
  const groups: Array<{ heading: string; rows: AgreeRow[] }> = []
  const add = (heading: string, rows: AgreeRow[]) => { if (rows.length) groups.push({ heading, rows }) }
  add('TAKING OFF', items.filter((i): i is Extract<PlanItem, { kind: 'close_project' }> => i.kind === 'close_project').map((c) => ({ id: c.id, label: `Close ${c.title}`, meta: c.reason })))
  const parent = items.find((i): i is Extract<PlanItem, { kind: 'project' }> => i.kind === 'project' && Boolean(i.part_of))
  add(parent ? `PROJECT · INSIDE ${parent.part_of!.toUpperCase()}` : 'PROJECT', [
    ...items.filter((i) => i.kind === 'project').map((i) => ({ id: i.id, label: itemName(i), meta: `${(i as { steps: PlanStep[] }).steps.length} steps` })),
    ...items.filter((i) => i.kind === 'tick_step').map((i) => ({ id: i.id, label: `Tick off “${itemName(i)}”`, meta: 'done' })),
  ])
  for (const project of changeProjects(items)) {
    add(`CHANGES TO ${project.toUpperCase()}`, items.filter(isChange).filter((i) => i.project === project).map((i) => (
      i.kind === 'edit_step' ? { id: i.id, label: `${i.title} → ${changeText(i.changes)}`, meta: '' }
        : i.kind === 'add_step' ? { id: i.id, label: `Add “${i.title}”`, meta: i.after ? `after ${i.after}` : '' }
          : i.kind === 'move_step' ? { id: i.id, label: `Move “${i.title}”`, meta: i.after ? `after ${i.after}` : 'to the start' }
            : { id: i.id, label: `Remove “${i.title}”`, meta: '' }
    )))
  }
  add('CALENDAR · ADDING TO WHAT’S THERE', items.filter((i): i is Extract<PlanItem, { kind: 'event_details' }> => i.kind === 'event_details').map((d) => ({
    id: d.id, label: `Add to “${d.title}”`, meta: detailLines(d).filter((l) => l.meta !== 'in the notes').map((l) => l.text).join(' · '),
  })))
  add('CALENDAR · AND GOOGLE', items.filter((i): i is Extract<PlanItem, { kind: 'event' }> => i.kind === 'event').map((e) => ({ id: e.id, label: e.title, meta: `${dayText(e.start)} · ${timeRange(e.start, e.end)}` })))
  add('SHOPPING LIST', items.filter((i) => i.kind === 'shopping').map((i) => ({ id: i.id, label: itemName(i), meta: '' })))
  add('TO DO', items.filter((i): i is Extract<PlanItem, { kind: 'todo' }> => i.kind === 'todo').map((t) => ({ id: t.id, label: t.title, meta: t.due ? `by ${dayText(t.due)}` : '' })))
  add('PACK', items.filter((i): i is Extract<PlanItem, { kind: 'pack' }> => i.kind === 'pack').map((p) => ({ id: p.id, label: p.label, meta: `for ${p.event_title ?? 'its event'}` })))
  return groups
}

export type PlanOpen = { kind: 'project' | 'event'; id: string; label: string } | { kind: 'shopping' | 'todo'; label: string }
/** Saved (board 12d): each line opens where it lives; what he left out is named. */
export function savedRows(items: PlanItem[], result: PlanResult, skip: string[]): { rows: Array<{ label: string; open: PlanOpen | null }>; left: string[] } {
  const link = (id: string) => result.links?.find((l) => l.id === id)
  const saved = items.filter((i) => !skip.includes(i.id))
  const rows: Array<{ label: string; open: PlanOpen | null }> = []
  const see = (id: string | undefined, when: string | undefined): PlanOpen | null => (id ? { kind: 'event', id, label: when ? `See ${shortDate(when)}` : 'See it' } : null)
  for (const i of saved) {
    if (i.kind === 'close_project') rows.push({ label: `${i.title} closed · ${i.reason}`, open: { kind: 'project', id: i.project_id, label: 'Open project' } })
  }
  for (const i of saved) {
    if (i.kind === 'project') {
      const id = link(i.id)?.project_id
      rows.push({ label: `${i.title} · ${i.steps.length} ${i.steps.length === 1 ? 'step' : 'steps'}${i.part_of ? `, inside ${i.part_of}` : ''}`, open: id ? { kind: 'project', id, label: 'Open project' } : null })
    }
  }
  for (const project of changeProjects(saved)) {
    const these = saved.filter(isChange).filter((i) => i.project === project)
    rows.push({ label: `${project}: ${these.length} ${these.length === 1 ? 'change' : 'changes'}`, open: { kind: 'project', id: these[0].project_id, label: 'Open project' } })
  }
  for (const i of saved) if (i.kind === 'tick_step') rows.push({ label: `“${i.title}” ticked off`, open: { kind: 'project', id: i.project_id, label: 'Open project' } })
  for (const i of saved) {
    if (i.kind === 'event_details') rows.push({ label: `${i.title} · details added · on Google too`, open: see(link(i.id)?.event_id ?? i.event_id, i.changes.start) })
    if (i.kind === 'event') rows.push({ label: `${i.title} · ${dayText(i.start)} · ${timeRange(i.start, i.end)} · on Google too`, open: see(link(i.id)?.event_id, i.start) })
  }
  const shopping = saved.filter((i) => i.kind === 'shopping')
  if (shopping.length) rows.push({ label: `${shopping.length} ${shopping.length === 1 ? 'line' : 'lines'} on the shopping list`, open: { kind: 'shopping', label: 'Shopping list' } })
  for (const i of saved) if (i.kind === 'todo') rows.push({ label: `${i.title} · on To do`, open: { kind: 'todo', label: 'To do' } })
  const packs = saved.filter((i): i is Extract<PlanItem, { kind: 'pack' }> => i.kind === 'pack')
  for (const title of [...new Set(packs.map((p) => p.event_title ?? 'its event'))]) {
    const these = packs.filter((p) => (p.event_title ?? 'its event') === title)
    const eventId = link(these[0].id)?.event_id
    const when = these[0].event_ref ? (saved.find((i) => i.id === these[0].event_ref) as { start?: string } | undefined)?.start : undefined
    rows.push({ label: `Pack for ${title}: ${these.map((p) => p.label).join(', ')}`, open: see(eventId, when) })
  }
  return { rows, left: items.filter((i) => skip.includes(i.id)).map(itemName) }
}

/** What's left out, with the pack lines of any event left out (nothing to pack for). */
export function withDependents(items: PlanItem[], skip: string[]): string[] {
  const out = [...skip]
  for (const i of items) if (i.kind === 'pack' && i.event_ref && skip.includes(i.event_ref) && !out.includes(i.id)) out.push(i.id)
  return out
}
