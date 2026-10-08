// Alexa tidies up (canvas 75; Jake, Oct 8: "have alexa review the day and maybe a few days forward and check if
// reminders/events/todos should be merged or cleaned up with a suggested resolution … duplication even today with all
// day events and then date/time events with the same info" → "have alexa proactively say 'i got something for you' …
// merge, dedupe, delete, whatever she recommends would be the best for the family so the calendar is clean and also gets
// stuff done"). Today and the next few days: the same thing twice; a project's step on the calendar twice; an all-day and
// a timed one of the same thing; a reminder stuck for weeks (a time it could go); and — the AI's to judge — the same
// thing in other words. Each a suggestion with its choices; each choice a few small ops, undone from what they changed.
import { addNotes, notesOf } from './event-notes.mjs'

export const TIDY_AHEAD_DAYS = 3
const ZONE = 'America/New_York'
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'our', 'your', 'dr'])

const parts = (iso) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(iso))
  const v = (t) => p.find((x) => x.type === t)?.value
  return { ymd: `${v('year')}-${v('month')}-${v('day')}`, h: Number(v('hour')), m: Number(v('minute')), wd: v('weekday') }
}
const ymdOf = (iso) => parts(iso).ymd
// An all-day one is kept at midnight UTC of its own date (Heather's birthday: 2026-10-08T00:00Z is Oct 8).
const dayOf = (e) => (e.all_day ? String(e.start_time).slice(0, 10) : ymdOf(e.start_time))
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const weekdayOf = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
const monthDay = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Home-time HH:MM on a day, as an instant. */
export function atHome(ymd, h, m = 0) {
  const guess = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)), h, m)
  const p = parts(new Date(guess).toISOString())
  const shown = Date.UTC(Number(p.ymd.slice(0, 4)), Number(p.ymd.slice(5, 7)) - 1, Number(p.ymd.slice(8, 10)), p.h, p.m)
  return new Date(guess - (shown - guess))
}

