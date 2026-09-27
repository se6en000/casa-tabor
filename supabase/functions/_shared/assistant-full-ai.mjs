// Version D of Casa's assistant (P3.16, Jake 2026-09-26: "give the full AI a real shot"):
// Gemini with the family's data in its context — the family, the calendar from today through
// three weeks out, the grocery list, what's on screen — the whole conversation word for word,
// and four broad tools for changes only. Every change still comes back as the usual card that
// needs a yes, and still meets the server's hard checks (a real date, an event that exists,
// never a school-run copy). Dry runs only (`context.full_ai`), for side-by-side tests.

/** Synced copies of school-routine runs ("Drop off Emme @ Palm Beach Public …"): never changed. */
export function isRoutineCopy(title) {
  return /^(drop off|pick up|pickup|dropoff)\b.*@/i.test(String(title ?? ''))
}

const offsetMinutes = (utcOffset) => {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(String(utcOffset ?? '-04:00'))
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : -240
}
/** A moment in the family's clock: { date: 'YYYY-MM-DD', weekday: 'Sat', month: 'Oct', day: 3, clock: '12:30 PM' }. */
function local(iso, utcOffset) {
  const d = new Date(Date.parse(iso) + offsetMinutes(utcOffset) * 60e3)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  return {
    date: d.toISOString().slice(0, 10),
    weekday: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    month: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
    day: d.getUTCDate(),
    clock: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`,
  }
}

function describeEvent(e, utcOffset) {
  const s = local(e.start_time, utcOffset)
  const when = e.all_day ? `${s.weekday} ${s.month} ${s.day}, all day` : `${s.weekday} ${s.month} ${s.day}, ${s.clock}–${local(e.end_time, utcOffset).clock}`
  const parts = [`[${e.id}] ${when} · ${e.title}`]
  if (e.event_type === 'reminder') parts.push('reminder')
  if (e.people?.length) parts.push(`people: ${e.people.join(', ')}`)
  if (e.drivers?.length) parts.push(`driver: ${e.drivers.join(', ')}`)
  if (e.address || e.place) parts.push(`at ${e.address || e.place}`)
  if (isRoutineCopy(e.title)) parts.push('SCHOOL-RUN COPY — never change it')
  return parts.join(' · ')
}

function describeDraft(pending, utcOffset) {
  const a = pending?.args ?? {}
  const when = typeof a.start === 'string' ? (() => { const s = local(a.start, utcOffset); return `${s.weekday} ${s.month} ${s.day}, ${s.clock}` })() : 'no time yet'
  const what = pending.tool === 'update_event' ? `a change to [${a.id}]` : `a new ${a.event_type === 'reminder' ? 'reminder' : 'item'}`
  return `${what}: ${a.title ?? '(untitled)'} · ${when}${a.location ? ` · at ${a.location}` : ''}${Array.isArray(a.members) && a.members.length ? ` · for ${a.members.join(', ')}` : ''}${a.driver_name ? ` · driver ${a.driver_name}` : ''}`
}

/** One plain paragraph, then the data it answers from. */
export function buildFullAiSystem({ family, events, groceries, pending, onScreenIds, utcOffset, now, homeCity }) {
  const today = local(now.toISOString(), utcOffset)
  const intro = `You are Casa, the Tabor family's home assistant, on a wall screen in their kitchen and on their phones, usually spoken to by voice (so words can be misheard: "live" may mean Liv). Answer briefly and conversationally, the way a helpful person in the house would, from the family's calendar and grocery list below, which are the truth; if something isn't there, say so. Keep track of the conversation: "that", "her", "the second one" mean what was just said. When someone wants something added, changed or removed, call one of your tools with exactly what they asked for; nothing is saved until they say yes to the card it makes, so don't say it's done. Ask a short question when a request could mean more than one thing. Now it is ${today.weekday} ${today.month} ${today.day}, ${today.clock}, in ${homeCity ?? 'West Palm Beach'}; times are local, and tool times are local "YYYY-MM-DDTHH:MM".`
  const sections = [
    intro,
    `DAYS (the next two weeks):\n${Array.from({ length: 14 }, (_, i) => { const d = local(new Date(now.getTime() + i * 86400e3).toISOString(), utcOffset); return `${i === 0 ? 'today' : i === 1 ? 'tomorrow' : d.weekday} = ${d.weekday} ${d.month} ${d.day} (${d.date})` }).join('\n')}`,
    `FAMILY:\n${family.map((m) => `- ${m.name} (${[m.role, m.can_drive ? 'drives' : null].filter(Boolean).join(', ')})`).join('\n')}`,
    `CALENDAR (today through three weeks out; [id] first):\n${events.map((e) => `- ${describeEvent(e, utcOffset)}`).join('\n') || '- nothing'}`,
    `GROCERY LIST:\n${groceries.map((g) => `- ${g.name}${g.quantity ? ` (${g.quantity})` : ''}`).join('\n') || '- empty'}`,
  ]
  if (pending) sections.push(`ON SCREEN, WAITING FOR A YES: ${describeDraft(pending, utcOffset)} — a follow-up about it changes this same card (call the same tool again with the whole corrected item).`)
  if (onScreenIds?.length) sections.push(`JUST DISCUSSED (in the order you named them): ${onScreenIds.map((id) => `[${id}]`).join(', ')}`)
  return sections.join('\n\n')
}

/** The conversation, word for word (the last 40 turns at most). */
export function fullAiContents(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && String(m.content ?? '').trim())
    .slice(-40)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.content) }] }))
}

