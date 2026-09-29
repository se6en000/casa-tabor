// The project page's model (FAMILY_WALL_PLAN.md P3.23, canvas 10b–10d / 11a–11b, approved by Jake
// 2026-09-29). Pure, so it's tested, and it's the specification the fixture follows.
//
// Top to bottom is the order. Steps that can happen side by side share a group (`grp`); the page draws
// a "Then" line between groups; the first group with anything left is "Now". A project inside another
// (Stucco cracks inside Paint the house) is a row in the list, with its own progress.

export interface ProjectChild { id: string; title: string; done: number; total: number; next: string | null; status: string }
export interface ProjectStep {
  id: string
  position: number
  grp: number
  title: string
  minutes: number | null
  cost_cents: number | null
  done_at: string | null
  reminder_event_id: string | null
  who: string | null
  fits: string[]
  repeat_minutes: number | null
  repeat_count: number | null
  repeat_unit: string | null
  notes: string | null
  cal_start: string | null
  cal_end: string | null
  shop_item: string | null
  child_project_id: string | null
  child: ProjectChild | null
}
export interface ProjectPerson { name: string; role?: string | null; contact?: string | null }
export interface ProjectInfo {
  id: string
  title: string
  aim_date: string | null
  aim_firm: boolean
  budget_cents: number | null
  people: ProjectPerson[]
  phone: 'next' | 'now' | 'none'
  yearly: boolean
  season_id: string | null
  status: 'active' | 'paused' | 'done' | 'dropped' | string
  paused_until: string | null
  notes: string | null
  created_at: string
}
export interface ProjectDetail {
  project: ProjectInfo
  steps: ProjectStep[]
  /** The project this one sits inside, if any. */
  parent?: { id: string; title: string } | null
  /** Other projects, for "Move to…", "a project inside" and "Part of". */
  others?: Array<{ id: string; title: string }>
}

export type DropTarget = { kind: 'join'; group: number; index: number } | { kind: 'new'; at: number }

const ordered = (steps: ProjectStep[]) => [...steps].sort((a, b) => a.grp - b.grp || a.position - b.position)

/** Open steps, grouped, in reading order. */
export function planGroups(detail: Pick<ProjectDetail, 'steps'>): ProjectStep[][] {
  const groups: ProjectStep[][] = []
  let last: number | null = null
  for (const s of ordered(detail.steps.filter((x) => !x.done_at))) {
    if (s.grp !== last) groups.push([])
    groups[groups.length - 1].push(s)
    last = s.grp
  }
  return groups
}

export const doneSteps = (detail: Pick<ProjectDetail, 'steps'>) => ordered(detail.steps.filter((s) => s.done_at))

/** The whole order as the server takes it: done steps first, each where it was, then the plan as shown. */
export function arrangement(detail: Pick<ProjectDetail, 'steps'>, open: string[][]): string[][] {
  return [...doneSteps(detail).map((s) => [s.id]), ...open.filter((g) => g.length)]
}

const HOLE = '\u0000'
const tidy = (groups: string[][]) => groups.map((g) => g.filter((id) => id !== HOLE)).filter((g) => g.length)

/** Put `id` where it was dropped; target indexes are as the page showed them (the step still in place). */
export function moveStep(groups: string[][], id: string, target: DropTarget): string[][] {
  const marked = groups.map((g) => g.map((x) => (x === id ? HOLE : x)))
  if (target.kind === 'new') marked.splice(Math.max(0, Math.min(target.at, marked.length)), 0, [id])
  else {
    const g = marked[target.group]
    if (!g) return groups
    g.splice(Math.max(0, Math.min(target.index, g.length)), 0, id)
  }
  return tidy(marked)
}

/**
 * ↑ / ↓, the fallback to dragging: a step sharing a group first steps out into a group of its own
 * (just above or below); a step on its own joins the group beside it.
 */
export function nudgeStep(groups: string[][], id: string, dir: 'up' | 'down'): string[][] {
  const gi = groups.findIndex((g) => g.includes(id))
  if (gi < 0) return groups
  const shared = groups[gi].length > 1
  if (dir === 'up') {
    if (shared) return moveStep(groups, id, { kind: 'new', at: gi })
    if (gi === 0) return groups
    return moveStep(groups, id, { kind: 'join', group: gi - 1, index: groups[gi - 1].length })
  }
  if (shared) return moveStep(groups, id, { kind: 'new', at: gi + 1 })
  if (gi === groups.length - 1) return groups
  return moveStep(groups, id, { kind: 'join', group: gi + 1, index: 0 })
}

