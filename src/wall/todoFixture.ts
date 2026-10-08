import { useState } from 'react'
import { applyProjectEdit, type TodoAction, type TodoItem, type TodoList, type TodoProjectDetail } from './todos'
import type { ProjectStep } from './projectModel'

// The to-do list and projects both fixtures show (the wall's and the phone's): Jake's list, Paint the
// house with the stucco project inside, Halloween decorations, the patio floorboards (P3.22 / P3.23).
// `stepEvent`: a step on today's calendar, and a dated step whose day has passed.

export const todoItem = (id: string, title: string, extra: Partial<TodoItem>): TodoItem => ({ id, title, shape: 'quick', minutes: null, costCents: null, nextStep: null, needs: [], due: null, overdue: false, snoozedUntil: null, snoozeCount: 0, projectId: null, suggestion: null, ...extra })
export const TODOS: TodoList = {
  nextUp: [
    todoItem('td-gfi', 'Replace the outside GFI outlet', { shape: 'fix', minutes: 30, costCents: 2000, nextStep: 'Turn off the power to the outside outlet at the breaker', needs: ['Safety', 'Buy'] }),
    todoItem('td-vet', 'Bring Gilbert to the vet', { minutes: 15, nextStep: 'Call the vet to book a visit', needs: ['Call'], due: '2026-08-24', overdue: true }),
    todoItem('td-tire', 'Replace tire sensor', { shape: 'fix', minutes: 15, costCents: 5000, nextStep: 'Call a tire shop for a quote', needs: ['Call', 'Needs a pro'] }),
    todoItem('td-anthony', 'Call Anthony about house insurance alternatives', { minutes: 15, nextStep: 'Call Anthony', needs: ['Call'] }),
  ],
  groups: {
    quick: [
      todoItem('td-windshield', 'Look up replacing the Tesla windshield and an insurance rebate', { minutes: 20, needs: ['Look-up'] }),
      todoItem('td-pool', 'Look for a cable to fix the pool', { minutes: 15, needs: ['Look-up', 'Buy'] }),
    ],
    fix: [
      todoItem('td-heater', 'Troubleshoot the water heater E05 error', { shape: 'fix', minutes: 30, nextStep: 'Look up E05 for this model', needs: ['Hot water'] }),
      todoItem('td-arlo', 'Install the Arlo camera with solar', { shape: 'fix', minutes: 60, needs: ['Daylight'] }),
    ],
    nudge: [
      todoItem('td-trash', 'Trash out to the street', { shape: 'nudge', minutes: 5, due: '2026-09-25', dueAt: new Date(2026, 8, 25, 20, 0).toISOString() }),
      todoItem('td-tub', 'Run the washing machine tub clean', { shape: 'nudge', minutes: 30 }),
    ],
    dated: [],
    unsorted: [],
    later: [],
  },
  projects: [{ id: 'pr-paint', title: 'Paint the house', done: 3, total: 9, next: 'Pick colours: 3 sample pots', nextEventId: 'td-paint', aimDate: '2026-11-21' }],
  suggestions: [
    { id: 'td-cupcakes', title: 'Pick up Owen’s birthday cupcakes', kind: 'done', reason: 'Owen’s birthday was in July', with: null, withTitle: null },
    { id: 'td-heater2', title: 'Troubleshoot the water heater E05 error', kind: 'merge', reason: 'Same thing', with: 'td-heater', withTitle: 'Troubleshoot the water heater E05 error' },
    { id: 'td-towels', title: 'Paper towels', kind: 'shopping', reason: 'A grocery', with: null, withTitle: null },
  ],
}