const LOCAL = { type: 'STRING', description: 'Local date and time, "YYYY-MM-DDTHH:MM"' }
export const FULL_AI_TOOLS = [
  {
    name: 'create_event',
    description: 'Propose a new calendar event or reminder (the person confirms the card).',
    parameters: { type: 'OBJECT', properties: { title: { type: 'STRING', description: 'Short calendar name for the thing itself' }, start: LOCAL, end: LOCAL, all_day: { type: 'BOOLEAN' }, people: { type: 'ARRAY', items: { type: 'STRING' } }, place: { type: 'STRING' }, kind: { type: 'STRING', enum: ['event', 'reminder'] } }, required: ['title', 'start'] },
  },
  {
    name: 'update_event',
    description: 'Propose a change to one calendar item by its [id]: time, place, title, people or driver (the person confirms the card).',
    parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, title: { type: 'STRING' }, start: LOCAL, end: LOCAL, place: { type: 'STRING' }, add_people: { type: 'ARRAY', items: { type: 'STRING' } }, remove_people: { type: 'ARRAY', items: { type: 'STRING' } }, driver: { type: 'STRING', description: 'Family member who will drive' } }, required: ['id'] },
  },
  {
    name: 'delete_event',
    description: 'Propose removing one calendar item by its [id] (the person confirms the card).',
    parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' } }, required: ['id'] },
  },
  {
    name: 'add_grocery_items',
    description: 'Propose adding items to the grocery list (the person confirms the card).',
    parameters: { type: 'OBJECT', properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, quantity: { type: 'STRING' } }, required: ['name'] } } }, required: ['items'] },
  },
]

