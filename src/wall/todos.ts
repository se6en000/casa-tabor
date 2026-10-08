// The To do screen's model (P3.22, board 09b, approved by Jake 2026-09-28): the `todos` function's
// list as the wall shows it. Shared by the wall and (later) the phone.
import type { ProjectDetail } from './projectModel.ts'

export type TodoShape = 'nudge' | 'quick' | 'fix' | 'project' | 'dated' | 'unsorted'

export interface TodoItem {
  id: string
  title: string
  shape: TodoShape
  minutes: number | null
  costCents: number | null
  nextStep: string | null
  needs: string[]
  /** YYYY-MM-DD, only when it has a real date. */
  due: string | null
  /** When it's due, to the minute (a nudge's time). */
  dueAt?: string | null
  overdue: boolean
  snoozedUntil: string | null
  snoozeCount: number
  /** Details kept with it (a reminder's notes: "three text ideas"). */
  notes?: string | null
  /** Where it is in its time (todo-stage.mjs): from the server's list. */
  stage?: 'snoozed' | 'overdue' | 'due' | 'heads_up' | 'quiet' | 'undated'
  projectId: string | null
  suggestion: { kind: 'merge' | 'done' | 'shopping'; with?: string; reason?: string } | null
  /** What it is and how it got here (canvas 74C1), from the server's list. */
  kind?: 'reminder' | 'step'
  project?: { id: string; title: string | null; step: number | null; of: number | null } | null
  /** A step's name without its project's in front. */
  stepTitle?: string | null
  origin?: import('./nextUp').TodoOrigin | null
  /** The first of two copies of the same thing at the same time. */
  copyOf?: string | null
}
export interface TodoProject {
  id: string; title: string; done: number; total: number; next: string | null; nextEventId: string | null; aimDate: string | null
  /** The project and its steps, for its card on the shelf (P3.23, canvas 10a). */
  detail?: Pick<ProjectDetail, 'project' | 'steps'>
}
export interface TodoSuggestion { id: string; title: string; kind: 'merge' | 'done' | 'shopping'; reason: string; with: string | null; withTitle: string | null }
/** A dated project step whose day has passed, not ticked: "…was yesterday. Done?" */
export interface PastStep { id: string; projectId: string; project: string; title: string; date: string; start: string }
export interface TodoList {
  pastSteps?: PastStep[]
  nextUp: TodoItem[]
  /** later: dated ones not yet near their day (todo-stage.mjs), soonest first. */
  groups: Record<'quick' | 'fix' | 'nudge' | 'dated' | 'unsorted' | 'later', TodoItem[]>
  projects: TodoProject[]
  suggestions: TodoSuggestion[]
  today?: string
  sorting?: boolean
}
export type TodoAction =
  | { action: 'done' | 'accept' | 'dismiss' | 'delete'; id: string }
  /** A copy folded into the first (canvas 74C1): its notes go with it. */
  | { action: 'merge'; id: string; into: string }
  | { action: 'snooze'; id: string; days: number }
  /** A to-do's title and date/time: due "YYYY-MM-DD" or null (no date); time "HH:MM" or null (no time). */
  | { action: 'update'; id: string; patch: { title?: string; due?: string | null; time?: string | null } }
  /** A project change (step 5): rename, target, add_step, edit_step, move_step, delete_step, done_step, undo_step, delete_project. */
  | { action: 'project_edit'; id: string; op: string; args?: Record<string, unknown> }

/** A project with all its steps, for the project page (canvas 10b-10d). */
export type TodoProjectDetail = ProjectDetail
export { applyProjectEdit } from './projectModel.ts'

