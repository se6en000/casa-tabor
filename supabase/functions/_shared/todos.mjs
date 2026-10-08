// To do (FAMILY_WALL_PLAN.md P3.22, board 09b): Jake's Reminders to-dos, organised. Pure, so it's
// tested; the `todos` function feeds it rows and the wall and phone show what it returns.
//
// Next up is a handful worth doing now — never the pile (the old prep lists: 3,414 items, 20 ever
// checked). The rest folds by kind: quick ones, fixes, nudges, dated (they live on Coming up), and
// "Not sure" for anything Casa couldn't sort. Projects show as progress and their current step.

import { notesOf, notesSource } from './event-notes.mjs'
import { leadDays, todoStage } from './todo-stage.mjs'

const TZ = 'America/New_York'
const NEXT_UP_MAX = 4
// Needs that make something jump the queue: a hazard, or the house not working.
const URGENT = { Safety: 50, 'Hot water': 35, Leak: 35, 'No power': 35 }

const localDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const plusDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400e3).toISOString().slice(0, 10)
const todoStageLead = (i) => leadDays(i)
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400e3)

/**
 * @param {{ reminders: any[], details: Record<string, any>, projects: any[], steps: any[], today: string }} input
 */
/**
 * How a to-do got here (canvas 74C1; Jake, Oct 8: "how did it get here"): Alexa (on the wall or a phone), a hand on the
 * add sheet, a scan, an email (its tag in the notes), a project's step — or, unrecorded (before Oct 8), just when.
 */
export function originOf(r, isStep = false) {
  const lane = String(r.ai_origin_lane ?? '')
  const where = /wall/.test(lane) ? 'wall' : /phone/.test(lane) ? 'phone' : null
  const email = notesSource(r.description)
  const via = /confirmation|assistant|voice/.test(lane) ? 'alexa' : /add-sheet/.test(lane) ? 'hand' : /scan/.test(lane) ? 'scan'
    : email ? 'email' : isStep ? 'project' : null
  return { via, where, text: via === 'email' ? email.text : null, at: r.created_at ?? null }
}