/** "YYYY-MM-DDTHH:MM" local → ISO with the family's offset, or null when it isn't a real, sensible moment. */
function localToIso(value, utcOffset, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value ?? ''))
  if (!m) return null
  const [, y, mo, d, h = '00', mi = '00'] = m
  const probe = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi))
  if (probe.getUTCFullYear() !== +y || probe.getUTCMonth() !== +mo - 1 || probe.getUTCDate() !== +d || +h > 23 || +mi > 59) return null
  const off = offsetMinutes(utcOffset)
  const iso = `${y}-${mo}-${d}T${h}:${mi}:00${utcOffset}`
  const at = probe.getTime() - off * 60e3
  if (at < now.getTime() - 2 * 86400e3 || at > now.getTime() + 400 * 86400e3) return null
  return iso
}
const names = (v) => (Array.isArray(v) ? v.map((n) => String(n).trim()).filter(Boolean) : [])
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The model's tool call as the usual card, or { error } when it fails a hard check. */
export function fullAiCard(call, { events, utcOffset, now }) {
  const a = call?.args ?? {}
  const badDate = { error: "That isn't a real date and time I can put on the calendar." }
  if (call?.name === 'create_event') {
    const title = text(a.title)
    const start = localToIso(a.start, utcOffset, now)
    if (!title || !start) return badDate
    const end = a.end != null ? localToIso(a.end, utcOffset, now) : null
    if (a.end != null && !end) return badDate
    const endIso = end ?? `${new Date(Date.parse(start) + 60 * 60e3 + offsetMinutes(utcOffset) * 60e3).toISOString().slice(0, 16)}:00${utcOffset}`
    const args = { title, start, end: endIso }
    if (names(a.people).length) args.members = names(a.people)
    if (text(a.place)) args.location = text(a.place)
    args.event_type = a.kind === 'reminder' ? 'reminder' : 'event'
    args.all_day = a.all_day === true
    return { tool: 'create_event', args }
  }
  if (call?.name === 'update_event' || call?.name === 'delete_event') {
    const event = events.find((e) => e.id === a.id)
    if (!event) return { error: "That item isn't on the calendar." }
    if (isRoutineCopy(event.title)) return { error: "That's a copy of a school run from the family routines; change the routine instead." }
    if (call.name === 'delete_event') return { tool: 'delete_event', args: { id: event.id, title: event.title } }
    const args = { id: event.id }
    if (text(a.title)) args.title = text(a.title)
    if (a.start != null) { const v = localToIso(a.start, utcOffset, now); if (!v) return badDate; args.start = v }
    if (a.end != null) { const v = localToIso(a.end, utcOffset, now); if (!v) return badDate; args.end = v }
    if (text(a.place)) args.location = text(a.place)
    if (names(a.add_people).length) args.members_add = names(a.add_people)
    if (names(a.remove_people).length) args.members_remove = names(a.remove_people)
    if (text(a.driver)) args.driver_name = text(a.driver)
    return { tool: 'update_event', args }
  }
  if (call?.name === 'add_grocery_items') {
    const items = (Array.isArray(a.items) ? a.items : []).map((i) => ({ name: text(i?.name), quantity: text(i?.quantity) })).filter((i) => i.name)
    if (!items.length) return { error: 'There was nothing to add.' }
    return { tool: 'add_grocery_items', args: { items: items.map((i) => (i.quantity ? i : { name: i.name })) } }
  }
  return { error: 'That kind of change isn’t something I can do.' }
}

/** The calendar items an answer names, in the order it names them (for "the second one" next). */
export function mentionedIds(answer, events) {
  const said = String(answer ?? '').toLowerCase()
  const found = []
  for (const e of events) {
    const full = String(e.title ?? '').toLowerCase()
    const head = full.split(/[:@·(–—]| - /)[0].trim()
    const at = [full, head].filter((t) => t.length >= 4).map((t) => said.indexOf(t)).filter((i) => i >= 0)
    if (at.length) found.push({ id: e.id, at: Math.min(...at) })
  }
  return found.sort((x, y) => x.at - y.at).map((f) => f.id)
}

/** The calendar D sees: from the start of today (the family's clock) through three weeks out. */
export function fullAiWindow(now, utcOffset) {
  const today = local(now.toISOString(), utcOffset).date
  const from = new Date(`${today}T00:00:00${utcOffset}`)
  return { from: from.toISOString(), until: new Date(from.getTime() + 22 * 86400e3).toISOString() }
}
