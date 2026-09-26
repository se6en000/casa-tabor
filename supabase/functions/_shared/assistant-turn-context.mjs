// A turn in a conversation, understood in its context (Jake, 2026-09-26: "it asks
// questions and then loses context"; "handle the gist, not the exact phrasing").
//
// Before anything else reads the latest message, one small model call looks at the
// conversation, the draft waiting for a yes, and the calendar items the conversation is
// about, and says what the turn does:
//   revise_draft  — it changes or adds to the draft ("it's at…", "make it 4", "add Liv too")
//   cancel_draft  — it calls the draft off
//   confirm_draft — it says yes to the draft
//   new_turn      — anything else, rewritten as a complete request with every reference
//                   ("the first one", "her", "and Tuesday?") spelled out, plus whether it
//                   only asks for information, and which listed item it's about.
// The meaning comes from the model, never from phrase lists; this file only builds the
// prompt, reads the answer and applies a draft's changes. Pure, so it's tested directly.

const DRAFT_TOOLS = new Set(['create_event', 'update_event'])
const MAX_HISTORY = 12
const MAX_REFERENTS = 12

/** Whether there's a turn to read: the latest message is the person's, with words in it. */
export function hasTurnToRead(messages) {
  const last = Array.isArray(messages) ? messages.at(-1) : null
  return last?.role === 'user' && String(last.content ?? '').trim().length > 0
}

/** Whether the turn continues a conversation (anything said before it, or a draft open). */
export function continuesConversation(messages, pendingAction) {
  const list = Array.isArray(messages) ? messages : []
  return Boolean(pendingAction?.tool) || list.slice(0, -1).some((m) => m?.role === 'assistant' && String(m.content ?? '').trim())
}

/** The draft the turn could revise: a single calendar add or change waiting for a yes. */
export function openDraft(pendingAction) {
  if (!pendingAction || !DRAFT_TOOLS.has(pendingAction.tool) || !pendingAction.args || typeof pendingAction.args !== 'object') return null
  return { tool: pendingAction.tool, args: pendingAction.args }
}

/** The calendar items the conversation is about, in the order they were last named. */
export function referentIds(conversationState, pendingAction) {
  const ids = []
  const push = (id) => { if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id) }
  const state = conversationState ?? {}
  if (Array.isArray(state.eventIds)) state.eventIds.forEach(push)
  if (Array.isArray(state.candidateEvents)) state.candidateEvents.forEach((c) => push(c?.id))
  push(state.activeEventId)
  push(pendingAction?.args?.id)
  return ids.slice(0, MAX_REFERENTS)
}

function offsetMinutes(utcOffset) {
  const m = String(utcOffset ?? '-04:00').match(/^([+-])(\d{2}):(\d{2})$/)
  return m ? (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3])) : -240
}

/** Local wall-clock parts of an instant. */
function localParts(iso, utcOffset) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const d = new Date(t + offsetMinutes(utcOffset) * 60e3)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  return {
    date: d.toISOString().slice(0, 10),
    hhmm: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    weekday: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    spoken: `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`,
  }
}

/** An instant for a local date and time, written with the family's offset. */
function localIso(date, hhmm, utcOffset) {
  const off = String(utcOffset ?? '-04:00')
  return `${date}T${hhmm}:00${/^[+-]\d{2}:\d{2}$/.test(off) ? off : '-04:00'}`
}

function describeDraft(draft, utcOffset) {
  const a = draft.args
  const s = a.start ? localParts(a.start, utcOffset) : null
  const e = a.end ? localParts(a.end, utcOffset) : null
  const people = [...(a.members ?? []), ...(a.members_add ?? [])]
  return [
    draft.tool === 'create_event' ? 'ADD a new item to the calendar' : `CHANGE an existing calendar item (id ${a.id ?? '?'})`,
    a.title ? `title: ${a.title}` : null,
    s ? `when: ${s.weekday} ${s.date}, ${a.all_day ? 'all day' : `${s.spoken}${e ? ` to ${e.spoken}` : ''}`}` : null,
    a.location || a.location_name || a.address ? `place: ${a.location ?? a.location_name ?? a.address}` : null,
    people.length ? `people: ${people.join(', ')}` : null,
    a.event_type ? `kind: ${a.event_type}` : null,
    a.notes ? `notes: ${a.notes}` : null,
  ].filter(Boolean).join('\n  ')
}

