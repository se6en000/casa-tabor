import { minutesAway, type NextMoveView } from './header.ts'
import type { ThenItem } from './headerLead.ts'
import { comingHours, originLine, type ComingGoing, type NextUpItem, type TodoOrigin } from './nextUp.ts'
import type { TodoItem, TodoList } from './todos.ts'

// The left panel is now (canvas 79R/79S; Jake, Oct 8: "im a bit concerned of the UX drift between calm, day, evening,
// evening calm, and future days … its those things that throw me off" → "yes all good, lets unify this experience").
// Every face draws the same panel from today: NEXT (today's next car out), THEN (what's coming, to know), TO DO (what
// to do, a tap on the row ticks it). Looking at another day only dims it.

/** How many lines THEN shows; the rest is "+N later". */
export const THEN_ROOM = 3

/** THEN: the runs and things at home after NEXT, and who comes and goes, in time order — three, then "+N later". */
export function panelThen(then: ThenItem[], goings: ComingGoing[], room = THEN_ROOM): { shown: ThenItem[]; more: number } {
  const all = [...then, ...goings.map((g): ThenItem => ({ key: g.key, kind: 'home', at: g.at, whoId: g.whoId, title: g.title, routine: false, before: false, sourceId: '' }))]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  return { shown: all.slice(0, room), more: Math.max(0, all.length - room) }
}

/** One TO DO row: a chore or timed to-do (with its time), or a quick one with how long it takes. */
export interface TodoRow {
  key: string
  at: Date | null
  minutes: number | null
  title: string
  whoId: string | null
  late: boolean
  /** A chore or timed to-do: ticked through NEXT UP's tick (its moment of done, then it goes). */
  job?: NextUpItem
  /** A quick to-do: ticked as done. */
  todoId?: string
  /** What it is (canvas 80D): its icon, and a second line only where it tells you something the row doesn't. */
  kind: RowKind
  detail: string | null
  /** A project step: which of how many. */
  progress: { step: number; of: number } | null
}

export type RowKind = 'chore' | 'step' | 'reminder' | 'todo'

/**
 * The second line (canvas 80D; Jake, Oct 8: "I tend to like the detail but dont want to end up … overboard"): a chore
 * none — its person's dot says whose; a project step its project (and how far along); a reminder who added it and when;
 * a to-do what it's part of (when the row shows its next step), else how it got here.
 */
export function rowDetail(kind: RowKind, { project, origin, parent }: { project?: { title: string | null; step: number | null; of: number | null } | null; origin?: TodoOrigin | null; parent?: string | null }, now: Date): Pick<TodoRow, 'detail' | 'progress'> {
  if (kind === 'chore') return { detail: null, progress: null }
  if (kind === 'step') return { detail: project?.title ?? null, progress: project?.step && project.of ? { step: project.step, of: project.of } : null }
  if (kind === 'reminder') return { detail: originLine(origin, null, now), progress: null }
  return { detail: parent ?? originLine(origin, null, now), progress: null }
}

/** Quick ones that fit before `until` (ten minutes' room kept): Done finishes the whole thing. */
export function quickSteps(list: Pick<TodoList, 'nextUp'>, now: Date, until: Date | null, count: number): TodoItem[] {
  const room = until ? (until.getTime() - now.getTime()) / 60_000 - 10 : Infinity
  return list.nextUp.filter((i) => i.shape === 'quick' && i.minutes != null && i.minutes <= Math.min(room, 30)).slice(0, count)
}

/**
 * TO DO: what's late or due within four hours first (NEXT UP's rule — 7 PM's meds aren't in a 7 AM panel); then, when
 * there's room for them, quick ones that fit (a quiet stretch fills up to three).
 */
export function panelTodos(jobs: NextUpItem[], quick: TodoItem[], now: Date, { room, quickRoom }: { room: number; quickRoom: number }): TodoRow[] {
  const timed = comingHours(jobs, now).slice(0, room).map((job): TodoRow => {
    const kind: RowKind = job.kind === 'chore' ? 'chore' : job.todoKind === 'step' ? 'step' : job.todoKind === 'reminder' ? 'reminder' : 'todo'
    return { key: job.key, at: job.at, minutes: null, title: job.title, whoId: job.whoId, late: job.state === 'late', job, kind, ...rowDetail(kind, { project: job.project, origin: job.origin }, now) }
  })
  const taken = new Set(jobs.map((j) => j.id))
  const fill = quick.filter((q) => !taken.has(q.id)).slice(0, Math.max(0, Math.min(quickRoom, room - timed.length)))
    .map((q): TodoRow => {
      const kind: RowKind = q.kind === 'step' ? 'step' : q.kind === 'reminder' ? 'reminder' : 'todo'
      // A next step the title already starts with ("Call Anthony" of "Call Anthony about house insurance") says
      // nothing new: the title alone.
      const step = q.nextStep && !q.title.toLowerCase().startsWith(q.nextStep.toLowerCase()) ? q.nextStep : null
      return { key: `quick:${q.id}`, at: null, minutes: q.minutes, title: q.stepTitle ?? step ?? q.title, whoId: null, late: false, todoId: q.id, kind, ...rowDetail(kind, { project: q.project, origin: q.origin, parent: step ? q.title : null }, now) }
    })
  return [...timed, ...fill]
}

/** TO DO's heading: TONIGHT from 5 PM; in a quiet stretch, how long it is ("TO DO · 2 HR FREE"). */
export function todoHeading(now: Date, freeMinutes: number | null): string {
  if (now.getHours() >= 17) return 'TO DO TONIGHT'
  if (freeMinutes == null || freeMinutes < 20) return 'TO DO'
  return `TO DO · ${freeMinutes >= 60 ? `${Math.floor(freeMinutes / 60)} HR` : `${freeMinutes} MIN`} FREE`
}

const inWords = (m: number) => (m >= 60 ? `in ${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}` : `in ${m} min`)

/** NEXT's one heading form (canvas 79R): "NEXT OUT · 7:25 · IN 13 MIN"; on the road or at home, its own words. */
export function nextOutHeading(view: Pick<NextMoveView, 'leaveTime' | 'ring' | 'eyebrow' | 'status'>): string {
  const away = minutesAway(view)
  if (view.status !== 'upcoming' || !view.leaveTime || away == null) return view.eyebrow
  return `NEXT OUT · ${view.leaveTime} · ${inWords(away).toUpperCase()}`
}