const SHAPE_LABEL: Record<TodoShape, string> = { nudge: 'Nudge', quick: 'Quick one', fix: 'Fix', project: 'Project step', dated: 'Dated', unsorted: 'Not sure' }
const short = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const duration = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} hr` : `${Math.floor(m / 60)} hr ${m % 60}`)

/**
 * What it is and what it takes, as the pills on a Next up row (board 10a): kind, when (late in rust),
 * time, cost, needs. A project's step leaves its kind to the row's project tag.
 */
export function sizeChips(item: TodoItem): Array<{ text: string; late?: boolean }> {
  const chips: Array<{ text: string; late?: boolean }> = item.projectId ? [] : [{ text: SHAPE_LABEL[item.shape] }]
  if (item.overdue && item.due) chips.push({ text: `was due ${short(item.due)}`, late: true })
  else if (item.due) chips.push({ text: short(item.due) })
  if (item.minutes) chips.push({ text: duration(item.minutes) })
  if (item.costCents) chips.push({ text: `$${Math.round(item.costCents / 100)}` })
  return [...chips, ...item.needs.map((text) => ({ text }))]
}

/** "Fix · 30 min · $20 · Safety · Buy" — what it is and what it takes, in one line. */
export function sizeLine(item: TodoItem): string {
  return [...(item.projectId ? [{ text: SHAPE_LABEL[item.shape] }] : []), ...sizeChips(item)].map((c) => c.text).join(' · ')
}

/** How many of Next up fit on the screen: three beside the projects shelf (canvas 10a), four without. */
export const nextUpRoom = (list: Pick<TodoList, 'projects'>) => (list.projects.some((p) => p.detail) ? 3 : 4)

/** The week strip's To do tile: how many are ready now, and what else waits. */
export function todoTile(list: Pick<TodoList, 'nextUp' | 'projects' | 'suggestions'>) {
  const extras = [
    list.suggestions.length ? `${list.suggestions.length} for a yes` : null,
    list.projects.length ? `${list.projects.length} project${list.projects.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean)
  return { ready: Math.min(list.nextUp.length, nextUpRoom(list)), line: extras.length ? extras.join(' · ') : list.nextUp.length ? 'Nothing else waiting' : 'All clear' }
}

/** The folded groups on the right, in order. */
export const GROUPS = [
  { key: 'quick', label: 'Quick ones' },
  { key: 'fix', label: 'Fixes' },
  { key: 'projects', label: 'Projects' },
  { key: 'nudge', label: 'Nudges' },
  { key: 'dated', label: 'Dated' },
  { key: 'unsorted', label: 'Not sure' },
  // Dated ones not near their day yet (Jake, Oct 7).
  { key: 'later', label: 'Later' },
] as const

/** The time part of a to-do, or null: a date with no time is stored at 5 PM (as the iOS sync does). */
export function timeOf(item: Pick<TodoItem, 'dueAt' | 'due'>): string | null {
  if (!item.due || !item.dueAt) return null
  const d = new Date(item.dueAt)
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return hhmm === '17:00' ? null : hhmm
}

/** A calendar event that is a project step's (P3.23): which step of which project, for its sheet. */
export function stepForEvent(list: Pick<TodoList, 'projects'>, eventId: string) {
  for (const p of list.projects) {
    const steps = (p.detail?.steps ?? []).filter((s) => !s.child_project_id).sort((a, b) => a.grp - b.grp || a.position - b.position)
    const i = steps.findIndex((s) => s.cal_event_id === eventId)
    if (i >= 0) return { projectId: p.id, stepId: steps[i].id, project: p.title, title: steps[i].title, number: i + 1, total: steps.length, done: Boolean(steps[i].done_at) }
  }
  return null
}

/** "3 ready · 2 projects" above the title. */
export function todoSummary(list: Pick<TodoList, 'nextUp' | 'projects' | 'suggestions'>) {
  return [`${list.nextUp.length} ready`, list.projects.length ? `${list.projects.length} project${list.projects.length === 1 ? '' : 's'}` : null, list.suggestions.length ? `${list.suggestions.length} for a yes` : null].filter(Boolean).join(' · ')
}
