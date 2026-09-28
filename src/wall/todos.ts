// The To do screen's model (P3.22, board 09b, approved by Jake 2026-09-28): the `todos` function's
// list as the wall shows it. Shared by the wall and (later) the phone.

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
  overdue: boolean
  snoozedUntil: string | null
  snoozeCount: number
  projectId: string | null
  suggestion: { kind: 'merge' | 'done' | 'shopping'; with?: string; reason?: string } | null
}
export interface TodoProject { id: string; title: string; done: number; total: number; next: string | null; nextEventId: string | null; aimDate: string | null }
export interface TodoSuggestion { id: string; title: string; kind: 'merge' | 'done' | 'shopping'; reason: string; with: string | null; withTitle: string | null }
export interface TodoList {
  nextUp: TodoItem[]
  groups: Record<'quick' | 'fix' | 'nudge' | 'dated' | 'unsorted', TodoItem[]>
  projects: TodoProject[]
  suggestions: TodoSuggestion[]
  today?: string
  sorting?: boolean
}
export type TodoAction = { action: 'done' | 'accept' | 'dismiss'; id: string } | { action: 'snooze'; id: string; days: number }

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

/** The week strip's To do tile: how many are ready now, and what else waits. */
export function todoTile(list: Pick<TodoList, 'nextUp' | 'projects' | 'suggestions'>) {
  const extras = [
    list.suggestions.length ? `${list.suggestions.length} for a yes` : null,
    list.projects.length ? `${list.projects.length} project${list.projects.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean)
  return { ready: list.nextUp.length, line: extras.length ? extras.join(' · ') : list.nextUp.length ? 'Nothing else waiting' : 'All clear' }
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