// Paint the house as canvas 10b draws it (P3.23): three done, Now is colours beside the stucco project,
// then choosing the painter, the patio and shutters side by side, the painter, touch-ups.
export const pstep = (id: string, grp: number, title: string, extra: Partial<ProjectStep> = {}): ProjectStep => ({
  id, grp, position: 0, title, minutes: null, cost_cents: null, done_at: null, reminder_event_id: null, who: null, fits: [], repeat_minutes: null, repeat_count: null,
  repeat_unit: null, notes: null, cal_start: null, cal_end: null, shop_item: null, child_project_id: null, child: null, ...extra,
})
export const numbered = (steps: ProjectStep[]) => steps.map((st, i) => ({ ...st, position: i + 1 }))
export const PAINT: TodoProjectDetail = {
  project: {
    id: 'pr-paint', title: 'Paint the house', aim_date: '2026-11-21', aim_firm: false, budget_cents: 800000, phone: 'next', yearly: false, season_id: null,
    status: 'active', paused_until: null, notes: 'Gomez might do the stucco too. Ask on the quote.', created_at: '2026-09-13T12:00:00Z',
    people: [{ name: 'Me' }, { name: 'Kelly' }, { name: 'Gomez Painting', role: 'Painter' }, { name: 'Mario’s Stucco', role: 'Stucco', contact: '(561) 555-0142' }],
  },
  steps: numbered([
    pstep('st-decide', 1, 'Decide: hire it out', { done_at: '2026-09-15T12:00:00Z' }),
    pstep('st-walk', 2, 'Walk the house, list the repairs', { done_at: '2026-09-18T12:00:00Z' }),
    pstep('st-quotes', 3, 'Ask 3 painters for quotes', { done_at: '2026-09-22T12:00:00Z' }),
    pstep('st-colours', 4, 'Pick colours: 3 sample pots', { minutes: 60, cost_cents: 4000, who: 'Me', fits: ['weekends', 'daylight'], reminder_event_id: 'td-paint' }),
    pstep('st-stucco', 4, 'Stucco cracks: seal and patch', { child_project_id: 'pr-stucco', child: { id: 'pr-stucco', title: 'Stucco cracks: seal and patch', done: 1, total: 4, next: 'Mario’s quote', status: 'active' } }),
    pstep('st-choose', 5, 'Choose the painter and book dates', { minutes: 30, who: 'Me', cal_start: '2026-10-10' }),
    pstep('st-patio', 6, 'Move patio furniture, cover plants', { minutes: 60, who: 'Kelly' }),
    pstep('st-shutters', 6, 'Take down shutters and house numbers', { minutes: 60, who: 'Me' }),
    pstep('st-painter', 7, 'The painter: 5 days, a dry week', { minutes: 2400, cost_cents: 600000, who: 'Gomez Painting', fits: ['weekdays', 'dry'], cal_start: '2026-11-09', cal_end: '2026-11-13', notes: 'Gate code for the crew: 4471. Cover the pool pump.' }),
    pstep('st-touch', 8, 'Touch-ups and the final walk-round', { minutes: 60, who: 'Me' }),
  ]),
  parent: null,
  others: [{ id: 'pr-stucco', title: 'Stucco cracks: seal and patch' }, { id: 'pr-floor', title: 'Redo floorboards on the roof patio' }],
}
export const STUCCO: TodoProjectDetail = {
  project: { ...PAINT.project, id: 'pr-stucco', title: 'Stucco cracks: seal and patch', aim_date: null, budget_cents: null, notes: null, people: [{ name: 'Me' }, { name: 'Mario’s Stucco', role: 'Stucco' }] },
  steps: numbered([
    pstep('sc-walk', 1, 'Walk the cracks with Mario', { done_at: '2026-09-24T12:00:00Z' }),
    pstep('sc-quote', 2, 'Mario’s quote', { who: 'Mario’s Stucco' }),
    pstep('sc-patch', 3, 'Patch and seal', { minutes: 960, who: 'Mario’s Stucco' }),
    pstep('sc-cure', 4, 'Let it cure a week', { minutes: 15 }),
  ]),
  parent: { id: 'pr-paint', title: 'Paint the house' },
  others: [{ id: 'pr-paint', title: 'Paint the house' }],
}