/** Where a new step goes: '@new' stands in for it until the server gives it an id. */
export function placeNew(groups: string[][], where: DropTarget): string[][] {
  return moveStep(groups, '@new', where)
}

export interface RowBox { group: number; index: number; top: number; bottom: number }
export interface LineBox { at: number; top: number; bottom: number }

/** Where a dragged step lands, from the finger's height: a Then line, a row's upper or lower half, or an end. */
export function dropTargetAt(y: number, rows: RowBox[], lines: LineBox[], groupCount: number): DropTarget {
  const line = lines.find((l) => y >= l.top && y <= l.bottom)
  if (line) return { kind: 'new', at: line.at }
  if (!rows.length || y < rows[0].top) return { kind: 'new', at: 0 }
  if (y > rows[rows.length - 1].bottom) return { kind: 'new', at: groupCount }
  const row = rows.find((r) => y >= r.top && y <= r.bottom)
    ?? rows.reduce((best, r) => (Math.abs((r.top + r.bottom) / 2 - y) < Math.abs((best.top + best.bottom) / 2 - y) ? r : best))
  return { kind: 'join', group: row.group, index: y < (row.top + row.bottom) / 2 ? row.index : row.index + 1 }
}

/** "20 min", "1 hr", "3 hr 20", "5 days" (a working day is 8 hours). */
export function effortText(minutes: number | null | undefined): string {
  if (!minutes) return ''
  if (minutes >= 480 && minutes % 480 === 0) return `${minutes / 480} day${minutes === 480 ? '' : 's'}`
  if (minutes < 60) return `${minutes} min`
  return minutes % 60 === 0 ? `${minutes / 60} hr` : `${Math.floor(minutes / 60)} hr ${minutes % 60}`
}

