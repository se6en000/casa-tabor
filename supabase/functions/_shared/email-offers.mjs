// Casa reads the email, phase 2 (canvas row 14, approved 2026-09-30): what "What came in by email?" shows
// and what "Add it" saves. Pure, so it's tested without the network.
import { notesFromEmail } from './event-notes.mjs'

/** A reader decision's status when it's written: fresh offers wait for him; the rest (and old mail) are shadows. */
export function statusFor(decision, receivedAt, now = new Date()) {
  const fresh = receivedAt && now.getTime() - new Date(receivedAt).getTime() <= 3 * 86400e3
  return fresh && ['offer', 'details', 'person'].includes(decision) ? 'waiting' : 'shadow'
}

/** Waiting offers whose every date has passed: nothing left to do. */
export function isExpired(row, today) {
  // Only a day-bound offer passes: a to-do dated the day its email came (the permission slip) still stands.
  const dates = (row.offers ?? []).filter((o) => ['event', 'reminder'].includes(o.kind)).map((o) => o.date).filter(Boolean)
  return row.decision !== 'person' && dates.length > 0 && dates.every((d) => d < today)
}

/** The same offer twice (an email and a forward of it: the Strings Festival) is shown once — the newest. */
export function withoutRepeats(rows) {
  const seen = new Set()
  return (rows ?? []).filter((r) => {
    const key = r.decision === 'person' ? `p:${String(r.person?.who ?? '').toLowerCase()}:${String(r.subject ?? '').toLowerCase().replace(/^(re|fwd?):\s*/gi, '')}`
      : (r.offers ?? []).map((o) => `${o.kind}:${String(o.title ?? '').toLowerCase()}:${o.date ?? ''}`).sort().join('|')
    if (!key || seen.has(key)) return !key
    seen.add(key)
    return true
  })
}

/** Gmail on the web, opened on that message (the mailbox signed in on the device). */
export function gmailLink(gmailMessageId) {
  return `https://mail.google.com/mail/#all/${encodeURIComponent(gmailMessageId)}`
}

const time = (hhmm) => (/^\d{2}:\d{2}$/.test(String(hhmm ?? '')) ? hhmm : null)

/**
 * "Add it": the offer as the card Casa already saves (execute-ai-action), or null when it can't be one.
 * An event needs its date and start; a reminder its date; a to-do only its title; a get & pack line its event.
 */
