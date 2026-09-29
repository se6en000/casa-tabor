// Version D of Casa's assistant (P3.16, Jake 2026-09-26: "give the full AI a real shot"):
// Gemini with the family's data in its context — the family, the calendar from today through
// three weeks out, the grocery list, what's on screen — the whole conversation word for word,
// and four broad tools for changes only. Every change still comes back as the usual card that
// needs a yes, and still meets the server's hard checks (a real date, an event that exists,
// never a school-run copy). Dry runs only (`context.full_ai`), for side-by-side tests.
import { memberNamed } from './family-names.mjs'
import { tipsByTopic } from './casa-tips.mjs'

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
export function buildFullAiSystem({ family, events, groceries, pending, onScreenIds, utcOffset, now, homeCity, home = null, places = [], contacts = [], recipes = [], todos = [] }) {
  const today = local(now.toISOString(), utcOffset)
  const intro = `You are Casa, the Tabor family's home assistant, on a wall screen in their kitchen and on their phones, usually spoken to by voice (so words can be misheard: "live" may mean Liv). Answer briefly and conversationally, the way a helpful person in the house would, from the family's calendar and grocery list below, which are the truth; if something isn't there, say so. Keep track of the conversation: "that", "her", "the second one" mean what was just said. For anything not below — the weather, a place, a drive time, something on the web — use a lookup tool. When someone wants something added, changed or removed (on the calendar, the grocery list, in recipes, a gift idea for someone, or the Coming up list of things to get ready for — one item or an every-time rule), call one of your tools with exactly what they asked for; several changes at once are several calls; nothing is saved until they say yes to the card it makes, so don't say it's done. Read gift ideas back only from get_gift_ideas, and only what it returns. His to-do list is the “To Do” list on his phone and Casa’s To do screen. In his words: a reminder is something to do at a certain time (trash out at 8); a to-do is something to get done that may or may not have a date; a project is a big job with many steps. Adding to his to-do list, or a reminder with no time, is add_todo — never ask when; a big multi-step home project is plan_project, proposed straight away with its steps (he changes it by talking) rather than questions first. The calendar below is only today through three weeks: before saying something isn't on the calendar, or answering about any other date, call find_events (words from what they asked, and a date if they gave one). Ask a short question when a request could mean more than one thing. Now it is ${today.weekday} ${today.month} ${today.day}, ${today.clock}, in ${homeCity ?? 'West Palm Beach'}; times are local, and tool times are local "YYYY-MM-DDTHH:MM".`
  const sections = [
    intro,
    `DAYS (the next two weeks):\n${Array.from({ length: 14 }, (_, i) => { const d = local(new Date(now.getTime() + i * 86400e3).toISOString(), utcOffset); return `${i === 0 ? 'today' : i === 1 ? 'tomorrow' : d.weekday} = ${d.weekday} ${d.month} ${d.day} (${d.date})` }).join('\n')}`,
    `FAMILY:\n${family.map((m) => `- ${m.name} (${[m.full_name && m.full_name !== m.name ? m.full_name : null, m.role, m.can_drive ? 'drives' : null].filter(Boolean).join(', ')})`).join('\n')}`,
    `CALENDAR (today through three weeks out; [id] first — for any other date, the past, or to check whether something is on the calendar at all, call find_events):\n${events.map((e) => `- ${describeEvent(e, utcOffset)}`).join('\n') || '- nothing'}`,
    `GROCERY LIST ([id] first):\n${groceries.map((g) => `- ${g.id ? `[${g.id}] ` : ''}${g.name}${g.quantity ? ` (${g.quantity})` : ''}${g.checked ? ' · checked off' : ''}`).join('\n') || '- empty'}`,
  ]
  // His open to-do list (the "To Do" list on his phone), so a repeat is noticed and a project can
  // grow from what he already captured (live check 2026-09-28: "Paint the house" was added twice).
  if (todos.length) {
    const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '')
    sections.push(`TO-DO LIST (his open to-dos; [id] first — if what he asks to add is already on it, say so instead of adding it again, and a project grows from it with from_id):\n${todos.map((t) => `- [${t.id}] ${t.title}${t.due ? ` · by ${day(t.due)}` : ''}`).join('\n')}`)
  }
  if (home) sections.push(`HOME: ${home}`)
  if (places.length) sections.push(`SAVED PLACES:\n${places.map((p) => `- ${p.name}${p.address ? ` · ${p.address}` : ''}${p.phone ? ` · ${p.phone}` : ''}`).join('\n')}`)
  if (contacts.length) sections.push(`CONTACTS:\n${contacts.map((c) => `- ${[c.name, c.relationship, c.phone, c.email, c.place].filter(Boolean).join(' · ')}`).join('\n')}`)
  if (recipes.length) sections.push(`RECIPES (open one with get_recipe):\n${recipes.map((r) => `- [${r.id}] ${r.name}`).join('\n')}`)
  if (pending) sections.push(`ON SCREEN, WAITING FOR A YES: ${describeDraft(pending, utcOffset)} — a follow-up about it changes this same card (call the same tool again with the whole corrected item).`)
  // "Casa, what can you do?" (P3.19 3c): the same list as the tips and "What can I say?".
  sections.push(`WHAT YOU CAN DO (asked what you can do or what to say: two or three short examples from different topics, then that "What can I say?" on the screen lists them all):\n${tipsByTopic().map((g) => `${g.topic}: ${g.tips.map((t) => t.text).join(' | ')}`).join('\n')}`)
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
  // The old path's grocery and recipe changes, as cards (same names and arguments, so the app confirms them as before).
  { name: 'check_grocery_item', description: 'Propose checking an item off the grocery list (or unchecking it) by its [id].', parameters: { type: 'OBJECT', properties: { item_id: { type: 'STRING' }, checked: { type: 'BOOLEAN' } }, required: ['item_id', 'checked'] } },
  { name: 'remove_grocery_item', description: 'Propose removing one grocery item by its [id].', parameters: { type: 'OBJECT', properties: { item_id: { type: 'STRING' } }, required: ['item_id'] } },
  { name: 'update_grocery_item_quantity', description: 'Propose a new quantity for one grocery item by its [id].', parameters: { type: 'OBJECT', properties: { item_id: { type: 'STRING' }, quantity: { type: 'STRING' } }, required: ['item_id', 'quantity'] } },
  { name: 'clear_checked_grocery_items', description: 'Propose clearing every checked-off item from the grocery list.', parameters: { type: 'OBJECT', properties: {} } },
  {
    name: 'create_recipe',
    description: 'Propose saving a recipe to the family\'s recipes, with its ingredients and steps.',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, servings: { type: 'STRING' }, cook_time: { type: 'STRING' }, source_url: { type: 'STRING' }, ingredients: { type: 'ARRAY', items: { type: 'OBJECT', properties: { raw_text: { type: 'STRING' }, name: { type: 'STRING' }, quantity: { type: 'STRING' }, unit: { type: 'STRING' }, optional: { type: 'BOOLEAN' } }, required: ['name'] } }, steps: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['name', 'ingredients', 'steps'] },
  },
  // Gift ideas (P3.19 step 2): kept for the planner, never shown to the person they're for.
  { name: 'add_gift_idea', description: 'Propose saving a gift idea for someone ("gift idea for Kelly: that ceramic class") — who it is for, and the idea in their words.', parameters: { type: 'OBJECT', properties: { for: { type: 'STRING', description: 'Who the gift is for (a name)' }, idea: { type: 'STRING' } }, required: ['for', 'idea'] } },
  // His to-do list (P3.22; Jake 2026-09-28): the "To Do" list on his phone and Casa's To do screen.
  { name: 'add_todo', description: 'Propose adding something to his to-do list — anything he wants to get done, with or without a date ("add fix the gate to my to-dos", "remind me to paint the house"). Only a title is needed; a due date only if he gave one (YYYY-MM-DD; "in November" → the 1st of November).', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, due: { type: 'STRING', description: 'YYYY-MM-DD, only if he gave a date' } }, required: ['title'] } },
  { name: 'plan_project', description: 'Propose a big, multi-step home project as a plan: its steps in order (4–9, each a concrete action; the first small enough to do this week), with rough minutes and dollars per step, and an aim date if he gave one. If it is already on his list as a reminder, pass that [id] as from_id so it grows from it instead of a duplicate. Never ask him for the steps — propose them from how such jobs go; he changes them by talking, and nothing is saved until he says yes.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, minutes: { type: 'NUMBER' }, cost: { type: 'NUMBER', description: 'dollars' } }, required: ['title'] } }, aim_date: { type: 'STRING', description: 'YYYY-MM-DD' }, from_id: { type: 'STRING' } }, required: ['title', 'steps'] } },
  // The whole calendar, past and future, reminders included (Jake, 2026-09-28: "search my whole calendar").
  { name: 'find_events', description: 'Look up the calendar beyond the three weeks shown above, past or future: a day (from), a span (from and to), and/or words from the title or place. Reminders are included. Use it for any date not listed, or to check whether something is on the calendar.', parameters: { type: 'OBJECT', properties: { from: { type: 'STRING', description: 'YYYY-MM-DD' }, to: { type: 'STRING', description: 'YYYY-MM-DD' }, query: { type: 'STRING', description: 'words to look for' } } } },
  { name: 'get_gift_ideas', description: 'The gift ideas saved so far (for one person, or everyone).', parameters: { type: 'OBJECT', properties: { for: { type: 'STRING' } } } },
  // Coming up (P3.19): what needs planning ahead, each with a next step and days of notice.
  { name: 'add_to_coming_up', description: 'Propose putting one calendar item [id] on the Coming up list: what to get ready (the next step, in a few words) and how many days of notice.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, step: { type: 'STRING' }, notice_days: { type: 'INTEGER' } }, required: ['id', 'step', 'notice_days'] } },
  { name: 'add_coming_up_rule', description: 'Propose an "every time" rule for the Coming up list: any calendar item whose name has these words gets this step and this many days of notice — or, with off, is never flagged.', parameters: { type: 'OBJECT', properties: { match: { type: 'STRING', description: 'The fewest words that pick these items out by name, e.g. "spirit day", "dentist" (every word must be in the name)' }, step: { type: 'STRING' }, notice_days: { type: 'INTEGER' }, off: { type: 'BOOLEAN' } }, required: ['match'] } },
  { name: 'change_coming_up_item', description: 'Propose marking a Coming up item [id]: done, snooze (a week) or not_needed.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, action: { type: 'STRING', enum: ['done', 'snooze', 'not_needed'] } }, required: ['id', 'action'] } },
  { name: 'get_coming_up', description: 'The Coming up list: what needs starting within the next days (default 14), each with its next step, plan-by date and gift ideas, how many more are later, and the family\'s "every time" rules.', parameters: { type: 'OBJECT', properties: { within_days: { type: 'INTEGER' } } } },
  // Lookups (read only; the answer comes back to you, nothing changes).
  { name: 'search_web', description: 'Search the web for current facts (opening hours, events in town, anything not in the family data).', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
  { name: 'search_places', description: 'Find a business or place near home (name, address, phone).', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' }, city: { type: 'STRING' } }, required: ['query'] } },
  { name: 'get_weather_forecast', description: 'The weather forecast (home unless a location is given).', parameters: { type: 'OBJECT', properties: { location: { type: 'STRING' }, hours_ahead: { type: 'INTEGER' } } } },
  { name: 'get_travel_eta', description: 'Drive time and when to leave (from home unless an origin is given); times are ISO.', parameters: { type: 'OBJECT', properties: { destination: { type: 'STRING' }, origin: { type: 'STRING' }, arrival_time: { type: 'STRING' }, departure_time: { type: 'STRING' } }, required: ['destination'] } },
  { name: 'get_recipe', description: 'Open one saved recipe by its [id]: ingredients and steps.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' } }, required: ['id'] } },
  { name: 'search_family_notes', description: "Search the family's emails, notes and remembered facts (a school email, a confirmation, something someone said to remember).", parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
]

/** Lookups the server runs for D (the old path's code, `lookups.ts`). */
export const LOOKUP_TOOLS = ['search_web', 'search_places', 'get_weather_forecast', 'get_travel_eta']
/** Tools that only read; everything else becomes a card that needs a yes. */
export const READ_TOOLS = new Set([...LOOKUP_TOOLS, 'get_recipe', 'search_family_notes', 'get_gift_ideas', 'get_coming_up', 'find_events'])

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
/** Days of notice for Coming up: a whole number, one day to four months. */
const noticeDays = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.min(120, Math.max(1, Math.round(Number(v)))) : null)

/** The model's tool call as the usual card, or { error } when it fails a hard check. */
export function fullAiCard(call, { events, utcOffset, now, groceries = [], family = [], todos = [] }) {
  const a = call?.args ?? {}
  if (call?.name === 'add_to_coming_up' || call?.name === 'change_coming_up_item') {
    const target = events.find((e) => e.id === a.id)
    if (!target) return { error: "That isn't on the calendar, so it can't go on Coming up. Add it first, or make it an every-time rule." }
    if (call.name === 'change_coming_up_item') {
      if (!['done', 'snooze', 'not_needed'].includes(a.action)) return { error: 'Coming up items can be done, snoozed or not needed.' }
      return { tool: 'change_coming_up_item', args: { id: target.id, title: target.title, action: a.action } }
    }
    const step = text(a.step)
    if (!step) return { error: 'I need to know what to get ready.' }
    return { tool: 'add_to_coming_up', args: { id: target.id, title: target.title, step, notice_days: noticeDays(a.notice_days) ?? 7 } }
  }
  if (call?.name === 'add_coming_up_rule') {
    const match = text(a.match)?.toLowerCase() ?? null
    if (!match) return { error: 'I need the words to look for in the calendar names.' }
    const off = a.off === true
    const step = off ? null : text(a.step)
    const notice = off ? null : noticeDays(a.notice_days)
    if (!off && !step && notice == null) return { error: 'A rule needs a step, a notice, or off.' }
    return { tool: 'add_coming_up_rule', args: { match, step, notice_days: notice, off } }
  }
  if (call?.name === 'add_todo') {
    const title = text(a.title)
    if (!title) return { error: 'I need to know what to add to the to-do list.' }
    const due = typeof a.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : null
    return { tool: 'add_todo', args: { title, due } }
  }
  if (call?.name === 'plan_project') {
    const title = text(a.title)
    if (!title) return { error: 'I need a name for the project.' }
    const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null }
    const steps = (Array.isArray(a.steps) ? a.steps : [])
      .map((st) => { const cost = num(st?.cost, 100000); return { title: text(st?.title), minutes: num(st?.minutes, 60 * 24 * 7), cost_cents: cost == null ? null : cost * 100 } })
      .filter((st) => st.title)
      .slice(0, 12)
    if (steps.length < 2) return { error: 'A project needs at least two steps.' }
    const aim = typeof a.aim_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.aim_date) ? a.aim_date : null
    // Grown from the reminder already on his list — only a real reminder.
    const from = typeof a.from_id === 'string' && ((events ?? []).some((e) => e.id === a.from_id && e.event_type === 'reminder') || (todos ?? []).some((t) => t.id === a.from_id)) ? a.from_id : null
    return { tool: 'plan_project', args: { title, aim_date: aim, from_event_id: from, steps } }
  }
  if (call?.name === 'add_gift_idea') {
    const who = text(a.for)
    const idea = text(a.idea)
    if (!who) return { error: 'I need to know who the gift idea is for.' }
    if (!idea) return { error: 'I need the gift idea itself.' }
    const member = memberNamed(who, family)
    return { tool: 'add_gift_idea', args: { for_name: member?.name ?? who, for_member_id: member?.id ?? null, idea } }
  }
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
  if (['check_grocery_item', 'remove_grocery_item', 'update_grocery_item_quantity'].includes(call?.name)) {
    const item = groceries.find((g) => g.id === a.item_id)
    if (!item) return { error: "That item isn't on the grocery list." }
    // The card names the item ("Mark Apple juice as done"), as the old path's did.
    if (call.name === 'check_grocery_item') return { tool: call.name, args: { item_id: item.id, item_name: item.name, checked: a.checked !== false } }
    if (call.name === 'remove_grocery_item') return { tool: call.name, args: { item_id: item.id, item_name: item.name } }
    const quantity = text(a.quantity)
    if (!quantity) return { error: 'What quantity should it be?' }
    return { tool: call.name, args: { item_id: item.id, item_name: item.name, quantity } }
  }
  if (call?.name === 'clear_checked_grocery_items') return { tool: call.name, args: {} }
  if (call?.name === 'create_recipe') {
    const ingredients = (Array.isArray(a.ingredients) ? a.ingredients : []).filter((i) => text(i?.name))
    const steps = (Array.isArray(a.steps) ? a.steps : []).map((x) => text(x)).filter(Boolean)
    if (!text(a.name) || !ingredients.length || !steps.length) return { error: 'A recipe needs a name, its ingredients and its steps.' }
    const args = { name: text(a.name), ingredients, steps }
    for (const k of ['servings', 'cook_time', 'source_url']) if (text(a[k])) args[k] = text(a[k])
    return { tool: call.name, args }
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

// ── Automatic bug reports (P3.17): noticing from the conversation that the last answer missed ──
const CORRECTION = /\b(that'?s not what i (said|asked|meant)|not what i (said|asked|meant)|you (got it|have it|heard it) wrong|you misheard|that'?s wrong|wrong (day|time|one|person|event)|i said\b|i meant\b)/i
const wordSet = (t) => new Set(String(t ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2))

/** 'correction' | 'repeat' when the latest words say the last answer missed; null otherwise. */
export function flubSignal(messages) {
  const users = (Array.isArray(messages) ? messages : []).filter((m) => m.role === 'user').map((m) => String(m.content ?? ''))
  if (users.length < 2) return null
  const latest = users.at(-1)
  if (CORRECTION.test(latest)) return 'correction'
  // Nearly the same request again (most of the earlier words said again, not a short follow-up).
  const now = wordSet(latest)
  for (const before of users.slice(-3, -1)) {
    const prev = wordSet(before)
    if (prev.size < 4) continue
    const shared = [...prev].filter((w) => now.has(w)).length
    if (shared / prev.size >= 0.75) return 'repeat'
  }
  return null
}

/**
 * Gift ideas the asker may see (P3.19 step 2). Jake, 2026-09-27: "I'd still like it all to show up on
 * the wall as well as phone. Later I can make it more private." So the wall reads them all; a phone
 * that knows who is holding it still leaves out the ideas for that person.
 */
export function giftIdeasForViewer(rows, { viewerMemberId, page, forName, family = [] }) {
  // An idea saved as "Olivia" is Liv's even when it wasn't linked to her when it was saved.
  const whose = (r) => r.for_member_id ?? memberNamed(r.for_name, family)?.id ?? null
  const wantedMember = forName ? memberNamed(forName, family) : null
  const wanted = forName ? String(forName).trim().toLowerCase() : null
  const ideas = (rows ?? [])
    .filter((r) => page === 'wall' || !viewerMemberId || whose(r) !== viewerMemberId)
    .filter((r) => !wanted || (wantedMember ? whose(r) === wantedMember.id : String(r.for_name).trim().toLowerCase() === wanted))
    .map((r) => ({ for: r.for_name, idea: r.idea, saved: String(r.created_at).slice(0, 10) }))
  return { ideas }
}

/**
 * What get_coming_up hands the model: up to five items to start within `withinDays` (by plan-by
 * date), how many more there are in all (so it never has to count), and a reminder to say it briefly — a list read out on a wall should be short.
 */
export function comingUpForModel(items, rules, { today, withinDays = 14 } = {}) {
  const days = Math.min(120, Math.max(1, Number(withinDays) || 14))
  const until = new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400e3).toISOString().slice(0, 10)
  const soon = (items ?? []).filter((i) => i.pokeOn <= until).slice(0, 5)
  return {
    items: soon.map((i) => ({ id: i.key, title: i.title, date: i.date, days_away: i.daysAway, next_step: i.nextStep, plan_by: i.pokeOn, late: i.late || undefined, gift_ideas: i.ideas?.length ? i.ideas : undefined })),
    more: (items ?? []).length - soon.length,
    rules: (rules ?? []).map((r) => (r.off ? `never flag "${r.match}"` : `every "${r.match}": ${[r.step, r.lead_days ? `${r.lead_days} days ahead` : null].filter(Boolean).join(', ')}`)),
    say: 'Briefly: these, late first, one short line each; then, if more is above 0, that there are that many more.',
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const shiftYears = (day, years) => `${Number(day.slice(0, 4)) + years}${day.slice(4)}`

/**
 * find_events' arguments made safe: a day, a span (turned round if backwards), or words searched two
 * years either side of today. Never unbounded; no wildcard characters or tiny words reach the query.
 * null when a date is given but isn't one.
 */
export function findEventsRange(args, today) {
  const a = args ?? {}
  const words = String(a.query ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the', 'and', 'for'].includes(w)).slice(0, 5)
  const from = a.from == null || a.from === '' ? null : String(a.from)
  const to = a.to == null || a.to === '' ? null : String(a.to)
  if ((from && !ISO_DAY.test(from)) || (to && !ISO_DAY.test(to))) return null
  if (!from && !to) return { from: shiftYears(today, -2), to: shiftYears(today, 2), words }
  const start = from ?? to
  const end = to ?? from
  return start <= end ? { from: start, to: end, words } : { from: end, to: start, words }
}

/** What find_events hands the model: each event as the calendar above describes it. */
export function describeFoundEvents(events, utcOffset) {
  return (events ?? []).map((e) => describeEvent(e, utcOffset))
}