export const moneyText = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`

const DAY = 86400e3
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY)
const plusDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10)

/**
 * The totals across the top of the page. Your time is the household's (anyone on the project without a
 * trade); a hired person's time is theirs, named by their trade. Pace: steps done per day so far,
 * carried over what's left (a project inside counts as one).
 */
export function projectStats(detail: Pick<ProjectDetail, 'project' | 'steps'>, today: string) {
  const own = detail.steps.filter((s) => !s.child_project_id)
  const open = own.filter((s) => !s.done_at)
  const trade = new Map(detail.project.people.filter((p) => p.role).map((p) => [p.name, p.role as string]))
  const theirs = new Map<string, number>()
  let yourMinutes = 0
  for (const s of open) {
    if (!s.minutes) continue
    const role = s.who ? trade.get(s.who) : undefined
    if (role) theirs.set(role, (theirs.get(role) ?? 0) + s.minutes)
    else yourMinutes += s.minutes
  }
  const inside = detail.steps.filter((s) => s.child).map((s) => ({ title: s.child!.title, done: s.child!.done, total: s.child!.total }))
  const done = own.length - open.length
  const left = open.length + detail.steps.filter((s) => s.child_project_id && !s.done_at).length
  const elapsed = Math.max(1, daysBetween(detail.project.created_at.slice(0, 10), today))
  const finish = done > 0 && left > 0 ? plusDays(today, Math.ceil(left / (done / elapsed))) : null
  const aim = detail.project.aim_date
  return {
    done,
    total: own.length,
    inside,
    yourMinutes,
    theirs: [...theirs].map(([who, minutes]) => ({ who, minutes })),
    moneyLeft: open.reduce((t, s) => t + (s.cost_cents ?? 0), 0),
    spent: own.filter((s) => s.done_at).reduce((t, s) => t + (s.cost_cents ?? 0), 0),
    budget: detail.project.budget_cents,
    daysLeft: aim ? daysBetween(today, aim) : null,
    finish,
    lateBy: finish && aim ? Math.max(0, daysBetween(aim, finish)) : null,
  }
}

/** Who can do a step: this project's people (set once, in Project settings). */
export function whoOptions(project: Pick<ProjectInfo, 'people'>): string[] {
  const names = project.people.map((p) => p.name).filter(Boolean)
  return names.length ? names : ['Me']
}

/** When a step fits, the same six everywhere. */
export const FITS = [
  { key: 'any', label: 'Any time' },
  { key: 'evenings', label: 'Evenings' },
  { key: 'weekdays', label: 'Weekdays' },
  { key: 'weekends', label: 'Weekends' },
  { key: 'daylight', label: 'Daylight' },
  { key: 'dry', label: 'Dry weather' },
] as const

/** The one time picker, for every step (and the quick change on a row). */
export const EFFORT_CHOICES = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '2 hr', minutes: 120 },
  { label: 'Half a day', minutes: 240 },
  { label: 'A day', minutes: 480 },
] as const

const STEP_DEFAULTS: Omit<ProjectStep, 'id' | 'position' | 'grp' | 'title'> = {
  minutes: null, cost_cents: null, done_at: null, reminder_event_id: null, who: null, fits: [], repeat_minutes: null, repeat_count: null,
  repeat_unit: null, notes: null, cal_start: null, cal_end: null, shop_item: null, child_project_id: null, child: null,
}

/** Groups 1..n and positions 1..n in reading order — as todo_project_sync keeps them. */
function renumber(steps: ProjectStep[]): ProjectStep[] {
  let g = 0
  let last: number | null = null
  return ordered(steps).map((s, i) => {
    if (s.grp !== last) g += 1
    last = s.grp
    return { ...s, grp: g, position: i + 1 }
  })
}

/** The order from [[ids side by side], …]; '@new' is `newId`; anything unlisted keeps its order after. */
function byArrangement(steps: ProjectStep[], groups: string[][], newId?: string): ProjectStep[] {
  const place = new Map<string, { grp: number; position: number }>()
  let pos = 0
  groups.filter((g) => g.length).forEach((g, gi) => g.forEach((sid) => {
    const id = sid === '@new' ? newId : sid
    if (id && !place.has(id)) place.set(id, { grp: gi + 1, position: ++pos })
  }))
  let extra = groups.length
  return steps.map((s) => place.get(s.id) ? { ...s, ...place.get(s.id)! } : { ...s, grp: ++extra + 1000, position: ++pos + 1000 })
}

/**
 * A project change applied the way todo_project_edit applies it — for the fixture, and as its
 * specification. Ops: rename, target, settings, status, add_step, add_child, take_out, part_of, arrange,
 * set_step (edit_step), move_step, move_to, delete_step, done_step, undo_step, delete_project.
 */
export function applyProjectEdit(detail: ProjectDetail, op: string, args: Record<string, unknown> = {}): ProjectDetail {
  const now = new Date().toISOString()
  const steps = detail.steps.map((s) => ({ ...STEP_DEFAULTS, ...s, grp: s.grp ?? s.position }))
  const project = { ...detail.project }
  const stepId = String(args.step_id ?? '')
  const title = typeof args.title === 'string' ? args.title.trim() : ''
  const has = (k: string) => Object.prototype.hasOwnProperty.call(args, k)
  const newId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const placeAdded = (list: ProjectStep[], added: ProjectStep) => {
    if (Array.isArray(args.arrange)) return byArrangement([...list, added], args.arrange as string[][], added.id)
    const after = list.find((s) => s.id === stepId)
    if (after) return [...list.map((s) => (s.grp > after.grp ? { ...s, grp: s.grp + 1 } : s)), { ...added, grp: after.grp + 1, position: after.position + 0.5 }]
    return [...list, { ...added, grp: Math.max(0, ...list.map((s) => s.grp)) + 1, position: list.length + 1 }]
  }
  let next = steps
  switch (op) {
    case 'rename': if (title) project.title = title; break
    case 'target': project.aim_date = (args.date as string | null) ?? null; break
    case 'settings':
      for (const k of ['aim_date', 'aim_firm', 'budget_cents', 'people', 'phone', 'yearly', 'notes'] as const) if (has(k)) (project as Record<string, unknown>)[k] = args[k]
      break
    case 'status':
      project.status = String(args.status)
      project.paused_until = args.status === 'paused' ? ((args.until as string) ?? null) : null
      if (args.status === 'done') next = steps.map((s) => ({ ...s, done_at: s.done_at ?? now }))
      break
    case 'delete_project': project.status = 'dropped'; break
    case 'add_step':
      if (!title) return detail
      next = placeAdded(steps, { ...STEP_DEFAULTS, id: newId, grp: 0, position: 0, title, minutes: typeof args.minutes === 'number' ? args.minutes : null })
      break
    case 'add_child': {
      const existing = detail.others?.find((o) => o.id === args.project_id)
      const name = existing?.title ?? title
      if (!name) return detail
      const childId = existing?.id ?? `new-project-${Date.now()}`
      next = placeAdded(steps, { ...STEP_DEFAULTS, id: newId, grp: 0, position: 0, title: name, child_project_id: childId, child: { id: childId, title: name, done: 0, total: 0, next: null, status: 'active' } })
      break
    }
    case 'take_out': case 'move_to': case 'delete_step': next = steps.filter((s) => s.id !== stepId); break
    case 'part_of': return { ...detail, parent: (detail.others ?? []).find((o) => o.id === args.parent_id) ?? null }
    case 'arrange': next = byArrangement(steps, (args.groups as string[][]) ?? []); break
    case 'set_step': case 'edit_step':
      next = steps.map((s) => {
        if (s.id !== stepId) return s
        const x = { ...s }
        if (title) x.title = title
        for (const k of ['cost_cents', 'who', 'fits', 'repeat_minutes', 'repeat_count', 'repeat_unit', 'notes', 'cal_start', 'cal_end', 'shop_item', 'minutes'] as const) {
          if (has(k)) (x as Record<string, unknown>)[k] = args[k] === '' ? null : args[k]
        }
        if (has('cal_start') && !args.cal_start) x.cal_end = null
        if (x.repeat_minutes && x.repeat_count && (has('repeat_minutes') || has('repeat_count'))) x.minutes = x.repeat_minutes * x.repeat_count
        return x
      })
      break
    case 'move_step': {
      const flat = ordered(steps)
      const i = flat.findIndex((s) => s.id === stepId)
      const j = args.dir === 'up' ? i - 1 : i + 1
      if (i < 0 || j < 0 || j >= flat.length) return detail
      const [a, b] = [flat[i], flat[j]]
      next = steps.map((s) => (s.id === a.id ? { ...s, grp: b.grp, position: b.position } : s.id === b.id ? { ...s, grp: a.grp, position: a.position } : s))
      break
    }
    case 'done_step': next = steps.map((s) => (s.id === stepId && !s.child_project_id ? { ...s, done_at: s.done_at ?? now } : s)); break
    case 'undo_step': next = steps.map((s) => (s.id === stepId ? { ...s, done_at: null } : s)); break
    default: return detail
  }
  return { ...detail, project, steps: renumber(next) }
}

/** A total of work in hours (48 hours of steps is "48 hr", not "6 days"); under ten, to the half hour. */
export function hoursText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes < 600 ? Math.round(minutes / 30) / 2 : Math.round(minutes / 60)
  return `${hours} hr`
}

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

/**
 * One card on the To do list's projects shelf (canvas 10a): a segment per step (done, Now, a project
 * inside, later), the size of what's left, the target and his pace, what's Now, and a project inside.
 */
export function shelfCard(detail: Pick<ProjectDetail, 'project' | 'steps'>, today: string) {
  const { project } = detail
  const stats = projectStats(detail, today)
  const groups = planGroups(detail)
  const now = new Set((groups[0] ?? []).map((s) => s.id))
  const segments = [...doneSteps(detail).map(() => 'done' as const), ...groups.flat().map((s) => (s.child_project_id ? 'inside' as const : now.has(s.id) ? 'now' as const : 'later' as const))]
  const size = [`${stats.done} of ${stats.total} steps`, stats.yourMinutes ? `~${hoursText(stats.yourMinutes)} yours` : null, stats.moneyLeft ? `${moneyText(stats.moneyLeft)} left` : null].filter(Boolean).join(' · ')
  const kind = project.status === 'paused'
    ? `PAUSED${project.paused_until ? ` UNTIL ${shortDate(project.paused_until).toUpperCase()}` : ''}`
    : project.yearly ? 'EVERY YEAR' : 'PROJECT'
  return {
    kind,
    segments,
    stats: size,
    target: project.aim_date ? `Target ${longDate(project.aim_date)} · ${stats.daysLeft} days` : null,
    pace: stats.finish ? (stats.lateBy ? { text: `At your pace: ${shortDate(stats.finish)}, ${stats.lateBy} days late`, late: true } : { text: `On pace: ${shortDate(stats.finish)}`, late: false }) : null,
    now: (groups[0] ?? []).filter((s) => !s.child_project_id).map((s) => s.title),
    inside: stats.inside[0] ?? null,
  }
}