export function offerToAction(offer, { utcOffset = '-04:00', decision = 'offer', source = null } = {}) {
  const o = offer ?? {}
  // The email's specifics (canvas 65, Jake, Oct 7: "that email context should be added to the notes … specific enough,
  // not summary generic"): a new item's notes with who sent it; an item already there gets the lines added under its own.
  const noteLines = Array.isArray(o.notes) ? o.notes.map((n) => String(n ?? '').trim()).filter(Boolean) : []
  const notes = noteLines.length ? notesFromEmail(noteLines, source) : null
  const withNotes = (action) => (action && notes ? { ...action, args: { ...action.args, notes } } : action)
  const addNotes = (args) => (noteLines.length ? { ...args, notes_add: noteLines } : args)
  const at = (date, hhmm) => `${date}T${hhmm}:00${utcOffset}`
  // What to wear or bring (Oct 1 bugs: Kim K.'s pink shirt and packed lunch were dropped): its event's get & pack lines,
  // added once the event is there — `bring` rides on the action; on its own it's a "bring" action.
  const lines = (list) => (Array.isArray(list) ? list.map((b) => String(b).trim()).filter(Boolean) : [])
  const withBring = (action, list) => (action && lines(list).length ? { ...action, bring: lines(list) } : action)
  // New details for an event already there (the travel receipt's flight times, the festival's place): an
  // update of that event — its time and place only, so nothing he wrote in its notes is replaced.
  if (decision === 'details') {
    if (!o.event_id) return null
    const c = o.changes && typeof o.changes === 'object' ? o.changes : {}
    const args = { id: o.event_id }
    if (o.date && time(c.start)) args.start = at(o.date, c.start)
    if (o.date && time(c.end)) args.end = at(o.date, c.end)
    if (typeof c.place === 'string' && c.place.trim()) args.location = c.place.trim()
    if (Object.keys(args).length > 1 || noteLines.length) return withBring({ tool: 'update_event', args: addNotes(args) }, o.bring)
    return lines(o.bring).length ? { tool: 'bring', args: { event_id: o.event_id }, bring: lines(o.bring) } : null
  }
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null
  if (!title) return null
  const people = Array.isArray(o.people) ? o.people : []
  // Already on the calendar (Jake, Oct 3: "can it tell me that so this doesn't feel like an error … offer to update it
  // with this new information"): an update with only what the email adds, or nothing to do ('already').
  if (o.existing?.event_id) {
    const adds = o.existing.adds ?? {}
    const args = { id: o.existing.event_id }
    if (adds.place) args.location = adds.place
    if (adds.people?.length) args.members_add = adds.people
    if (adds.start && o.date) {
      args.start = at(o.date, adds.start)
      args.end = at(o.date, time(adds.end) ?? `${String(Math.min(23, Number(adds.start.slice(0, 2)) + 1)).padStart(2, '0')}${adds.start.slice(2)}`)
      args.all_day = false
    }
    if (Object.keys(args).length > 1 || noteLines.length) return withBring({ tool: 'update_event', args: addNotes(args) }, adds.bring)
    return lines(adds.bring).length ? { tool: 'bring', args: { event_id: o.existing.event_id }, bring: lines(adds.bring) } : 'already'
  }
  if (o.kind === 'event') {
    const start = time(o.start)
    if (!o.date) return null
    // A date and no time is a day-long thing (a spirit day, a holiday): all day. It made nothing before (Oct 3).
    if (!start) return withBring(withNotes({ tool: 'create_event', args: { title, start: at(o.date, '00:00'), end: at(o.date, '23:59'), all_day: true, event_type: 'event', members: people, ...(o.place ? { location: o.place } : {}) } }), o.bring)
    const end = time(o.end) ?? `${String(Math.min(23, Number(start.slice(0, 2)) + 1)).padStart(2, '0')}${start.slice(2)}`
    return withBring(withNotes({ tool: 'create_event', args: { title, start: at(o.date, start), end: at(o.date, end), event_type: 'event', members: people, ...(o.place ? { location: o.place } : {}) } }), o.bring)
  }
  if (o.kind === 'reminder') {
    if (!o.date) return withNotes({ tool: 'add_todo', args: { title, due: null } })
    const start = time(o.start) ?? '09:00'
    return withNotes({ tool: 'create_event', args: { title, start: at(o.date, start), end: at(o.date, start), event_type: 'reminder', members: people } })
  }
  if (o.kind === 'todo') return withNotes({ tool: 'add_todo', args: { title, due: o.date ?? null } })
  if (o.kind === 'prep') return o.event_id ? { tool: 'add_prep_item', args: { event_id: o.event_id, label: title } } : { tool: 'add_todo', args: { title, due: o.date ?? null } }
  if (o.kind === 'shopping') return { tool: 'add_grocery_items', args: { items: [{ name: title }] } }
  return null
}

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'for', 'at', 'to', 'on', 'in', 'with', 'day', 'days', 'event'])
const words = (t) => new Set(String(t ?? '').toLowerCase().replace(/['’]s\b/g, '').split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)))

/**
 * The calendar event an offered event already is, if any: one on the same day whose name shares the offer's words (all
 * of a short one's, two or more of a longer one's, most of them), the best of them; with what the email adds that it
 * lacks — a place, people, a time for an all-day one, what to wear or bring that its list doesn't have. `events`: { id, title,
 * start_time, all_day, location, people, bring }.
 */
export function alreadyThere(offer, events, timeZone = 'America/New_York') {
  const o = offer ?? {}
  if (o.kind !== 'event' || !o.date || !o.title) return null
  const mine = words(o.title)
  if (!mine.size) return null
  const nyDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const nyClock = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
  const lower = (list) => new Set((list ?? []).map((n) => String(n).toLowerCase()))
  let best = null
  for (const e of events ?? []) {
    const days = e.all_day ? [nyDay(e.start_time), String(e.start_time).slice(0, 10)] : [nyDay(e.start_time)]
    if (!days.includes(o.date)) continue
    const theirs = words(e.title)
    const shared = [...mine].filter((w) => theirs.has(w)).length
    // The name alone (most of its words), or a couple of words plus the same start, place or child (Kim K.'s
    // "Owen's Kindergarten Field Trip to Glazer Hall" is the calendar's "Field Trip: Ballet Palm Beach's … Peter and
    // the Wolf" — the same 9:30 start).
    const byName = shared >= Math.min(2, mine.size) && shared / mine.size >= 0.6
    const sameStart = Boolean(time(o.start)) && !e.all_day && nyClock(e.start_time) === o.start
    const samePlace = Boolean(o.place && e.location) && words(o.place).size > 0 && [...words(o.place)].some((w) => words(e.location).has(w))
    const kids = lower(e.people)
    const samePerson = (Array.isArray(o.people) ? o.people : []).some((n) => kids.has(String(n).toLowerCase()))
    if (!byName && !(shared >= 2 && (sameStart || samePlace || samePerson)) && !(shared >= 1 && sameStart && samePerson)) continue
    const score = shared + (sameStart ? 2 : 0) + (samePlace ? 1 : 0) + (samePerson ? 1 : 0)
    if (!best || score > best.score) best = { e, score }
  }
  if (!best) return null
  const e = best.e
  const adds = {}
  if (typeof o.place === 'string' && o.place.trim() && !(e.location ?? '').trim()) adds.place = o.place.trim()
  const have = new Set((e.people ?? []).map((n) => String(n).toLowerCase()))
  const people = (Array.isArray(o.people) ? o.people : []).filter((n) => !have.has(String(n).toLowerCase()))
  if (people.length) adds.people = people
  if (time(o.start) && e.all_day) {
    adds.start = time(o.start)
    if (time(o.end)) adds.end = time(o.end)
  }
  const onList = new Set((e.bring ?? []).map((b) => String(b).trim().toLowerCase()))
  const bring = (Array.isArray(o.bring) ? o.bring : []).map((b) => String(b).trim()).filter((b) => b && !onList.has(b.toLowerCase()))
  if (bring.length) adds.bring = bring
  return { event_id: e.id, title: e.title, adds }
}

/** A person writing: "Add it" is a to-do to answer them. */
export function personToAction(person) {
  if (!person?.who) return null
  // Short, like a to-do he'd write (2026-09-30: the whole summary made two-line titles): the name without
  // its "(Hope Center ABA)", and a few words of what they want.
  const who = String(person.who).replace(/\s*\([^)]*\)\s*$/, '').trim()
  const words = String(person.wants ?? '').replace(/[.!]+$/, '').split(/\s+/).filter(Boolean)
  let about = ''
  for (const w of words) { if ((about + ' ' + w).trim().length > 36) break; about = (about + ' ' + w).trim() }
  if (about && about.length < String(person.wants ?? '').replace(/[.!]+$/, '').length) about += '…'
  return { tool: 'add_todo', args: { title: about ? `Reply to ${who} — ${about}` : `Reply to ${who}`, due: null } }
}

// Phase 3, learning (design doc, 2026-09-30): "Not needed quiets that kind of email from that sender."

/** The sender's address, lowercased: the display name changes, the address doesn't. */
export function senderOf(from) {
  const m = /<([^>]+)>/.exec(String(from ?? ''))
  return (m ? m[1] : String(from ?? '')).trim().toLowerCase()
}

/** The display name ("Palm Beach Day"), else the address. */
export function senderName(from) {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(String(from ?? ''))
  const name = (m ? m[1] : String(from ?? '')).trim()
  // Some senders write their name in capitals ("SALLY ROZANSKI"); a short acronym (PTO) stays.
  return /[a-z]/.test(name) || !/[A-Z]{2,}\s+[A-Z]{2,}/.test(name) ? name : name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}

/** What it would add: a person writing, new details, or its first offer's kind (event, reminder, todo, …). */
export function kindOf(row) {
  if (row?.decision === 'person') return 'person'
  if (row?.decision === 'details') return 'details'
  return String(row?.offers?.[0]?.kind ?? row?.decision ?? '')
}

const shortDay = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(new Date(iso))

/**
 * Is this offer quiet? The latest of his answers about that sender decides: Not needed to one of the same
 * kind quiets it; Add it (same kind) or That one mattered (any kind) brings the sender back. One he brought
 * back himself is never quieted again. Returns { by, reason } or null.
 */
export function quietFor(row, answered) {
  if (!row || row.feedback === 'mattered' || row.posted_by) return null
  const from = senderOf(row.from_email)
  const kind = kindOf(row)
  const latest = (answered ?? [])
    // A kept-posted line's Not needed teaches nothing; one he brought back (Settings › Email) no longer quiets.
    .filter((a) => a.id !== row.id && a.answered_at && !a.posted_by && !a.unquieted_at && senderOf(a.from_email) === from)
    .filter((a) => a.feedback === 'mattered' || (['added', 'not_needed'].includes(a.status) && kindOf(a) === kind))
    .sort((a, b) => Date.parse(b.answered_at) - Date.parse(a.answered_at))[0]
  if (!latest || latest.feedback === 'mattered' || latest.status !== 'not_needed') return null
  return { by: latest.id, reason: `You said Not needed to one like it from ${senderName(latest.from_email)} on ${shortDay(latest.answered_at)}` }
}

// Keep me posted (canvas row 15, approved 2026-09-30): for a sender who writes both what matters and ads
// (Sally Rozanski: dances and yearbook ads), every email is a line of what it says — nothing skipped or quieted.

/** The rule that keeps this email posted: its sender by address, or a topic the reader said it's about. */
export function keptPostedBy(email, rules, readerPosted) {
  const from = senderOf(email?.from_email)
  const bySender = (rules ?? []).find((r) => r.kind === 'sender' && r.sender && r.sender === from)
  if (bySender) return bySender
  const said = String(readerPosted ?? '').trim().toLowerCase()
  return said ? (rules ?? []).find((r) => r.kind === 'topic' && String(r.topic ?? '').trim().toLowerCase() === said) ?? null : null
}

/** A posted line waits for him for a week; older mail stays a shadow. */
export function postedStatus(receivedAt, now = new Date()) {
  return receivedAt && now.getTime() - new Date(receivedAt).getTime() <= 7 * 86400e3 ? 'posted' : 'shadow'
}

const TAG_WORDS = { event: 'An event', deadline: 'A deadline', todo: 'Something to do', news: 'News', ad: 'An ad', request: 'Asks for something', receipt: 'A receipt' }

/** One line of a kept-posted email: what it says, a plain tag, and whether there is something to add. */
export function postedLine(row) {
  const canAdd = (['offer', 'details'].includes(row?.decision) && (row?.offers ?? []).length > 0) || (row?.decision === 'person' && !!row?.person)
  return { gist: String(row?.gist || row?.subject || '').trim(), tag: TAG_WORDS[row?.gist_tag] ?? null, can_add: canAdd }
}

/** What he typed in Settings › Email: an address keeps that sender; anything else is a topic. */
export function ruleFromText(text) {
  const t = String(text ?? '').trim()
  if (!t) return null
  if (/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(t)) return { kind: 'sender', sender: t.toLowerCase(), topic: null, label: t.toLowerCase() }
  return { kind: 'topic', sender: null, topic: t, label: t }
}