// The shelf's other projects (canvas 10a): a yearly one on pace, and one not started.
export const HALLOWEEN: TodoProjectDetail = {
  project: { ...PAINT.project, id: 'pr-halloween', title: 'Halloween decorations', aim_date: '2026-10-31', budget_cents: null, yearly: true, created_at: '2026-09-15T12:00:00Z', people: [{ name: 'Me' }, { name: 'Kelly' }, { name: 'The kids' }], notes: null },
  steps: numbered([
    pstep('hw-bins', 1, 'Get the bins from the garage', { done_at: '2026-09-19T12:00:00Z', minutes: 30 }),
    pstep('hw-inside', 2, 'Inside: the mantel and the stairs', { done_at: '2026-09-23T12:00:00Z', minutes: 90 }),
    pstep('hw-yard', 3, 'The yard: tombstones and the fog machine', { minutes: 120, who: 'Me' }),
    pstep('hw-porch', 3, 'The porch: lights and the spider web', { minutes: 60, who: 'The kids' }),
    pstep('hw-test', 4, 'Test the timers after dark', { minutes: 20 }),
  ]),
}
export const FLOOR: TodoProjectDetail = {
  project: { ...PAINT.project, id: 'pr-floor', title: 'Redo floorboards on the roof patio', aim_date: null, budget_cents: null, created_at: '2026-09-28T12:00:00Z', people: [{ name: 'Me' }, { name: 'Kelly' }], notes: null },
  steps: numbered(['Measure the patio', 'Buy the boards', 'Pull up the old boards', 'Lay the new ones', 'Seal them'].map((t, i) => pstep(`fl-${i}`, i + 1, t, { minutes: 120 }))),
}
export const summary = (d: TodoProjectDetail) => {
  const open = d.steps.filter((x) => !x.done_at && !x.child_project_id)
  return { id: d.project.id, title: d.project.title, done: d.steps.filter((x) => x.done_at).length, total: d.steps.length, next: open[0]?.title ?? null, nextEventId: null, aimDate: d.project.aim_date, detail: d }
}
export const SHELF = [PAINT, HALLOWEEN, FLOOR].map(summary)


// `twoInside` (P3.25, Jake 2026-09-29): Paint the house with two projects inside, side by side (the
// floorboards join the stucco), for the card's swipe.
const PAINT_TWO: TodoProjectDetail = {
  ...PAINT,
  steps: [...PAINT.steps.slice(0, 5), pstep('st-floor', 4, 'Redo floorboards on the roof patio', { child_project_id: 'pr-floor', child: { id: 'pr-floor', title: 'Redo floorboards on the roof patio', done: 0, total: 3, next: 'Price the boards', status: 'active' } }), ...PAINT.steps.slice(5)],
}

// `closedInside` (P3.25 phase 4): the stucco replaced ("Mario's doing it with the painting") — closed, kept.
const CLOSED_REASON = 'Mario’s doing it with the painting'
const PAINT_CLOSED: TodoProjectDetail = { ...PAINT, steps: PAINT.steps.map((st) => (st.id === 'st-stucco' ? { ...st, done_at: '2026-09-25T12:00:00Z', child: { ...st.child!, status: 'dropped', closed_reason: CLOSED_REASON } } : st)) }
const STUCCO_CLOSED: TodoProjectDetail = { ...STUCCO, project: { ...STUCCO.project, status: 'dropped', closed_reason: CLOSED_REASON } }

/**
 * `?nextUpDetail=1` (canvas 74C1): Next up's cards with what each is and how it got here — the trash nudge Alexa added on
 * the wall, a second copy of it at the same time, and a Paint the house step planned for tonight.
 */
function withDetail(list: TodoList): TodoList {
  const trash = list.groups.nudge.find((i) => i.id === 'td-trash')
  if (!trash) return list
  const alexa = { ...trash, kind: 'reminder' as const, origin: { via: 'alexa' as const, where: 'wall' as const, text: null, at: new Date(2026, 8, 24, 16, 26).toISOString() }, copyOf: null }
  const copy = { ...alexa, id: 'td-trash-copy', origin: { via: null, where: null, text: null, at: new Date(2026, 8, 24, 16, 28).toISOString() }, copyOf: 'td-trash' }
  const step = todoItem('td-paint-step', 'Paint the house: Pick colours: 3 sample pots', {
    shape: 'nudge', minutes: 20, due: '2026-09-25', dueAt: new Date(2026, 8, 25, 19, 30).toISOString(),
  })
  return {
    ...list,
    groups: {
      ...list.groups,
      nudge: [alexa, copy, { ...step, kind: 'step', project: { id: 'pr-paint', title: 'Paint the house', step: 4, of: 9 }, stepTitle: 'Pick colours: 3 sample pots', origin: { via: 'project', where: null, text: null, at: null } }, ...list.groups.nudge.filter((i) => i.id !== 'td-trash')],
    },
  }
}

