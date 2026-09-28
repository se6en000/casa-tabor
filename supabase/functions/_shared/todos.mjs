// To do (FAMILY_WALL_PLAN.md P3.22, board 09b): Jake's Reminders to-dos, organised. Pure, so it's
// tested; the `todos` function feeds it rows and the wall and phone show what it returns.
//
// Next up is a handful worth doing now — never the pile (the old prep lists: 3,414 items, 20 ever
// checked). The rest folds by kind: quick ones, fixes, nudges, dated (they live on Coming up), and
// "Not sure" for anything Casa couldn't sort. Projects show as progress and their current step.

const TZ = 'America/New_York'
const NEXT_UP_MAX = 4
// Needs that make something jump the queue: a hazard, or the house not working.
const URGENT = { Safety: 50, 'Hot water': 35, Leak: 35, 'No power': 35 }

const localDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const plusDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400e3).toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400e3)

/**
 * @param {{ reminders: any[], details: Record<string, any>, projects: any[], steps: any[], today: string }} input
 */
export function buildTodoList({ reminders, details, projects = [], steps = [], today }) {
  const soon = plusDays(today, 3)
  const items = (reminders ?? [])
    .filter((r) => r.status !== 'cancelled' && !r.deleted_at)
    .map((r) => {
      const d = details?.[r.id] ?? {}
      const due = r.has_due_date ? localDate(r.start_time) : null
      const snoozedUntil = d.snoozed_until && d.snoozed_until > today ? d.snoozed_until : null
      const minutes = d.minutes ?? null
      const needs = d.needs ?? []
      const snoozes = d.snooze_count ?? 0
      const age = r.created_at ? Math.max(0, daysBetween(localDate(r.created_at), today)) : 0
      const score = needs.reduce((s, n) => s + (URGENT[n] ?? 0), 0)
        // Late matters for a job still to do; a dated moment long gone isn't "urgent", it's probably over.
        + (due && due < today && d.shape !== 'dated' ? 40 : 0)
        + (due && due >= today && due <= soon ? 30 : 0)
        + (d.project_id ? 15 : 0)
        + (minutes != null && minutes <= 15 ? 10 : 0)
        + Math.min(20, age * 0.5)
        - 15 * snoozes
      return {
        id: r.id,
        title: r.title,
        shape: d.shape ?? 'unsorted',
        minutes,
        costCents: d.cost_cents ?? null,
        nextStep: d.next_step ?? null,
        needs,
        due,
        // The time too, for a nudge ("trash out at 8").
        dueAt: r.has_due_date ? new Date(r.start_time).toISOString() : null,
        // Only a real date can be late; an undated to-do is never "overdue".
        overdue: Boolean(due && due < today),
        snoozedUntil,
        snoozeCount: snoozes,
        projectId: d.project_id ?? null,
        suggestion: d.suggestion ?? null,
        score,
      }
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))

  // A merge candidate, a grocery or one that looks over waits for a yes instead of being offered.
  const eligible = items.filter((i) => !i.snoozedUntil && !i.suggestion && (
    i.shape === 'quick' || i.shape === 'fix' || i.shape === 'project' || (i.shape === 'dated' && i.due && i.due <= soon && i.due >= plusDays(today, -2))
  ))
  const nextUp = eligible.slice(0, NEXT_UP_MAX)
  // Always one quick win in view when there is one: momentum beats the perfect order.
  if (!nextUp.some((i) => i.shape === 'quick')) {
    const quick = eligible.find((i) => i.shape === 'quick')
    if (quick && nextUp.length === NEXT_UP_MAX) nextUp[NEXT_UP_MAX - 1] = quick
    else if (quick) nextUp.push(quick)
  }
  const shown = new Set(nextUp.map((i) => i.id))
  const rest = items.filter((i) => !shown.has(i.id))
  const groups = {
    quick: rest.filter((i) => i.shape === 'quick'),
    fix: rest.filter((i) => i.shape === 'fix'),
    nudge: rest.filter((i) => i.shape === 'nudge'),
    dated: rest.filter((i) => i.shape === 'dated'),
    unsorted: rest.filter((i) => i.shape === 'unsorted'),
  }

  const projectList = (projects ?? [])
    .filter((p) => p.status === 'active')
    .map((p) => {
      const own = (steps ?? []).filter((s) => s.project_id === p.id).sort((a, b) => a.position - b.position)
      const current = own.find((s) => !s.done_at) ?? null
      return {
        id: p.id,
        title: p.title,
        done: own.filter((s) => s.done_at).length,
        total: own.length,
        next: current?.title ?? null,
        nextEventId: current?.reminder_event_id ?? null,
        aimDate: p.aim_date ?? null,
      }
    })

  const titleOf = new Map(items.map((i) => [i.id, i.title]))
  const suggestions = items
    .filter((i) => i.suggestion)
    .map((i) => ({ id: i.id, title: i.title, kind: i.suggestion.kind, reason: i.suggestion.reason ?? '', with: i.suggestion.with ?? null, withTitle: i.suggestion.with ? titleOf.get(i.suggestion.with) ?? null : null }))

  return { nextUp, groups, projects: projectList, suggestions, today }
}
