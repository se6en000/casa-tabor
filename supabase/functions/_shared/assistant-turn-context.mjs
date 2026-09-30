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

First, was it said to Casa at all? The wall's microphone stays open between turns, so it can hear the room. "aside": the words clearly weren't said to Casa — the person talking to someone else ("Owen get your shoes on", "honey where are my keys"), a TV or radio, a half-sentence to themselves. It's about who the words are said to, not their subject: a new subject — news about someone in the family, a change of mind ("Emme wants to be a witch now"), something unrelated to what Casa just said — is still said to Casa. Only when that's clear; anything that could be for Casa is not an aside. Telling Casa something — a thanks, a fact, a need ("thanks, oh and we're out of milk btw", "we're low on eggs", "Kelly's running late") — is talking to Casa, never an aside; so is anything about the family's plans, groceries or home. For an aside, "closes_draft" is false and nothing else is needed.

Then "closes_draft": true if the person drops or calls off the draft above (only when there is one) — whether or not they also want something else in the same message.

Then the act — what they want (besides dropping the draft). Decide in this order: is it about the draft? Is it about the family's plans — anything on the calendar, rides, who's going, who drives, what's coming up? Then it's "add", "change", "clarify" or "question". Only if neither, "other".
- "aside": see above.
- "none": nothing else (they only called the draft off).
- "revise_draft": changes or adds something to the draft above, which stays the same item — give "changes". If they say the draft is about the wrong item, that isn't a revision: it's a "change" (or "add") for the right one.
- "confirm_draft": says yes / go ahead to the draft and nothing else.
- "add": asks Casa to put something new on the calendar (an event or a reminder) — give "new_item".
- "change": asks or suggests changing one thing already on the calendar — its time, day, length, place, title, who's going or who drives — give "event_id" and "changes". (Deleting is "other".) When the person corrects which item they meant, carry over the change they asked for before.
- "clarify": asks to change something, but more than one calendar item fits what they said (for example several on the day they named, and nothing in the message tells them apart) — give "candidates" (their ids) and "question" (asking which, naming them). Never pick one when it's unclear; "my" or "the" doesn't make it clear.
- "question": (asking what's on the Coming up list, or about gift ideas, is "other") asks for information about the family's plans — give "event_id" if it's about one calendar item, and "answerable": true when everything needed to answer is in the calendar items listed above (false if it needs anything else — older things, emails, contacts, the web).
- "other": deleting things, and anything not about the family's plans — groceries, recipes, contacts, gift ideas, the Coming up list and its rules, general knowledge, small talk.
Asking whether someone could take, drive, join or move a calendar item is suggesting a change: "change".

"standalone": the latest message the way the person would say it if they had said everything at once — short, plain and complete, making sense with no conversation before it. A question stays a question; a request starts with what to do, then the thing itself in a few words, then who, when and where. Resolve every reference — pronouns, positions in a list Casa gave, "that one"-style pointers, and shortened follow-ups that repeat the previous question or request with a different day, person or item — to the actual titles, names, days and times. Change only what's needed to make it stand on its own; if it already does, return it word for word. Keep the person's meaning exactly: don't answer it, and don't add anything they didn't say or clearly mean.
"is_question": true if it only asks for information — who, when, where, what, or whether something is so. A change suggested in question form (could someone else…, what if…, can we … instead) is a request to change, not a question: it becomes a card the person still has to say yes to.
"event_id": the id in [brackets] of the one calendar item the message is about, or null. Only ids listed above.
"new_item" (add): {"title": a short calendar name for the thing itself (not the request), "date": "YYYY-MM-DD", "date_basis": how they gave the day — "weekday" (only a weekday name), "next_week" (a weekday in the week after this one, e.g. said "next week"), "date" (a calendar date), "relative" (today, tomorrow, in N days), "start": "HH:MM" or null, "end": "HH:MM" or null, "duration_minutes": number or null, "all_day": boolean, "place": string or null, "people": [family names it's for], "kind": "event" | "reminder"}. Leave date or start null if the person didn't give them — never guess.
"changes" (revise_draft or change): only what changes — "title", "date" ("YYYY-MM-DD", with "date_basis" as above), "start"/"end" ("HH:MM", 24-hour, local), "duration_minutes", "place", "add_people", "remove_people", "all_day", "notes", "kind" ("event" | "reminder"), "driver" (the family member who'll drive).
Dates: always take them from the Days list. In scheduling, pushing or moving something back (or out) means later; moving it up (or forward, or earlier) means earlier. Times: 24-hour local; read a bare hour as the sensible part of the day for that kind of thing, in the context of any time already set. A new start without an end keeps the length.

Return only JSON: {"closes_draft": true|false, "act": "...", "standalone": "...", "is_question": true|false, "event_id": "..." or null "new_item": {...} or null, "changes": {...} or null, "candidates": [ids] or null, "question": "..." or null, "answerable": true|false}`
}

const ACTS = ['aside', 'none', 'revise_draft', 'cancel_draft', 'confirm_draft', 'add', 'change', 'clarify', 'question', 'other']

/** The model's answer, checked: anything unusable means "go on with the turn as it was said". */
/** @param {unknown} raw @param {{ draft?: object | null, knownIds?: string[], pendingChange?: boolean }} [options] */
export function readTurnResolution(raw, { draft = null, knownIds = [], pendingChange = false } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {}
  let act = ACTS.includes(r.act) ? r.act : 'other'
  const standalone = typeof r.standalone === 'string' && r.standalone.trim() ? r.standalone.trim().slice(0, 600) : null
  const eventId = typeof r.event_id === 'string' && (knownIds ?? []).includes(r.event_id) ? r.event_id : null
  const changes = r.changes && typeof r.changes === 'object' && Object.keys(r.changes).length > 0 ? r.changes : (r.draft_changes && typeof r.draft_changes === 'object' && Object.keys(r.draft_changes).length > 0 ? r.draft_changes : null)
  const newItem = r.new_item && typeof r.new_item === 'object' ? r.new_item : null
  // Dropping the draft is its own yes/no; the act is whatever else the turn wants. Words not
  // said to Casa (an aside) never touch the draft.
  const closesDraft = act !== 'aside' && Boolean(draft) && (r.closes_draft === true || act === 'cancel_draft')
  if (act === 'cancel_draft') act = 'none'
  if (act === 'none' && !closesDraft) act = 'other'
  // Each act needs what it acts on; without it the turn goes on to the full assistant.
  if (['revise_draft', 'confirm_draft'].includes(act) && (!draft || closesDraft)) act = 'other'
  if (act === 'revise_draft' && !changes) act = 'other'
  // Answering "which one?" names only the item; the change asked for before is still pending.
  if (act === 'change' && (!eventId || (!changes && !pendingChange))) act = 'other'
  if (act === 'add' && !newItem) act = 'other'
  const candidates = Array.isArray(r.candidates) ? r.candidates.filter((id) => (knownIds ?? []).includes(id)).slice(0, 6) : []
  const question = typeof r.question === 'string' && r.question.trim() ? r.question.trim().slice(0, 400) : null
  if (act === 'clarify' && (candidates.length < 2 || !question)) act = 'other'
  const answerable = act === 'question' && r.answerable === true
  return { act, closesDraft, answerable, standalone, isQuestion: act === 'question' || (r.is_question === true && act !== 'change' && act !== 'add' && act !== 'none' && act !== 'aside'), eventId, draftChanges: changes, newItem, candidates, clarifyQuestion: question }
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

const TITLE_STOP = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'event', 'appointment', 'meeting', 'reminder', 'drop', 'pick', 'off', 'day', 'time'])
const words = (text) => String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !TITLE_STOP.has(w))

/**
 * Whether the person's own words point at this calendar item: a real word of its title,
 * its time, or it's one of the items the conversation was just about. Checked by the
 * server — never taken from the model's say-so.
 */
export function wordsPointTo(event, latestText, conversationIds, utcOffset) {
  if ((conversationIds ?? []).includes(event.id)) return true
  const said = String(latestText ?? '').toLowerCase()
  const saidWords = new Set(words(said))
  if (words(event.title).some((w) => saidWords.has(w))) return true
  const t = localParts(event.start_time, utcOffset)
  if (!t || event.all_day) return false
  const [h, m] = t.hhmm.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  const forms = m ? [`${h12}:${String(m).padStart(2, '0')}`, t.hhmm] : [`${h12} ?(am|pm|o'?clock)`, `${h12}:00`, t.hhmm, `at ${h12}\\b`]
  return forms.some((f) => new RegExp(`\\b${f}`, 'i').test(said))
}

/**
 * A change whose item the person's words don't point to, on a day with more than one
 * item: Casa asks which (listing them) instead of picking one.
 */
export function sameDayChoices(target, sameDay, { latestText, conversationIds, utcOffset } = {}) {
  if (!target || wordsPointTo(target, latestText, conversationIds, utcOffset)) return null
  const choices = (sameDay ?? []).filter((e) => !e.all_day && e.event_type !== 'reminder')
  return choices.length >= 2 && choices.some((e) => e.id === target.id) ? choices.slice(0, 6) : null
}

/**
 * The day the person meant, settled by the server: a bare weekday is the next one on the
 * calendar (today counts), never a later one the model drifted to.
 */
export function settleDate(date, basis, nowIso, utcOffset) {
  if (typeof date !== 'string' || !DATE.test(date) || basis !== 'weekday') return date
  const today = localParts(nowIso ?? new Date().toISOString(), utcOffset)?.date
  if (!today) return date
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const base = Date.parse(`${today}T12:00:00Z`)
  for (let i = 0; i < 7; i++) {
    const d = new Date(base + i * 86400e3)
    if (d.getUTCDay() === weekday) return d.toISOString().slice(0, 10)
  }
  return date
}

/**
 * Answering Casa's "which one?": the change asked for before is kept, applied to the item
 * picked; a time or day in the answer that is just the item's own (how they picked it) is
 * not a new time.
 */
export function carryOverChange(storedChanges, answerChanges, target, utcOffset) {
  const stored = storedChanges && typeof storedChanges === 'object' ? storedChanges : {}
  const answer = { ...(answerChanges && typeof answerChanges === 'object' ? answerChanges : {}) }
  const own = localParts(target?.start_time, utcOffset)
  if (own && answer.start === own.hhmm) delete answer.start
  if (own && answer.date === own.date) delete answer.date
  const merged = { ...stored, ...answer }
  return Object.keys(merged).length > 0 ? merged : null
}

/**
 * The rules' answer to a question, from the calendar — with the draft on screen in view, so
 * "does that clash with anything" is about the item being added, not a search for a saved one
 * (P3.15, found in the thinking test 2026-09-26).
 */
export function buildAnswerPrompt({ question, calendarLines, nowLine, draft, utcOffset, overlaps = [] }) {
  const onScreen = draft
    ? `\nON SCREEN, NOT SAVED YET: ${describeDraft(draft, utcOffset).replace(/\n\s+/g, '; ')}\n("that", "it" or "the appointment" can mean the draft.)\nOverlapping the draft's time (worked out exactly): ${overlaps.length ? overlaps.join(', ') : 'nothing'}.\n`
    : ''
  return `You are Casa, a family's home assistant. Answer the question from the family calendar below in plain spoken sentences, local times — short, but name every item a list question asks for. Items are in order of relevance: the first is what the question is about when it's about one thing. If the calendar doesn't say, say so plainly. Don't propose or make any change.
Now: ${nowLine}
Calendar:
${calendarLines.join('\n')}
${onScreen}Question: ${question}
Never say the [ids] out loud. Return JSON {"answer": "...", "mentioned": [the ids of the calendar items your answer names, in the order it names them], "calendar_says": false if the calendar above doesn't hold what was asked (a drive time, the weather, anything outside it), else true}`
}

/** The timed calendar items whose time overlaps the draft's (all-day items don't clash). */
export function draftOverlaps(draft, events) {
  const start = Date.parse(draft?.args?.start ?? '')
  const end = Date.parse(draft?.args?.end ?? '') || start + 60 * 60e3
  if (!Number.isFinite(start) || draft?.args?.all_day) return []
  return (events ?? []).filter((e) => !e.all_day && e.id !== draft.args.id && Date.parse(e.start_time) < end && Date.parse(e.end_time) > start)
}