const clock = (iso) => { const { h, m } = parts(iso); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
const shortClock = (iso) => { const { h, m } = parts(iso); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}` }
const dayWord = (ymd, today) => (ymd === today ? 'today' : ymd === addDays(today, -1) ? 'yesterday' : ymd === addDays(today, 1) ? 'tomorrow' : weekdayOf(ymd))
const norm = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const sig = (t) => new Set(norm(t).split(' ').filter((w) => w.length >= 3 && !STOP.has(w)))
const jaccard = (a, b) => { const x = sig(a); const y = sig(b); const both = [...x].filter((w) => y.has(w)).length; return both / (new Set([...x, ...y]).size || 1) }
const live = (e) => !e.deleted_at && e.status !== 'cancelled'
const timed = (e) => !e.all_day && (e.event_type !== 'reminder' || e.has_due_date)
const pairKey = (kind, ids) => `${kind}:${[...ids].sort().join('+')}`
const keepBoth = { key: 'no', label: 'Keep both', ops: [] }
const leaveIt = { key: 'no', label: 'Leave it', ops: [] }

/** The suggestions the rules see, today and the next few days (the AI's "same thing in other words" is separate). */
export function findTidy({ events, steps = [], projects = [], details = {}, today, kept = [] }) {
  const until = addDays(today, TIDY_AHEAD_DAYS)
  const keptSet = new Set(kept)
  const out = []
  const taken = new Set()
  const add = (s) => {
    if (keptSet.has(s.pair_key) || s.items.some((id) => taken.has(id))) return
    s.items.forEach((id) => taken.add(id))
    out.push(s)
  }
  const inWindow = (e) => { const d = dayOf(e); return d >= addDays(today, -1) && d <= until }
  const all = (events ?? []).filter(live)
  const byId = new Map(all.map((e) => [e.id, e]))

  // 1. A project's step on the calendar twice: its reminder at a time, and its calendar entry on another day or all day.
  for (const st of steps ?? []) {
    if (st.done_at || !st.reminder_event_id || !st.cal_event_id) continue
    const r = byId.get(st.reminder_event_id)
    const c = byId.get(st.cal_event_id)
    if (!r || !c || !timed(r) || !(inWindow(r) || inWindow(c))) continue
    const rDay = ymdOf(r.start_time)
    const cDay = dayOf(c)
    if (!c.all_day && cDay === rDay) continue
    const same = cDay === rDay
    add({
      kind: 'step_double', items: [r.id, c.id], pair_key: pairKey('step_double', [r.id, c.id]),
      says: `“${r.title}” is on ${c.all_day ? 'all day' : `at ${clock(c.start_time)}`} ${dayWord(cDay, today)} and again at ${clock(r.start_time)}${same ? '' : ` ${dayWord(rDay, today)}`}.`,
      fix: same ? `Keep the ${clock(r.start_time)} one; take the all-day off.` : `Keep ${clock(r.start_time)} ${dayWord(rDay, today)}; take ${dayWord(cDay, today)}’s off.`,
      choices: [{ key: 'yes', label: 'Clean it up', ops: [{ op: 'remove', id: c.id }, { op: 'step_day', step_id: st.id, cal_start: rDay }] }, leaveIt],
    })
  }

  // 2. The same thing twice: the same name at the same minute. The later copy folds into the first.
  const groups = new Map()
  for (const e of all.filter((x) => timed(x) && inWindow(x))) {
    const k = `${norm(e.title)}|${new Date(e.start_time).toISOString()}`
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue
    // The first made is kept — or a project's step, whichever came first.
    const [first, ...copies] = [...g].sort((a, b) => Number(Boolean(stepOf(b.id, steps))) - Number(Boolean(stepOf(a.id, steps))) || String(a.created_at).localeCompare(String(b.created_at)))
    for (const copy of copies) {
      const have = notesOf(first.description)
      const extra = notesOf(copy.description).split('\n').map((l) => l.trim()).filter((l) => l && !have.includes(l))
      add({
        kind: 'copy', items: [first.id, copy.id], pair_key: pairKey('copy', [first.id, copy.id]),
        says: `“${first.title}” is on twice, both at ${clock(first.start_time)} ${dayWord(ymdOf(first.start_time), today)}.`,
        fix: 'Keep one — I’ll fold the second into the first.',
        choices: [{ key: 'yes', label: 'Merge them', ops: [...(extra.length ? [{ op: 'notes', id: first.id, add: extra }] : []), { op: 'remove', id: copy.id }] }, keepBoth],
      })
    }
  }

  // 3. An all-day one and a timed one of the same thing on a day: the timed one says more.
  const stepEvents = new Set((steps ?? []).flatMap((st) => [st.reminder_event_id, st.cal_event_id]).filter(Boolean))
  for (const a of all.filter((x) => x.all_day && inWindow(x) && !stepEvents.has(x.id))) {
    const day = dayOf(a)
    const t = all.find((x) => x.id !== a.id && timed(x) && ymdOf(x.start_time) === day && jaccard(a.title, x.title) >= 0.75)
    if (!t) continue
    add({
      kind: 'allday_double', items: [t.id, a.id], pair_key: pairKey('allday_double', [t.id, a.id]),
      says: `“${a.title}” is on all day ${dayWord(day, today)} and at ${clock(t.start_time)} as “${t.title}”.`,
      fix: `Keep the ${clock(t.start_time)} one; take the all-day off.`,
      choices: [{ key: 'yes', label: 'Keep the timed one', ops: [{ op: 'remove', id: a.id }] }, leaveIt],
    })
  }

  // 4. Stuck: a reminder a few days late or more — a time it could go, so it gets done (two at most, oldest first).
  const busy = all.filter((x) => timed(x) && x.event_type !== 'reminder')
  const free = (start, end) => !busy.some((x) => new Date(x.start_time) < end && new Date(x.end_time ?? x.start_time) > start)
  // One time each (two stuck ones were both offered Sunday 10 AM, Oct 8).
  const offered = new Set()
  const open = (s, before, after) => !offered.has(s.getTime()) && free(new Date(s.getTime() - before), new Date(s.getTime() + after))
  const slot = () => {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i)
      const wd = new Date(`${d}T12:00:00Z`).getUTCDay()
      if (wd !== 6 && wd !== 0) continue
      for (const h of [10, 14]) {
        const s = atHome(d, h)
        if (open(s, 30 * 60_000, 90 * 60_000)) { offered.add(s.getTime()); return s }
      }
    }
    for (let i = 1; i <= 5; i++) {
      const s = atHome(addDays(today, i), 19)
      if (open(s, 0, 60 * 60_000)) { offered.add(s.getTime()); return s }
    }
    return null
  }
  const stuck = all.filter((x) => x.event_type === 'reminder' && x.has_due_date && ymdOf(x.start_time) <= addDays(today, -5)
    && !(details[x.id]?.snoozed_until && details[x.id].snoozed_until > today))
    .sort((a, b) => a.start_time.localeCompare(b.start_time)).slice(0, 2)
  for (const r of stuck) {
    const s = slot()
    if (!s) continue
    const len = Math.max(15 * 60_000, new Date(r.end_time ?? r.start_time).getTime() - new Date(r.start_time).getTime()) || 30 * 60_000
    const when = `${weekdayOf(ymdOf(s.toISOString()))} ${shortClock(s.toISOString())}`
    add({
      kind: 'stuck', items: [r.id], pair_key: pairKey('stuck', [r.id]),
      says: `“${r.title}” has been overdue since ${monthDay(ymdOf(r.start_time))}.`,
      fix: `${when} is open — put it there?`,
      choices: [
        { key: 'yes', label: when, ops: [{ op: 'retime', id: r.id, start: s.toISOString(), end: new Date(s.getTime() + len).toISOString() }] },
        { key: 'done', label: 'Done already', ops: [{ op: 'done', id: r.id }] },
        { key: 'drop', label: 'Drop it', ops: [{ op: 'remove', id: r.id }] },
      ],
    })
  }
  return out
}

const stepOf = (id, steps) => (steps ?? []).find((st) => st.reminder_event_id === id && !st.done_at) ?? null

/** The AI's list: the next few days and the open to-dos, one line each with its id. */
export function tidyPrompt(events, { today, steps = [], projects = [] }) {
  const until = addDays(today, TIDY_AHEAD_DAYS)
  const title = new Map((projects ?? []).map((p) => [p.id, p.title]))
  // A step's calendar day is the step itself (its line says it), never a second thing (the first run paired them).
  const stepDays = new Set((steps ?? []).map((st) => st.cal_event_id).filter(Boolean))
  const lines = (events ?? []).filter(live).filter((e) => !stepDays.has(e.id)).filter((e) => {
    const d = dayOf(e)
    return (d >= addDays(today, -1) && d <= until) || (e.event_type === 'reminder' && !e.has_due_date)
  }).slice(0, 140).map((e) => {
    const st = stepOf(e.id, steps)
    const kind = st ? `step of “${title.get(st.project_id) ?? 'a project'}”` : e.event_type === 'reminder' ? 'reminder' : e.all_day ? 'all-day' : 'event'
    const p = parts(e.start_time)
    const when = timed(e) ? `${p.wd} ${monthDay(p.ymd)} ${clock(e.start_time)}` : e.all_day ? `${weekdayOf(dayOf(e)).slice(0, 3)} ${monthDay(dayOf(e))} all day` : 'no time'
    return `[${e.id}] ${kind} · ${when} · ${st?.title ?? e.title}`
  })
  return `You keep a family's calendar and to-do list tidy. Today is ${weekdayOf(today)} ${monthDay(today)}. Below are the next few days and the open to-dos.
Find pairs that are the SAME thing said two ways — one should go (a reminder someone added for something already a project's step; the same appointment entered twice with different words). Not things that are only related: a birthday and a reminder to text that person, a game and packing for it, an event and its drive, a school day and an assembly are different things — leave those alone. Exact same-name, same-time copies are already handled; skip them.
Answer with only a JSON array (empty if none), at most 4: [{"keep": "id", "drop": "id", "why": "a few words"}]

${lines.join('\n')}`
}

/** The AI's pairs, kept only with real ids not already in a suggestion; a project's step is the one kept, at the other's time. */
export function parseTidyAi(text, { events, steps = [], projects = [], today, taken = new Set() }) {
  const s = String(text ?? '')
  const a = s.indexOf('[')
  const b = s.lastIndexOf(']')
  if (a < 0 || b <= a) return []
  let arr
  try { arr = JSON.parse(s.slice(a, b + 1)) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const byId = new Map((events ?? []).filter(live).map((e) => [e.id, e]))
  const title = new Map((projects ?? []).map((p) => [p.id, p.title]))
  const out = []
  for (const p of arr.slice(0, 4)) {
    let keep = byId.get(String(p?.keep ?? ''))
    let drop = byId.get(String(p?.drop ?? ''))
    if (!keep || !drop || keep.id === drop.id || taken.has(keep.id) || taken.has(drop.id)) continue
    if (stepOf(drop.id, steps) && !stepOf(keep.id, steps)) [keep, drop] = [drop, keep]
    // A project's step is never the one that goes (two projects' steps said alike are the projects' to sort), and a step
    // and its own calendar day are one thing already.
    if (stepOf(drop.id, steps) || (steps ?? []).some((st) => st.cal_event_id === drop.id || st.cal_event_id === keep.id)) continue
    const st = stepOf(keep.id, steps)
    const needsTime = !timed(keep) && timed(drop)
    const notes = notesOf(drop.description).split('\n').map((l) => l.trim()).filter((l) => l && !notesOf(keep.description).includes(l))
    const at = timed(drop) ? `${clock(drop.start_time)} ${dayWord(ymdOf(drop.start_time), today)}` : null
    out.push({
      kind: 'same_thing', items: [keep.id, drop.id], pair_key: pairKey('same_thing', [keep.id, drop.id]),
      says: `“${drop.title}”${at ? ` (${at})` : ''} is ${st ? `your ${title.get(st.project_id) ?? ''} project’s step “${st.title}”` : `the same as “${keep.title}”`}.`.replace('your  project', 'a project'),
      fix: st ? `Make it that step${needsTime && at ? `, at ${at}` : ''}.` : `Keep “${keep.title}”; drop the other.`,
      choices: [{
        key: 'yes', label: st ? 'Make it the step' : 'Make it one',
        ops: [
          ...(needsTime ? [{ op: 'retime', id: keep.id, start: new Date(drop.start_time).toISOString(), end: new Date(drop.end_time ?? drop.start_time).toISOString() }] : []),
          ...(notes.length ? [{ op: 'notes', id: keep.id, add: notes }] : []),
          { op: 'remove', id: drop.id },
        ],
      }, keepBoth],
      why: typeof p.why === 'string' ? p.why.slice(0, 120) : null,
    })
    taken.add(keep.id)
    taken.add(drop.id)
  }
  return out
}

const EVENT_FIELDS = ['deleted_at', 'purge_after', 'status', 'start_time', 'end_time', 'has_due_date', 'all_day', 'description']
const pick = (row, fields) => Object.fromEntries(fields.map((f) => [f, row?.[f] ?? null]))

/**
 * A choice's ops on the rows (`state.events`/`state.steps` by id, changed in place): what each row was first (`before`,
 * for Undo) and the patches to write. remove = put away for 30 days (cancelled); retime = a real time; done = done (and
 * its project step ticked); notes = lines added under what's there; step_day = a step's planned day.
 */
export function applyOps(ops, state) {
  const now = state.now ?? new Date().toISOString()
  const before = []
  const patches = []
  const seen = new Set()
  const touch = (table, id, row, fields) => {
    const key = `${table}:${id}`
    if (!seen.has(key)) { seen.add(key); before.push({ table, id, row: pick(row, fields) }) }
  }
  const patch = (table, id, p) => {
    const rows = table === 'events' ? state.events : state.steps
    if (!rows[id]) return
    Object.assign(rows[id], p)
    patches.push({ table, id, patch: p })
  }
  for (const o of ops ?? []) {
    if (o.op === 'step_day') {
      const st = state.steps[o.step_id]
      if (!st) continue
      touch('todo_steps', o.step_id, st, ['cal_start', 'done_at'])
      patch('todo_steps', o.step_id, { cal_start: o.cal_start })
      continue
    }
    const e = state.events[o.id]
    if (!e) continue
    touch('events', o.id, e, EVENT_FIELDS)
    if (o.op === 'remove') patch('events', o.id, { deleted_at: now, purge_after: new Date(Date.parse(now) + 30 * 86_400_000).toISOString(), status: 'cancelled' })
    if (o.op === 'retime') patch('events', o.id, { start_time: o.start, end_time: o.end, has_due_date: true, all_day: false })
    if (o.op === 'notes') patch('events', o.id, { description: addNotes(e.description, o.add) })
    if (o.op === 'done') {
      patch('events', o.id, { status: 'cancelled' })
      const st = Object.values(state.steps ?? {}).find((x) => x.reminder_event_id === o.id && !x.done_at)
      if (st) { touch('todo_steps', st.id, st, ['cal_start', 'done_at']); patch('todo_steps', st.id, { done_at: now }) }
    }
  }
  return { before, patches }
}

/** Undo: every row back to what it was. The patches to write. */
export function undoOps(before, state) {
  const patches = []
  for (const b of before ?? []) {
    const rows = b.table === 'events' ? state.events : state.steps
    if (rows?.[b.id]) Object.assign(rows[b.id], b.row)
    patches.push({ table: b.table, id: b.id, patch: b.row })
  }
  return patches
}

/** Alexa's section: what she has for them, so "what have you got for me?" is answered — and done, one or all. */
export function tidySection(rows) {
  if (!rows?.length) return null
  return `SOMETHING FOR YOU (your tidy-up of the next few days; the wall shows “I have something for you”): “what have you got for me?”, “what do you have for me?”, “what’s up?”, “what’s the something?” mean THESE — not the day’s schedule. Then, or when they say "do them all", walk through these — what you found and what you'd do — and when they answer, call answer_tidy with its id and the choice key (one at a time, or each in turn for "all"). Bring it up yourself at most once a day, at the end of an answer, in a few words.
${rows.map((r) => `- [${r.id}] ${r.says} → ${r.fix} (choices: ${(r.choices ?? []).map((c) => `${c.key} = ${c.label}`).join('; ')})`).join('\n')}`
}