export function buildTodoList({ reminders, details, projects = [], steps = [], today }) {
  const soon = plusDays(today, 3)
  // A project step's day is the one it's planned on (Christmas lights' storage unit run, Nov 7).
  const stepDay = new Map((steps ?? []).filter((st) => st.reminder_event_id && st.cal_start).map((st) => [st.reminder_event_id, String(st.cal_start).slice(0, 10)]))
  // What a step is and how far its project is (canvas 74C1): "Project · step 2 of 5".
  const projectTitle = new Map((projects ?? []).map((p) => [p.id, p.title]))
  const stepOf = new Map()
  for (const st of steps ?? []) {
    if (!st.reminder_event_id) continue
    const mine = (steps ?? []).filter((x) => x.project_id === st.project_id && !x.child_project_id).sort((a, b) => (a.grp ?? 0) - (b.grp ?? 0) || (a.position ?? 0) - (b.position ?? 0))
    stepOf.set(st.reminder_event_id, { id: st.project_id, title: projectTitle.get(st.project_id) ?? null, step: mine.findIndex((x) => x.id === st.id) + 1, of: mine.length })
  }
  // The same thing twice (two copies of "Look into box character project" at 9:17, Oct 8): the later one is the copy.
  const sameKey = (r) => `${String(r.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${r.has_due_date ? new Date(r.start_time).toISOString() : ''}`
  const firstOf = new Map()
  for (const r of [...(reminders ?? [])].filter((r) => r.status !== 'cancelled' && !r.deleted_at).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    if (!firstOf.has(sameKey(r))) firstOf.set(sameKey(r), r.id)
  }
  const items = (reminders ?? [])
    .filter((r) => r.status !== 'cancelled' && !r.deleted_at)
    .map((r) => {
      const d = details?.[r.id] ?? {}
      const due = r.has_due_date ? localDate(r.start_time) : stepDay.get(r.id) ?? null
      const snoozedUntil = d.snoozed_until && d.snoozed_until > today ? d.snoozed_until : null
      const minutes = d.minutes ?? null
      const needs = d.needs ?? []
      const snoozes = d.snooze_count ?? 0
      const age = r.created_at ? Math.max(0, daysBetween(localDate(r.created_at), today)) : 0
      const score = needs.reduce((s, n) => s + (URGENT[n] ?? 0), 0)
        // Late leads (Jake, Oct 7: "stuff that is overdue, we should always be talking about") — dated ones too: the
        // dedication page, two days past its date, had dropped off Next up entirely.
        + (due && due < today ? 40 : 0)
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
        // Details kept with it (a reminder Alexa made with "three text ideas"), for the morning paper and its sheet.
        // What people wrote (canvas 65), never the house's tags or Google's details block.
        notes: notesOf(r.description).slice(0, 1200) || null,
        // What it is and how it got here (canvas 74C1).
        kind: d.project_id || stepOf.has(r.id) ? 'step' : 'reminder',
        project: stepOf.get(r.id) ?? (d.project_id ? { id: d.project_id, title: projectTitle.get(d.project_id) ?? null, step: null, of: null } : null),
        stepTitle: (() => {
          const pt = (stepOf.get(r.id) ?? {}).title ?? projectTitle.get(d.project_id)
          return pt && String(r.title).startsWith(`${pt}: `) ? String(r.title).slice(pt.length + 2) : null
        })(),
        origin: originOf(r, d.project_id || stepOf.has(r.id)),
        copyOf: firstOf.get(sameKey(r)) !== r.id ? firstOf.get(sameKey(r)) ?? null : null,
        score,
      }
    })
    // Where it is in its time (todo-stage.mjs): due and late lead; further off waits under Later.
    .map((i) => ({ ...i, stage: todoStage(i, today).stage }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))

  // A merge candidate, a grocery or one that looks over waits for a yes instead of being offered.
  // A dated one waits until its day — or a little before, for a job that needs room (a fix, a part, a pro): Jake, Oct 7,
  // "the washing machine cleaning cycle, I dont need to see that till the day its actually due". Late ones stay.
  const inTime = (i) => i.stage === 'due' || i.stage === 'overdue' || (i.stage === 'heads_up' && todoStageLead(i) >= 3)
  const eligible = items.filter((i) => !i.snoozedUntil && !i.suggestion && (
    // A dated one late a week or more leaves Next up for Dated (a month-old vet visit led it on the first live run);
    // Alexa asks "still want this?" about it instead.
    i.shape === 'dated' ? i.due && i.due <= soon && i.due >= plusDays(today, -7) && inTime(i)
      // A project's step: only when its planned day is close or past (Jake, Oct 7: "why are these steps for the project
      // under next up? christmas stuff shouldnt be showing here till at least after halloween") — an undated one is
      // already the project card's NOW.
      : i.shape === 'project' ? Boolean(i.due) && inTime(i)
      : (i.shape === 'quick' || i.shape === 'fix') && (!i.due || inTime(i))
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
  // Further off (or a small one before its day): folded under Later, by date, until it's time.
  // By its date, snoozed or not (Jake, Oct 7: Hello Fresh, snoozed and due Oct 27, sat in Quick ones).
  const later = (i) => {
    const byDate = todoStage({ ...i, snoozedUntil: null }, today).stage
    return byDate === 'quiet' || (byDate === 'heads_up' && todoStageLead(i) < 3)
  }
  const groups = {
    quick: rest.filter((i) => i.shape === 'quick' && !later(i)),
    fix: rest.filter((i) => i.shape === 'fix' && !later(i)),
    nudge: rest.filter((i) => i.shape === 'nudge' && !later(i)),
    dated: rest.filter((i) => i.shape === 'dated' && !later(i)),
    unsorted: rest.filter((i) => i.shape === 'unsorted' && !later(i)),
    later: rest.filter(later).sort((a, b) => a.due.localeCompare(b.due)),
  }

  // Projects (P3.23): the shelf draws each card from the project and its steps. A project inside
  // another rides on its parent's card; a paused one still shows.
  const stepsOf = (id) => (steps ?? []).filter((s) => s.project_id === id).sort((a, b) => (a.grp ?? a.position) - (b.grp ?? b.position) || a.position - b.position)
  const byId = new Map((projects ?? []).map((p) => [p.id, p]))
  const childIds = new Set((steps ?? []).map((s) => s.child_project_id).filter(Boolean))
  const childOf = (id) => {
    const p = byId.get(id)
    if (!p) return null
    const own = stepsOf(id)
    return { id, title: p.title, done: own.filter((s) => s.done_at).length, total: own.length, next: own.find((s) => !s.done_at)?.title ?? null, status: p.status }
  }
  // A project whose next step is planned more than a week out waits off the shelf until then (its step is under Later).
  const notYet = (p) => {
    const current = stepsOf(p.id).find((st) => !st.done_at && !st.child_project_id)
    return Boolean(current?.cal_start) && String(current.cal_start).slice(0, 10) > plusDays(today, 7)
  }
  const projectList = (projects ?? [])
    .filter((p) => (p.status === 'active' || p.status === 'paused') && !childIds.has(p.id) && !notYet(p))
    .map((p) => {
      const own = stepsOf(p.id)
      const current = own.find((s) => !s.done_at && !s.child_project_id) ?? null
      return {
        id: p.id,
        title: p.title,
        done: own.filter((s) => s.done_at).length,
        total: own.length,
        next: current?.title ?? null,
        nextEventId: current?.reminder_event_id ?? null,
        aimDate: p.aim_date ?? null,
        detail: {
          project: p,
          steps: own.map((s) => ({ fits: [], ...s, child: s.child_project_id ? childOf(s.child_project_id) : null })),
        },
      }
    })

  // A dated step whose last day has passed and isn't ticked: asked about ("…was yesterday. Done?"),
  // never marked done by itself — a planned day isn't proof it happened (P3.23).
  const activeIds = new Set((projects ?? []).filter((p) => p.status === 'active').map((p) => p.id))
  const pastSteps = (steps ?? [])
    .filter((st) => st.cal_start && !st.done_at && !st.child_project_id && activeIds.has(st.project_id) && (st.cal_end ?? st.cal_start) < today)
    .map((st) => ({ id: st.id, projectId: st.project_id, project: byId.get(st.project_id)?.title ?? '', title: st.title, date: st.cal_end ?? st.cal_start, start: st.cal_start }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const titleOf = new Map(items.map((i) => [i.id, i.title]))
  const suggestions = items
    .filter((i) => i.suggestion)
    .map((i) => ({ id: i.id, title: i.title, kind: i.suggestion.kind, reason: i.suggestion.reason ?? '', with: i.suggestion.with ?? null, withTitle: i.suggestion.with ? titleOf.get(i.suggestion.with) ?? null : null }))

  return { nextUp, groups, projects: projectList, suggestions, pastSteps, today }
}
