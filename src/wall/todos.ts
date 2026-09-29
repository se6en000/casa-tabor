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
  projectId: string | null
  suggestion: { kind: 'merge' | 'done' | 'shopping'; with?: string; reason?: string } | null
}
export interface TodoProject {
  id: string; title: string; done: number; total: number; next: string | null; nextEventId: string | null; aimDate: string | null
  /** The project and its steps, for its card on the shelf (P3.23, canvas 10a). */
  detail?: Pick<ProjectDetail, 'project' | 'steps'>
}
export interface TodoSuggestion { id: string; title: string; kind: 'merge' | 'done' | 'shopping'; reason: string; with: string | null; withTitle: string | null }
export interface TodoList {
  nextUp: TodoItem[]
  groups: Record<'quick' | 'fix' | 'nudge' | 'dated' | 'unsorted', TodoItem[]>
  projects: TodoProject[]
  suggestions: TodoSuggestion[]
  today?: string
  sorting?: boolean
}
export type TodoAction =
  | { action: 'done' | 'accept' | 'dismiss' | 'delete'; id: string }
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

/** "Fix · 30 min · $20 · Safety · Buy" — what it is and what it takes, in one line. */
export function sizeLine(item: TodoItem): string {
  const parts = [SHAPE_LABEL[item.shape]]
  if (item.overdue && item.due) parts.push(`was due ${short(item.due)}`)
  else if (item.due) parts.push(short(item.due))
  if (item.minutes) parts.push(duration(item.minutes))
  if (item.costCents) parts.push(`$${Math.round(item.costCents / 100)}`)
  return [...parts, ...item.needs].join(' · ')
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
] as const

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const NUDGE_LEAD_MS = 2 * 60 * 60_000

/** Tonight's nudge (board 09a): a nudge due today, from two hours before its time until done or the day ends. */
export function tonightNudge(list: Pick<TodoList, 'nextUp' | 'groups'>, now: Date): TodoItem | null {
  const today = localDay(now)
  const all = [...list.nextUp, ...list.groups.nudge]
  return all
    .filter((i) => i.shape === 'nudge' && i.dueAt && !i.snoozedUntil)
    .filter((i) => localDay(new Date(i.dueAt!)) === today && now.getTime() >= new Date(i.dueAt!).getTime() - NUDGE_LEAD_MS)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())[0] ?? null
}

/**
 * In a quiet stretch (board 09a): one small job from Next up that fits before the next move, with
 * ten minutes to spare — never more than half an hour, so it stays a quick win.
 */
export function quietStep(list: Pick<TodoList, 'nextUp'>, now: Date, until: Date | null): TodoItem | null {
  const room = until ? (until.getTime() - now.getTime()) / 60_000 - 10 : Infinity
  // Quick ones only: Done here finishes the whole thing (a fix's next step isn't the fix).
  return list.nextUp.find((i) => i.shape === 'quick' && i.minutes != null && i.minutes <= Math.min(room, 30)) ?? null
}

/** The time part of a to-do, or null: a date with no time is stored at 5 PM (as the iOS sync does). */
export function timeOf(item: Pick<TodoItem, 'dueAt' | 'due'>): string | null {
  if (!item.due || !item.dueAt) return null
  const d = new Date(item.dueAt)
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return hhmm === '17:00' ? null : hhmm
}