function describeReferent(e, i, utcOffset) {
  const s = localParts(e.start_time, utcOffset)
  const end = localParts(e.end_time, utcOffset)
  const when = s ? (e.all_day ? `${s.weekday} ${s.date}, all day` : `${s.weekday} ${s.date}, ${s.spoken}${end ? ` to ${end.spoken}` : ''}`) : ''
  return `${i >= 0 ? `${i + 1}.` : '-'} [${e.id}] ${e.title} — ${when}` +
    (e.people?.length ? ` — people: ${e.people.join(', ')}` : '') +
    (e.drivers?.length ? ` — drivers: ${e.drivers.join(', ')}` : '') +
    (e.place ? ` — place: ${e.place}` : '') +
    (e.event_type === 'reminder' ? ' — (a reminder)' : '')
}

/** The next two weeks, day by day, so a weekday is looked up, never computed. */
export function dayTable(nowIso, utcOffset, days = 15) {
  const today = localParts(nowIso ?? new Date().toISOString(), utcOffset)
  if (!today) return ''
  const base = Date.parse(`${today.date}T12:00:00Z`)
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(base + i * 86400e3)
    const name = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
    return `${d.toISOString().slice(0, 10)} ${name}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''}`
  }).join('\n')
}

/** The one prompt that reads a turn in its context. */
export function buildTurnPrompt({ messages, draft, referents, upcoming, family, nowLine, utcOffset, nowIso }) {
  const history = (Array.isArray(messages) ? messages : []).slice(-MAX_HISTORY)
  const latest = history.at(-1)
  const before = history.slice(0, -1)
  const aboutIds = new Set((referents ?? []).map((e) => e.id))
  const rest = (upcoming ?? []).filter((e) => !aboutIds.has(e.id))
  return `You work out what a family member's latest message to their home assistant, Casa, means — in the context of the conversation and the family calendar. You don't answer it.

Now: ${nowLine}
Days (look dates up here; a weekday means its next date in this list):
${dayTable(nowIso, utcOffset)}
Family: ${(family ?? []).map((m) => (m.role ? `${m.name} (${m.role})` : m.name)).join(', ')}
${draft ? `\nWAITING FOR THE PERSON'S YES (a draft, not saved yet):\n  ${describeDraft(draft, utcOffset)}\n` : ''}${referents?.length ? `\nCALENDAR ITEMS THE CONVERSATION IS ABOUT (numbered in the order Casa last listed or named them):\n${referents.map((e, i) => describeReferent(e, i, utcOffset)).join('\n')}\n` : ''}${rest.length ? `\nOTHER UPCOMING ITEMS ON THE CALENDAR:\n${rest.map((e) => describeReferent(e, -1, utcOffset)).join('\n')}\n` : ''}
CONVERSATION SO FAR:
${before.map((m) => `${m.role === 'user' ? 'PERSON' : 'CASA'}: ${String(m.content ?? '').slice(0, 600)}`).join('\n') || '(nothing yet)'}

LATEST FROM THE PERSON: "${String(latest?.content ?? '')}"

First, "closes_draft": true if the person drops or calls off the draft above (only when there is one) — whether or not they also want something else in the same message.

Then the act — what they want (besides dropping the draft). Decide in this order: is it about the draft? Is it about the family's plans — anything on the calendar, rides, who's going, who drives, what's coming up? Then it's "add", "change", "clarify" or "question". Only if neither, "other".
- "none": nothing else (they only called the draft off).
- "revise_draft": changes or adds something to the draft above, which stays the same item — give "changes". If they say the draft is about the wrong item, that isn't a revision: it's a "change" (or "add") for the right one.
- "confirm_draft": says yes / go ahead to the draft and nothing else.
- "add": asks Casa to put something new on the calendar (an event or a reminder) — give "new_item".
- "change": asks or suggests changing one thing already on the calendar — its time, day, length, place, title, who's going or who drives — give "event_id", "identified_by" and "changes". (Deleting is "other".) When the person corrects which item they meant, carry over the change they asked for before.
- "clarify": asks to change something, but more than one calendar item fits what they said (for example several on the day they named, and nothing in the message tells them apart) — give "candidates" (their ids) and "question" (asking which, naming them). Never pick one when it's unclear; "my" or "the" doesn't make it clear.
- "question": asks for information about the family's plans — give "event_id" if it's about one calendar item.
- "other": deleting things, and anything not about the family's plans — groceries, recipes, contacts, general knowledge, small talk.
Asking whether someone could take, drive, join or move a calendar item is suggesting a change: "change".

"standalone": the latest message the way the person would say it if they had said everything at once — short, plain and complete, making sense with no conversation before it. A question stays a question; a request starts with what to do, then the thing itself in a few words, then who, when and where. Resolve every reference — pronouns, positions in a list Casa gave, "that one"-style pointers, and shortened follow-ups that repeat the previous question or request with a different day, person or item — to the actual titles, names, days and times. Change only what's needed to make it stand on its own; if it already does, return it word for word. Keep the person's meaning exactly: don't answer it, and don't add anything they didn't say or clearly mean.
"is_question": true if it only asks for information — who, when, where, what, or whether something is so. A change suggested in question form (could someone else…, what if…, can we … instead) is a request to change, not a question: it becomes a card the person still has to say yes to.
"event_id": the id in [brackets] of the one calendar item the message is about, or null. Only ids listed above.
"identified_by" (change): how the message (with the conversation) points to that item — "name" (says its name or a clear part of it), "conversation" (it's the item just being talked about), "time" (says its time), "kind" (says what kind of thing it is, and only one thing that day is that kind), or "day" (only says the day).
"new_item" (add): {"title": a short calendar name for the thing itself (not the request), "date": "YYYY-MM-DD", "start": "HH:MM" or null, "end": "HH:MM" or null, "duration_minutes": number or null, "all_day": boolean, "place": string or null, "people": [family names it's for], "kind": "event" | "reminder"}. Leave date or start null if the person didn't give them — never guess.
"changes" (revise_draft or change): only what changes — "title", "date" ("YYYY-MM-DD"), "start"/"end" ("HH:MM", 24-hour, local), "duration_minutes", "place", "add_people", "remove_people", "all_day", "notes", "kind" ("event" | "reminder"), "driver" (the family member who'll drive).
Dates: always take them from the Days list. Times: 24-hour local; read a bare hour as the sensible part of the day for that kind of thing, in the context of any time already set. A new start without an end keeps the length.

Return only JSON: {"closes_draft": true|false, "act": "...", "standalone": "...", "is_question": true|false, "event_id": "..." or null, "identified_by": "..." or null, "new_item": {...} or null, "changes": {...} or null, "candidates": [ids] or null, "question": "..." or null}`
}

const ACTS = ['none', 'revise_draft', 'cancel_draft', 'confirm_draft', 'add', 'change', 'clarify', 'question', 'other']

/** The model's answer, checked: anything unusable means "go on with the turn as it was said". */
export function readTurnResolution(raw, { draft, knownIds } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {}
  let act = ACTS.includes(r.act) ? r.act : 'other'
  const standalone = typeof r.standalone === 'string' && r.standalone.trim() ? r.standalone.trim().slice(0, 600) : null
  const eventId = typeof r.event_id === 'string' && (knownIds ?? []).includes(r.event_id) ? r.event_id : null
  const changes = r.changes && typeof r.changes === 'object' && Object.keys(r.changes).length > 0 ? r.changes : (r.draft_changes && typeof r.draft_changes === 'object' && Object.keys(r.draft_changes).length > 0 ? r.draft_changes : null)
  const newItem = r.new_item && typeof r.new_item === 'object' ? r.new_item : null
  // Dropping the draft is its own yes/no; the act is whatever else the turn wants.
  const closesDraft = Boolean(draft) && (r.closes_draft === true || act === 'cancel_draft')
  if (act === 'cancel_draft') act = 'none'
  if (act === 'none' && !closesDraft) act = 'other'
  // Each act needs what it acts on; without it the turn goes on to the full assistant.
  if (['revise_draft', 'confirm_draft'].includes(act) && (!draft || closesDraft)) act = 'other'
  if (act === 'revise_draft' && !changes) act = 'other'
  if (act === 'change' && (!eventId || !changes)) act = 'other'
  if (act === 'add' && !newItem) act = 'other'
  const candidates = Array.isArray(r.candidates) ? r.candidates.filter((id) => (knownIds ?? []).includes(id)).slice(0, 6) : []
  const question = typeof r.question === 'string' && r.question.trim() ? r.question.trim().slice(0, 400) : null
  if (act === 'clarify' && (candidates.length < 2 || !question)) act = 'other'
  const identifiedBy = ['name', 'conversation', 'time', 'kind', 'day'].includes(r.identified_by) ? r.identified_by : null
  return { act, closesDraft, identifiedBy, standalone, isQuestion: act === 'question' || (r.is_question === true && act !== 'change' && act !== 'add' && act !== 'none'), eventId, draftChanges: changes, newItem, candidates, clarifyQuestion: question }
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** The draft with the turn's changes applied; the time stays in the family's clock. */
export function applyDraftChanges(draft, changes, { utcOffset, familyNames } = {}) {
  const args = { ...draft.args }
  const c = changes ?? {}
  const start = args.start ? localParts(args.start, utcOffset) : null
  const end = args.end ? localParts(args.end, utcOffset) : null
  const lengthMin = args.start && args.end ? Math.max(0, (Date.parse(args.end) - Date.parse(args.start)) / 60e3) : 60

  if (typeof c.title === 'string' && c.title.trim()) args.title = c.title.trim()
  if (typeof c.notes === 'string') args.notes = c.notes.trim()
  if (c.kind === 'event' || c.kind === 'reminder') args.event_type = c.kind
  if (typeof c.place === 'string' && c.place.trim()) args.location = c.place.trim()

  const date = typeof c.date === 'string' && DATE.test(c.date) ? c.date : start?.date
  const newStart = typeof c.start === 'string' && HHMM.test(c.start) ? c.start.padStart(5, '0') : start?.hhmm
  if (c.all_day === true) {
    args.all_day = true
    if (date) {
      args.start = localIso(date, '00:00', utcOffset)
      args.end = new Date(Date.parse(args.start) + 24 * 3600e3).toISOString()
    }
  } else if (date && newStart && (c.date || c.start || c.end || c.duration_minutes || c.all_day === false)) {
    if (c.all_day === false) args.all_day = false
    args.start = localIso(date, newStart, utcOffset)
    const minutes = Number.isFinite(Number(c.duration_minutes)) && Number(c.duration_minutes) > 0
      ? Number(c.duration_minutes)
      : typeof c.end === 'string' && HHMM.test(c.end)
        ? null
        : lengthMin || 60
    args.end = minutes != null
      ? new Date(Date.parse(args.start) + minutes * 60e3).toISOString()
      : localIso(date, c.end.padStart(5, '0'), utcOffset)
    if (Date.parse(args.end) <= Date.parse(args.start)) args.end = new Date(Date.parse(args.start) + (lengthMin || 60) * 60e3).toISOString()
  }
  void end

  // People: names as the family writes them; the create call resolves names to members.
  const known = (name) => (familyNames ?? []).find((n) => n.toLowerCase() === String(name).trim().toLowerCase()) ?? String(name).trim()
  const add = Array.isArray(c.add_people) ? c.add_people.map(known).filter(Boolean) : []
  const remove = new Set((Array.isArray(c.remove_people) ? c.remove_people : []).map((n) => String(n).trim().toLowerCase()))
  if (draft.tool === 'create_event') {
    const members = [...(args.members ?? [])]
    for (const n of add) if (!members.some((m) => String(m).toLowerCase() === n.toLowerCase())) members.push(n)
    args.members = members.filter((m) => !remove.has(String(m).toLowerCase()))
  } else {
    if (add.length) args.members_add = [...new Set([...(args.members_add ?? []), ...add])]
    if (remove.size) args.members_remove = [...new Set([...(args.members_remove ?? []), ...[...remove]])]
  }
  // A new day isn't what the first message's date evidence covered; the yes supplies its own.
  if (c.date || c.all_day === true) delete args.temporal_provenance
  return args
}

/** A new calendar item from what the person said — or null when a day or time is missing (the full assistant asks). */
export function newItemArgs(item, { utcOffset, familyNames } = {}) {
  const title = typeof item?.title === 'string' ? item.title.trim() : ''
  const date = typeof item?.date === 'string' && DATE.test(item.date) ? item.date : null
  const start = typeof item?.start === 'string' && HHMM.test(item.start) ? item.start.padStart(5, '0') : null
  if (!title || !date || (!start && item?.all_day !== true)) return null
  const kind = item.kind === 'reminder' ? 'reminder' : 'event'
  const draft = { tool: 'create_event', args: { title, start: localIso(date, start ?? '00:00', utcOffset), end: localIso(date, start ?? '00:00', utcOffset), members: [], event_type: kind } }
  const minutes = Number(item.duration_minutes) > 0 ? Number(item.duration_minutes) : kind === 'reminder' ? 15 : 60
  draft.args.end = new Date(Date.parse(draft.args.start) + minutes * 60e3).toISOString()
  const args = applyDraftChanges(draft, {
    ...(item.all_day === true ? { all_day: true } : {}),
    ...(typeof item.end === 'string' && HHMM.test(item.end) ? { end: item.end } : {}),
    ...(typeof item.place === 'string' && item.place.trim() ? { place: item.place } : {}),
    add_people: Array.isArray(item.people) ? item.people : [],
  }, { utcOffset, familyNames })
  return args
}

/** A change to an item on the calendar, as the calendar's own update call takes it. */
export function changeArgs(event, changes, { utcOffset, familyNames } = {}) {
  const base = { tool: 'update_event', args: { id: event.id, start: event.start_time, end: event.end_time } }
  const applied = applyDraftChanges(base, changes, { utcOffset, familyNames })
  const args = { id: event.id, ...(event.updated_at ? { expected_updated_at: event.updated_at } : {}) }
  if (applied.start !== event.start_time || applied.end !== event.end_time) Object.assign(args, { start: applied.start, end: applied.end })
  for (const key of ['title', 'location', 'notes', 'all_day', 'members_add', 'members_remove']) if (applied[key] !== undefined) args[key] = applied[key]
  if (typeof changes?.driver === 'string' && changes.driver.trim()) {
    const driver = changes.driver.trim()
    args.driver_name = (familyNames ?? []).find((n) => n.toLowerCase() === driver.toLowerCase()) ?? driver
  }
  return Object.keys(args).some((k) => k !== 'id' && k !== 'expected_updated_at') ? args : null
}

/**
 * Whether a change only named a day that has more than one item on it — then Casa asks
 * which, listing them, instead of picking one. Evidence-based, not wording-based.
 */
export function sameDayChoices(resolution, target, sameDay) {
  if (resolution?.act !== 'change' || !target) return null
  if (resolution.identifiedBy && resolution.identifiedBy !== 'day') return null
  const choices = (sameDay ?? []).filter((e) => !e.all_day && e.event_type !== 'reminder')
  return choices.length >= 2 && choices.some((e) => e.id === target.id) ? choices.slice(0, 6) : null
}