export function useFixtureTodos({ stepEvent = false, twoInside = false, closedInside = false, detail = false }: { stepEvent?: boolean; twoInside?: boolean; closedInside?: boolean; detail?: boolean } = {}) {
  const STEP_EVENT = stepEvent
  const [todoList, setTodoList] = useState<TodoList>(() => ({
    ...(detail ? withDetail(TODOS) : TODOS),
    projects: closedInside ? [PAINT_CLOSED, HALLOWEEN, FLOOR].map(summary) : twoInside ? [PAINT_TWO, HALLOWEEN].map(summary) : STEP_EVENT ? SHELF.map((p) => (p.id === 'pr-paint' ? { ...p, detail: { ...p.detail, steps: p.detail.steps.map((st) => (st.id === 'st-colours' ? { ...st, cal_start: '2026-09-25', cal_event_id: 'ev-colours' } : st)) } } : p)) : SHELF,
    // A dated step whose day has passed, asked about.
    pastSteps: STEP_EVENT ? [{ id: 'hw-yard', projectId: 'pr-halloween', project: 'Halloween decorations', title: 'The yard: tombstones and the fog machine', date: '2026-09-24', start: '2026-09-24' }] : [],
  }))
  const [projects, setProjects] = useState<Record<string, TodoProjectDetail>>({ 'pr-paint': closedInside ? PAINT_CLOSED : twoInside ? PAINT_TWO : PAINT, 'pr-stucco': closedInside ? STUCCO_CLOSED : STUCCO, 'pr-halloween': HALLOWEEN, 'pr-floor': FLOOR })
  const todos = {
    list: todoList,
    useProject: (id: string | null) => ({ data: id ? projects[id] ?? null : null }),
    act: async (r: TodoAction) => {
      if (r.action === 'project_edit') {
        // A past step answered (done, or moved) leaves the question; a step done ticks on its card too.
        const stepId = String(r.args?.step_id ?? '')
        setTodoList((l) => ({
          ...l,
          pastSteps: (l.pastSteps ?? []).filter((st) => st.id !== stepId),
          projects: l.projects.map((p) => (p.id === r.id && p.detail && r.op === 'done_step' ? { ...p, detail: { ...p.detail, steps: p.detail.steps.map((st) => (st.id === stepId ? { ...st, done_at: new Date().toISOString() } : st)) } } : p)),
        }))
        return setProjects((all) => ({ ...all, [r.id]: applyProjectEdit(all[r.id], r.op, r.args) }))
      }
      if (r.action === 'update') {
        const change = (i: TodoItem) => (i.id === r.id ? { ...i, ...(r.patch.title ? { title: r.patch.title } : {}), ...('due' in r.patch ? { due: r.patch.due ?? null } : {}) } : i)
        return setTodoList((l) => ({ ...l, nextUp: l.nextUp.map(change), groups: Object.fromEntries(Object.entries(l.groups).map(([k, v]) => [k, v.map(change)])) as TodoList['groups'] }))
      }
      return setTodoList((l) => ({
      ...l,
      nextUp: l.nextUp.filter((i) => i.id !== r.id),
      groups: r.action === 'snooze' ? l.groups : (Object.fromEntries(Object.entries(l.groups).map(([k, v]) => [k, v.filter((i) => i.id !== r.id)])) as TodoList['groups']),
      suggestions: l.suggestions.filter((sg) => sg.id !== r.id),
      }))
    },
  }
  return { todos, projects, setProjects, setTodoList }
}
