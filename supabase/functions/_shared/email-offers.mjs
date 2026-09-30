// Casa reads the email, phase 2 (canvas row 14, approved 2026-09-30): what "What came in by email?" shows
// and what "Add it" saves. Pure, so it's tested without the network.

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
export function offerToAction(offer, { utcOffset = '-04:00', decision = 'offer' } = {}) {
  const o = offer ?? {}
  const at = (date, hhmm) => `${date}T${hhmm}:00${utcOffset}`
  // New details for an event already there (the travel receipt's flight times, the festival's place): an
  // update of that event — its time and place only, so nothing he wrote in its notes is replaced.
  if (decision === 'details') {
    if (!o.event_id) return null
    const c = o.changes && typeof o.changes === 'object' ? o.changes : {}
    const args = { id: o.event_id }
    if (o.date && time(c.start)) args.start = at(o.date, c.start)
    if (o.date && time(c.end)) args.end = at(o.date, c.end)
    if (typeof c.place === 'string' && c.place.trim()) args.location = c.place.trim()
    return Object.keys(args).length > 1 ? { tool: 'update_event', args } : null
  }
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null
  if (!title) return null
  const people = Array.isArray(o.people) ? o.people : []
  if (o.kind === 'event') {
    const start = time(o.start)
    if (!o.date || !start) return null
    const end = time(o.end) ?? `${String(Math.min(23, Number(start.slice(0, 2)) + 1)).padStart(2, '0')}${start.slice(2)}`
    return { tool: 'create_event', args: { title, start: at(o.date, start), end: at(o.date, end), event_type: 'event', members: people, ...(o.place ? { location: o.place } : {}) } }
  }
  if (o.kind === 'reminder') {
    if (!o.date) return { tool: 'add_todo', args: { title, due: null } }
    const start = time(o.start) ?? '09:00'
    return { tool: 'create_event', args: { title, start: at(o.date, start), end: at(o.date, start), event_type: 'reminder', members: people } }
  }
  if (o.kind === 'todo') return { tool: 'add_todo', args: { title, due: o.date ?? null } }
  if (o.kind === 'prep') return o.event_id ? { tool: 'add_prep_item', args: { event_id: o.event_id, label: title } } : { tool: 'add_todo', args: { title, due: o.date ?? null } }
  if (o.kind === 'shopping') return { tool: 'add_grocery_items', args: { items: [{ name: title }] } }
  return null
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
