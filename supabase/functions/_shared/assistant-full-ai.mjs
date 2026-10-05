// Version D of Casa's assistant (P3.16, Jake 2026-09-26: "give the full AI a real shot"):
// Gemini with the family's data in its context — the family, the calendar from today through
// three weeks out, the grocery list, what's on screen — the whole conversation word for word,
// and four broad tools for changes only. Every change still comes back as the usual card that
// needs a yes, and still meets the server's hard checks (a real date, an event that exists,
// never a school-run copy). Dry runs only (`context.full_ai`), for side-by-side tests.
import { memberNamed } from './family-names.mjs'
import { memoryContext } from './casa-memory.mjs'
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
  // A to-do's midnight is its day without a time (it read "due by 12:00 AM tomorrow", Oct 3).
  const when = e.all_day ? `${s.weekday} ${s.month} ${s.day}, all day`
    : e.event_type === 'reminder' && s.clock === '12:00 AM' ? `${s.weekday} ${s.month} ${s.day}, no set time`
    : `${s.weekday} ${s.month} ${s.day}, ${s.clock}–${local(e.end_time, utcOffset).clock}`
  const parts = [`[${e.id}] ${when} · ${e.title}`]
  if (e.event_type === 'reminder') parts.push('reminder')
  if (e.people?.length) parts.push(`people: ${e.people.join(', ')}`)
  if (e.drivers?.length) parts.push(`driver: ${e.drivers.join(', ')}`)
  if (e.address || e.place) parts.push(`at ${e.address || e.place}`)
  if (isRoutineCopy(e.title)) parts.push('SCHOOL-RUN COPY — never change it')
  return parts.join(' · ')
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** "Mon & Thu", "Mon–Fri", "every day". */
function choreDays(days) {
  const d = [...new Set(days ?? [])].sort((a, b) => a - b)
  if (d.length === 7) return 'every day'
  if (d.length >= 3 && d.every((x, i) => i === 0 || x === d[i - 1] + 1)) return `${WEEKDAY[d[0]]}–${WEEKDAY[d[d.length - 1]]}`
  return d.map((x) => WEEKDAY[x]).join(' & ')
}
/** "20:00:00" → "8 PM", "18:30" → "6:30 PM". */
function choreTime(t) {
  const [h, m] = String(t ?? '').split(':').map(Number)
  if (!Number.isFinite(h)) return ''
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}
/**
 * The household's chores for Casa, from household_chores rows, the ids done today, the family and today (YYYY-MM-DD,
 * home time). Whether one falls today follows the wall's rule (src/wall/engine/chores.ts choreOnDay): its weekday,
 * not before it starts, and for every N weeks, weeks counted from its first time.
 */
export function choresForCasa(rows, doneIds, family, todayYmd) {
  const dayOf = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
  const sundayOf = (dt) => new Date(dt.getTime() - dt.getUTCDay() * 86400e3)
  const today = dayOf(todayYmd)
  const falls = (c) => {
    const days = c.days_of_week ?? []
    if (!c.enabled || !days.includes(today.getUTCDay())) return false
    const start = dayOf(c.starts_on ?? todayYmd)
    if (today < start) return false
    const first = new Date(start)
    while (!days.includes(first.getUTCDay())) first.setTime(first.getTime() + 86400e3)
    const weeks = Math.round((sundayOf(today).getTime() - sundayOf(first).getTime()) / (7 * 86400e3))
    return weeks % Math.max(1, c.every_weeks || 1) === 0
  }
  return (rows ?? []).filter((c) => c.enabled !== false).map((c) => {
    const today = falls(c)
    return { title: c.title, who: (family ?? []).find((m) => m.id === c.member_id)?.name ?? null, days: c.days_of_week ?? [], time: c.time_local, every_weeks: c.every_weeks ?? 1, today, done: today && doneIds.has(c.id) }
  })
}

/**
 * A to-do (a reminder row) for Casa: its day and time in home time, and whether it's late. Midnight is a day without a
 * time (the placeholder a date-only to-do carries) — it read "due by tomorrow at midnight" (Oct 3).
 */
export function todoForCasa(row, now, timeZone = 'America/New_York') {
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const due = row.has_due_date ? day(new Date(row.start_time)) : null
  const clock = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(row.start_time))
  const time = due && row.all_day !== true && clock !== '12:00 AM' ? clock : null
  const late = Boolean(due) && (time ? Date.parse(row.start_time) < now.getTime() : due < day(now))
  return { id: row.id, title: row.title, due, time, late }
}

function describeChore(c) {
  const when = [c.every_weeks > 1 ? `every ${c.every_weeks} weeks on ${choreDays(c.days)}` : choreDays(c.days), choreTime(c.time)].filter(Boolean).join(', ')
  return `- ${[c.title, c.who, when].filter(Boolean).join(' · ')}${c.today ? ` · today, ${c.done ? 'done' : 'not done yet'}` : ''}`
}

function describeDraft(pending, utcOffset) {
  const a = pending?.args ?? {}
  const when = typeof a.start === 'string' ? (() => { const s = local(a.start, utcOffset); return `${s.weekday} ${s.month} ${s.day}, ${s.clock}` })() : 'no time yet'
  const what = pending.tool === 'update_event' ? `a change to [${a.id}]` : `a new ${a.event_type === 'reminder' ? 'reminder' : 'item'}`
  return `${what}: ${a.title ?? '(untitled)'} · ${when}${a.location ? ` · at ${a.location}` : ''}${Array.isArray(a.members) && a.members.length ? ` · for ${a.members.join(', ')}` : ''}${a.driver_name ? ` · driver ${a.driver_name}` : ''}`
}

/** The plan on screen, one line per item, so a change can be made to it (P3.25 phase 3). */
function describePlan(plan, utcOffset) {
  const at = (iso) => { const s = local(iso, utcOffset); return `${s.weekday} ${s.month} ${s.day}, ${s.clock}` }
  const line = (i) => {
    if (i.kind === 'project') return `project “${i.title}”${i.part_of ? ` inside ${i.part_of}` : ''}${i.aim_date ? ` · aim ${shortDay(i.aim_date)}` : ''}: ${(i.steps ?? []).map((st, n) => `${n + 1}. ${[st.title, st.who, st.minutes ? effort(st.minutes) : null, st.cost_cents ? `$${Math.round(st.cost_cents / 100)}` : null, st.cal_start ? shortDay(st.cal_start) : null].filter(Boolean).join(' · ')}`).join('; ')}`
    if (i.kind === 'tick_step') return `tick off “${i.title}”${i.project ? ` on ${i.project}` : ''}`
    if (i.kind === 'event') return `event “${i.title}” · ${at(i.start)} to ${at(i.end)}`
    if (i.kind === 'todo') return `to-do “${i.title}”${i.due ? ` by ${shortDay(i.due)}` : ''}`
    if (i.kind === 'shopping') return `shopping “${i.name}”`
    if (i.kind === 'pack') return `pack “${i.label}” for ${i.event_title ?? 'its event'}`
    const what = (c) => Object.entries(c ?? {}).map(([k, v]) => `${k.replace('cal_start', 'date').replace('cost_cents', 'cost')} ${k === 'cal_start' ? shortDay(v) : k === 'cost_cents' ? `$${Math.round(v / 100)}` : v}`).join(', ')
    if (i.kind === 'edit_step') return `change “${i.title}” on ${i.project}: ${what(i.changes)}`
    if (i.kind === 'add_step') return `add “${i.title}” to ${i.project}${i.after ? ` after “${i.after}”` : ''}${i.changes ? ` (${what(i.changes)})` : ''}`
    if (i.kind === 'remove_step') return `remove “${i.title}” from ${i.project}`
    if (i.kind === 'event_details') return `add to “${i.title}”: ${Object.entries(i.changes ?? {}).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(', ') : k === 'start' || k === 'end' ? at(v) : v}`).join('; ')}`
    if (i.kind === 'move_step') return `move “${i.title}” on ${i.project} ${i.after ? `after “${i.after}”` : 'to the start'}`
    if (i.kind === 'close_project') return `close ${i.title} (${i.reason})`
    return i.kind
  }
  return `${plan?.title ?? '(untitled)'}\n${(plan?.items ?? []).map((i) => `- ${line(i)}${i.why ? ` (why: ${i.why})` : ''}`).join('\n')}`
}

/** One plain paragraph, then the data it answers from. */
// Talking something through (P3.25): the fast model only hands it over (think_it_through); how to think
// with him is the planning model's — in the fast model's instructions it wrote asked-for projects out in
// words instead of the card (live check, 2026-09-29).
const HAND_IT_OVER = 'When he wants to talk something through — ideas, a theme, a holiday, a project, whether something is a good idea — call think_it_through and nothing else. '
const THINKING_WITH_HIM = (homeCity) => `When he wants to talk something through — a project, a theme, a holiday, whether something is a good idea — think with him and say more: lead with substance — a few concrete ideas, options with your pick, or your honest take and why — drawn from what you know of this family (Coming up, the projects, the calendar, who's who, the Florida weather), and push back when something won't work (the weather, the time it takes, the cost, what's already on the calendar). Ask at most one question, after the ideas. Don't steer the conversation toward adding things: steps and a plan come once he's chosen a direction, and only then offer to set it up. Use search_web for what's current: prices, what people are doing this year (Reddit is good for that), and what's available or happening around ${homeCity ?? 'West Palm Beach'} and in Florida. Once he's settled on a direction, call set_plan with the whole plan, alongside a sentence or two in words; it appears beside the conversation, and every change after that is set_plan again with everything. Changing the order of his saved steps ("do the painter after the stucco") is move_step. `

const shortDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '')
const effort = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`)

// A project for the model (P3.25 phase 1): every step, so "what's left on the roof?" or "what should I
// do Saturday?" is answered from the steps, not a one-line summary.
function describeProject(p) {
  const head = `- ${p.id ? `[${p.id}] ` : ''}${p.title}${p.parent ? ` (inside ${p.parent})` : ''}${p.aim_date ? ` · aim ${shortDay(p.aim_date)}` : ''} · ${p.done} of ${p.total} steps done`
  if (!Array.isArray(p.steps)) return `${head}${p.next ? ` · next: ${p.next}` : ''}`
  const nowGrp = p.steps.find((st) => !st.done)?.grp
  return [head, ...p.steps.map((st) => {
    const state = st.done ? 'done' : st.grp === nowGrp ? 'NOW' : 'then'
    const bits = [
      `${st.id ? `[${st.id}] ` : ''}${st.child ? `${st.title} (a project inside: ${st.child.title}, ${st.child.done} of ${st.child.total} done)` : st.title}`,
      st.who, st.minutes ? effort(st.minutes) : null, st.cost_cents ? `$${Math.round(st.cost_cents / 100)}` : null,
      st.cal_start ? (st.cal_end && st.cal_end !== st.cal_start ? `${shortDay(st.cal_start)} to ${shortDay(st.cal_end)}` : shortDay(st.cal_start)) : null,
    ].filter(Boolean)
    return `    ${state}: ${bits.join(' · ')}`
  })].join('\n')
}

export function buildFullAiSystem({ family, events, groceries, pending, onScreenIds, utcOffset, now, homeCity, home = null, places = [], contacts = [], recipes = [], todos = [], chores = [], projects = [], comingUp = [], planning = false, memory = [], dueThoughtId = null, speaker = null }) {
  const today = local(now.toISOString(), utcOffset)
  const intro = `You are the Tabor family's home assistant in Tabor House, their family app, on a wall screen in their kitchen and on their phones, usually spoken to by voice (so words can be misheard: "live" may mean Liv). You have no name of your own (the app is Tabor House; it used to be called Casa): never call yourself Casa or any other name, and if asked who you are, you're the Tabor House assistant. Answer briefly and conversationally, the way a helpful person in the house would — a sentence or two; when you give several options, ideas or steps, say one short lead line, then each on its own line as "- Name: one short line" (at most four), which the screen shows as tiles — from the family's calendar and grocery list below, which are the truth; if something isn't there, say so. Keep track of the conversation: "that", "her", "the second one" mean what was just said. For anything not below — the weather, a place, a drive time, something on the web — use a lookup tool. When someone wants something added, changed or removed (on the calendar, the grocery list, in recipes, a gift idea for someone, or the Coming up list of things to get ready for — one item or an every-time rule), call one of your tools with exactly what they asked for; telling you a plan of their own or the family's with a day or a time ("I'm going to the gym at 7:30", "Owen has a playdate Saturday at 2", "we're having dinner at the Smiths' Friday at 7") is asking for it on the calendar — call create_event, don't just chat about it; several changes at once are several calls; nothing is saved until they say yes to the card it makes, so don't say it's done — and the card is the question: for a change they asked for clearly (a new name, a time, a place), make it at once; never ask "is that right?" in words first. The screen shows things for you: directions, a route or a link to go to someone or somewhere ("navigate to Alice's house", "how do I get to…") is show_directions — the route goes on the screen, so never say you can't give directions or a link; an address he tells you for someone is save_address (its card asks his yes — don't ask in words); wanting to hear from someone, or about something, from now on ("keep me posted on…", "always show me anything from Sally Rozanski", "let me know whenever the school writes about the dance") is keep_me_posted — that means their emails, even unsaid; call it right away with his own words (don't ask who someone is: the email reader knows "Owen's therapist"), and never say you'll make a card instead of making it; a day he asks about or asks to see is show_day. WHAT CASA KNOWS below is the family's memory: when he asks what Casa knows about someone or something, answer from it in a few lines — the sure facts, then what you're not sure of yet, each with where it came from; use the sure facts to know who something is for ("the softball game" is Liv's). When he tells you something about someone to keep ("Liv also does debate on Thursdays", "remember, the kids' dentist is Dr. Wanuk") or corrects it ("that's wrong, she's in 8th grade"), call remember (replaces_id for a correction) — it is saved at once, no card — then say what you saved in a few words; "forget …" is forget; "undo that" right after is undo_memory; "remember this" about something to come back to is remember with kind thought; "what did I ask you to remember?" lists the open thoughts and what he told you. An open thought marked DUE: bring it up once, in passing, at the end of your answer; and when the conversation touches an open thought's topic, mention it in passing, once. His answer to one: "let it go" is forget; "I did it" is forget with done; "make it a to-do" is add_todo, then forget with done; "plan it" is talking it through; "keep it" needs nothing. ${planning ? THINKING_WITH_HIM(homeCity) : HAND_IT_OVER}Read gift ideas back only from get_gift_ideas, and only what it returns. Never say you changed, deleted or finished something unless it went through one of your tools and he said yes to the card. His to-do list is the “To Do” list on his phone and Casa’s To do screen. Asked what's on his to-dos or reminders, answer from the TO-DO LIST — what's due today or late first, with its time, then how many are open without a date — and today's CHORES, not the calendar's events; never call a calendar event a reminder (a CALENDAR item marked reminder is one of his to-dos with a time). In his words: a reminder is something to do at a certain time (trash out at 8); a to-do is something to get done that may or may not have a date; a project is a big job with many steps. Adding to his to-do list, or a reminder with no time, is add_todo — never ask when. When he asks you to add or set up a big multi-step project ("make a project for painting the house", "add the roof as a project"), it is plan_project, proposed straight away with its steps (he changes it by talking) rather than questions first; wanting to do or make something, or planning something together ("let's plan Emme's costume"), without asking for the project itself, is talking it through. The calendar below is only today through three weeks: before saying something isn't on the calendar, or answering about any other date, call find_events (words from what they asked, and a date if they gave one). Someone going away — a work trip, flying or driving ("I'm in Dallas Wednesday to Thursday", "I'm driving to Orlando for work next week") — is a trip: ask for what's missing, one short question at a time (who's going and which days; flying or driving; for each flight its number, airports and times, saved in home time ("3:30 their time" in Dallas is 4:30 here); for a drive, when they leave and when they head home), then add it with create_event calls, the traveller on each: each flight titled "Flight <number> <FROM>→<TO>" from take-off to landing, each drive "Drive to <City>" and "Drive home from <City>" from leaving to arriving, and one all-day "Trip <City>" across the days (the hotel as its place if they said). The wall works out when they leave the house and when they're home from those, and asks the family about anything they usually cover while away, so don't add drives to the airport. Before adding a trip, look at those days with find_events: a flight, drive or trip already on the calendar (the work email adds most flights) is not added again — say it's already there and add only what's missing. Ask a short question when a request could mean more than one thing. Now it is ${today.weekday} ${today.month} ${today.day}, ${today.clock}, in ${homeCity ?? 'West Palm Beach'}; times are local, and tool times are local "YYYY-MM-DDTHH:MM".`
  const sections = [
    intro,
    // Who "I" is (Jake, Oct 3: "when Kelly is logged in and says, Im going to the gym … kelly is the attendee and driver").
    ...(speaker ? [speaker] : []),
    `DAYS (the next two weeks):\n${Array.from({ length: 14 }, (_, i) => { const d = local(new Date(now.getTime() + i * 86400e3).toISOString(), utcOffset); return `${i === 0 ? 'today' : i === 1 ? 'tomorrow' : d.weekday} = ${d.weekday} ${d.month} ${d.day} (${d.date})` }).join('\n')}`,
    memoryContext(memory, { due: dueThoughtId }),
    `FAMILY:\n${family.map((m) => `- ${m.name} (${[m.full_name && m.full_name !== m.name ? m.full_name : null, m.role, m.can_drive ? 'drives' : null].filter(Boolean).join(', ')})`).join('\n')}`,
    `CALENDAR (today through three weeks out; [id] first — for any other date, the past, or to check whether something is on the calendar at all, call find_events):\n${events.map((e) => `- ${describeEvent(e, utcOffset)}`).join('\n') || '- nothing'}`,
    `GROCERY LIST ([id] first):\n${groceries.map((g) => `- ${g.id ? `[${g.id}] ` : ''}${g.name}${g.quantity ? ` (${g.quantity})` : ''}${g.checked ? ' · checked off' : ''}`).join('\n') || '- empty'}`,
  ]
  // His open to-do list (the "To Do" list on his phone), so a repeat is noticed and a project can
  // grow from what he already captured (live check 2026-09-28: "Paint the house" was added twice).
  if (todos.length) {
    const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '')
    sections.push(`TO-DO LIST (his open to-dos; [id] first — if what he asks to add is already on it, say so instead of adding it again, and a project grows from it with from_id):\n${todos.map((t) => `- [${t.id}] ${t.title}${t.due ? ` · by ${day(t.due)}${t.time ? `, ${t.time}` : ''}${t.late ? ' (late)' : ''}` : ''}`).join('\n')}`)
  }
  // The household's chores (Jake's bug report, Oct 1: "nothing on todos or reminders?" never mentioned the trash or
  // Liv's meds — Casa didn't know them). Who, which days, when; today's say whether they're done.
  if (chores.length) sections.push(`CHORES (the household's routine jobs; not on the calendar):\n${chores.map(describeChore).join('\n')}`)
  if (projects.length) {
    sections.push(`PROJECTS (saved, each with its steps in order — done, NOW (side by side when there are several), then the rest; ${planning ? 'change one with set_plan: edit_step, add_step, remove_step, or close_project to replace it' : 'to change one or its steps, call think_it_through; a saved to-do is changed by tapping it on the To do screen'}; a new plan_project card would make a second project):\n${projects.map(describeProject).join('\n')}`)
  }
  // The whole Coming up list (P3.25 phase 1): "the Halloween decorations" already has a starter plan.
  if (comingUp.length) {
    sections.push(`COMING UP (the whole list of what needs getting ready, soonest plan-by first; a season with a starter plan can start as a project; get_coming_up has the every-time rules and gift ideas):\n${comingUp.map((i) => `- ${[
      i.title, shortDay(i.date), `plan by ${shortDay(i.pokeOn)}${i.late ? ' (late)' : ''}`, i.nextStep ? `next: ${i.nextStep}` : null,
      i.startable && i.plan ? `a starter plan: ${i.plan.steps} steps, first "${i.plan.first}"` : null,
    ].filter(Boolean).join(' · ')}`).join('\n')}`)
  }
  if (home) sections.push(`HOME: ${home}`)
  if (places.length) sections.push(`SAVED PLACES:\n${places.map((p) => `- ${p.name}${p.address ? ` · ${p.address}` : ''}${p.phone ? ` · ${p.phone}` : ''}`).join('\n')}`)
  if (contacts.length) sections.push(`CONTACTS:\n${contacts.map((c) => `- ${[c.name, c.relationship, c.phone, c.email, c.address ? `lives at ${c.address}` : c.place].filter(Boolean).join(' · ')}`).join('\n')}`)
  if (recipes.length) sections.push(`RECIPES (open one with get_recipe):\n${recipes.map((r) => `- [${r.id}] ${r.name}`).join('\n')}`)
  if (pending?.tool === 'apply_plan') sections.push(`ON SCREEN, THE PLAN, NOT SAVED YET: ${describePlan(pending.args, utcOffset)}\nA change he asks for: call set_plan again with the whole plan, changed.`)
  else if (pending) sections.push(`ON SCREEN, WAITING FOR A YES: ${describeDraft(pending, utcOffset)} — a follow-up about it changes this same card (call the same tool again with the whole corrected item).`)
  // "Casa, what can you do?" (P3.19 3c): the same list as the tips and "What can I say?".
  sections.push(`WHAT YOU CAN DO (asked what you can do or what to say: two or three short examples from different topics, then that saying "what can I say?" shows them all on the screen):\n${tipsByTopic().map((g) => `${g.topic}: ${g.tips.map((t) => t.text).join(' | ')}`).join('\n')}`)
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
    parameters: { type: 'OBJECT', properties: { title: { type: 'STRING', description: 'Short calendar name for the thing itself — never prefixed with a person ("Dentist", not "Liv: Dentist"); who goes in people' }, start: LOCAL, end: LOCAL, all_day: { type: 'BOOLEAN' }, people: { type: 'ARRAY', items: { type: 'STRING' } }, place: { type: 'STRING', description: 'Where, as they said it; a name is enough. The card finds the address, and asks which one when there are several (a chain, two branches), so never ask which location yourself.' }, kind: { type: 'STRING', enum: ['event', 'reminder'] } }, required: ['title', 'start'] },
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
  { name: 'plan_project', description: 'Propose a big, multi-step home project as a plan: its steps in order (4–9, each a concrete action; the first small enough to do this week), with rough minutes and dollars per step, and an aim date if he gave one. If it is already on his list as a reminder, pass that [id] as from_id so it grows from it instead of a duplicate. Never ask him for the steps — propose them from how such jobs go; he changes them by talking, and nothing is saved until he says yes. Call it only when he asks for the project itself ("make it a project", "add the fence as a project", "set it up" after talking it through) — planning something together is a conversation first. When he does ask for a project, always call this — never write the steps out in words instead (only this card can save them).', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, minutes: { type: 'NUMBER' }, cost: { type: 'NUMBER', description: 'dollars' } }, required: ['title'] } }, aim_date: { type: 'STRING', description: 'YYYY-MM-DD' }, from_id: { type: 'STRING' } }, required: ['title', 'steps'] } },
  // The whole calendar, past and future, reminders included (Jake, 2026-09-28: "search my whole calendar").
  { name: 'find_events', description: 'Look up the calendar beyond the three weeks shown above, past or future: a day (from), a span (from and to), and/or words from the title or place. Reminders are included. Use it for any date not listed, or to check whether something is on the calendar. Asked about any or every time, the last time, or the past: words and no dates — that searches two years either way.', parameters: { type: 'OBJECT', properties: { from: { type: 'STRING', description: 'YYYY-MM-DD' }, to: { type: 'STRING', description: 'YYYY-MM-DD' }, query: { type: 'STRING', description: 'words to look for' } } } },
  { name: 'get_gift_ideas', description: 'The gift ideas saved so far (for one person, or everyone).', parameters: { type: 'OBJECT', properties: { for: { type: 'STRING' } } } },
  // Coming up (P3.19): what needs planning ahead, each with a next step and days of notice.
  { name: 'add_to_coming_up', description: 'Propose putting one calendar item [id] on the Coming up list: what to get ready (the next step, in a few words) and how many days of notice.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, step: { type: 'STRING' }, notice_days: { type: 'INTEGER' } }, required: ['id', 'step', 'notice_days'] } },
  { name: 'add_coming_up_rule', description: 'Propose an "every time" rule for the Coming up list: any calendar item whose name has these words gets this step and this many days of notice — or, with off, is never flagged.', parameters: { type: 'OBJECT', properties: { match: { type: 'STRING', description: 'The fewest words that pick these items out by name, e.g. "spirit day", "dentist" (every word must be in the name)' }, step: { type: 'STRING' }, notice_days: { type: 'INTEGER' }, off: { type: 'BOOLEAN' } }, required: ['match'] } },
  { name: 'change_coming_up_item', description: 'Propose marking a Coming up item [id]: done, snooze (a week) or not_needed.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, action: { type: 'STRING', enum: ['done', 'snooze', 'not_needed'] } }, required: ['id', 'action'] } },
  { name: 'get_coming_up', description: 'The Coming up list: what needs starting within the next days (default 14), each with its next step, plan-by date and gift ideas, how many more are later, and the family\'s "every time" rules. Talking about a holiday, a season or planning ahead: within_days 120, for the whole list (a season with a starter_plan can start as a project).', parameters: { type: 'OBJECT', properties: { within_days: { type: 'INTEGER', description: '1 to 120' } } } },
  // Lookups (read only; the answer comes back to you, nothing changes).
  { name: 'search_web', description: 'Search the web for current facts (opening hours, events in town, anything not in the family data), and while talking something through: ideas and what people are doing this year (add "Reddit" to the query for real people\'s ideas), prices right now, and what\'s available locally.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
  { name: 'search_places', description: 'Find a business or place near home (name, address, phone).', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' }, city: { type: 'STRING' } }, required: ['query'] } },
  { name: 'get_weather_forecast', description: 'The weather forecast (home unless a location is given).', parameters: { type: 'OBJECT', properties: { location: { type: 'STRING' }, hours_ahead: { type: 'INTEGER' } } } },
  { name: 'get_travel_eta', description: 'Drive time and when to leave (from home unless an origin is given); times are ISO.', parameters: { type: 'OBJECT', properties: { destination: { type: 'STRING' }, origin: { type: 'STRING' }, arrival_time: { type: 'STRING' }, departure_time: { type: 'STRING' } }, required: ['destination'] } },
  { name: 'get_recipe', description: 'Open one saved recipe by its [id]: ingredients and steps.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' } }, required: ['id'] } },
  { name: 'search_family_notes', description: "Search the family's emails, notes and remembered facts (a school email, a confirmation, something someone said to remember).", parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
  // The email review (canvas row 14): Casa opens it on the screen.
  { name: 'open_email_review', description: 'Open the review of what came in by email on the screen, one email at a time ("what came in by email?", "anything from email?", "any emails I should know about?"). It returns how many are waiting; say it in a few words.', parameters: { type: 'OBJECT', properties: {} } },
  // Get & pack by voice (Jake, 2026-09-30: nobody says "get and pack").
  { name: 'add_prep_item', description: 'Propose a line on an upcoming event\u2019s get & pack list — something to get ready for it: check, dry, find, pack, bring, charge, wash, print, sign ("dry Liv\u2019s cleats" for her game, "find Owen\u2019s pink kindergarten shirt" for the field trip, "don\u2019t forget Emme\u2019s violin"). The event\u2019s [id] from the calendar; the item as a short line. Several events could fit: ask which.', parameters: { type: 'OBJECT', properties: { event_id: { type: 'STRING' }, item: { type: 'STRING' } }, required: ['event_id', 'item'] } },
  // Directions (Jake, 2026-09-29: "Navigate to Alice's house" — it couldn't). The route goes on the screen.
  { name: 'show_directions', description: 'Directions to a person or a place ("navigate to Alice\u2019s house", "directions to Liv\u2019s coach", "how do I get to Lake Lytal"): who or where, as in CONTACTS or PLACES. The screen shows the address and the Google Maps route (a QR code for his phone on the wall, a button on a computer or the phone); then say where it is in a few words — with the drive time from get_travel_eta when it helps. No address saved: ask him for it, then save_address.', parameters: { type: 'OBJECT', properties: { to: { type: 'STRING' } }, required: ['to'] } },
  { name: 'save_address', description: 'Propose saving an address he told you for someone in CONTACTS ("Alice lives at 8255 West Lake Drive").', parameters: { type: 'OBJECT', properties: { contact: { type: 'STRING' }, address: { type: 'STRING' } }, required: ['contact', 'address'] } },
  { name: 'remember', description: 'Save something he tells you to keep, at once (no card): a fact about someone or something ("Liv also does debate on Thursdays", "the kids\u2019 dentist is Dr. Wanuk"), a correction of one (replaces_id: its [id] in WHAT CASA KNOWS — "that\u2019s wrong, she\u2019s in 8th grade"), or with kind "thought" something to come back to ("remember I want to look at a pergola in the spring"). about: who or what, as he said it. words: what on a flyer or in an email would point to it ("Bak", "Huskies").', parameters: { type: 'OBJECT', properties: { about: { type: 'STRING' }, fact: { type: 'STRING', description: 'one short line, in his words' }, kind: { type: 'STRING', enum: ['fact', 'thought'] }, words: { type: 'ARRAY', items: { type: 'STRING' } }, replaces_id: { type: 'STRING' } }, required: ['about', 'fact'] } },
  { name: 'forget', description: 'At once, no card: forget one fact for good, or close an open thought ("forget the orthodontist thing", "I did the pergola", "drop that idea"): its [id]; done true when a thought was done rather than dropped.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, done: { type: 'BOOLEAN' } }, required: ['id'] } },
  { name: 'undo_memory', description: 'At once, no card: take back the last remember or forget ("undo that"): its [id]. A correction undone brings back what it replaced.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' } }, required: ['id'] } },
  { name: 'keep_me_posted', description: 'Propose keeping him posted on a kind of email ("keep me posted on emails from Liv\u2019s coach", "tell me about anything from Sally Rozanski", "always show me emails about Owen\u2019s therapy"): a sender or a topic, in his words. From then on every such email is a line of what it says in "Anything from email?", never skipped. "about" is in his words as he said them ("emails from Owen\u2019s therapist") — no need to know who that is. The card asks his yes.', parameters: { type: 'OBJECT', properties: { about: { type: 'STRING' } }, required: ['about'] } },
  // A day on the screen (Jake, 2026-09-29: "Can you open this day for me" — it couldn't). Changes nothing.
  { name: 'show_day', description: 'Put one day on the screen: the wall\u2019s day view (the phone\u2019s Me), with the week around it to swipe through. open true when he asks to open, show or look at a day ("open October 17th", "can you open this day for me", "show me next Saturday"); open false when your answer is about one particular day, so the screen offers a button to open it. Then answer in words as usual.', parameters: { type: 'OBJECT', properties: { date: { type: 'STRING', description: 'YYYY-MM-DD' }, open: { type: 'BOOLEAN' } }, required: ['date'] } },
]

/** Lookups the server runs for D (the old path's code, `lookups.ts`). */
// The fast model's way to hand a turn to the planning model (P3.25): not a lookup — it changes who answers.
export const THINK_IT_THROUGH = 'think_it_through'
const THINK_IT_THROUGH_TOOL = { name: THINK_IT_THROUGH, description: 'Call this, and nothing else, when he wants to talk something through rather than a quick fact or a single change: ideas, a theme, a holiday or season, a party, a project, a trip, something he wants to make or do (not a single thing to add), planning something with him ("let’s plan …", "help me plan …"), a change to one of his saved projects or its steps ("move the build night to Saturday", "Kelly\'s doing the tentacles"), whether something is a good idea, or help thinking about anything — or when the conversation is already thinking something through and he\'s carrying it on. A slower, more thoughtful model then answers him.', parameters: { type: 'OBJECT', properties: {} } }
// The planning model sets the whole plan (P3.25 phase 3; canvas 12b): each call replaces it, so a
// change is just the plan again — the card is revised in place, and nothing saves until he agrees.
const SET_PLAN_TOOL = { name: 'set_plan', description: 'Once a direction is settled (he picked an idea, or asks what he needs or when to do it), set the plan: the whole plan every time — a change he asks for is this again with everything; keep everything already in it unless he asks to take it off. Anything he wants added while planning (a shopping line, a reminder, a date) goes into the plan. Only what matters, each with a short why. It shows beside the conversation; nothing is saved until he agrees on its card. Kinds: project (a new one, its steps in order with minutes, cost in dollars, who, date; part_of_project_id puts it inside one of his saved projects — when one covers it, same occasion or job, put it inside that one), tick_step (a saved step this settles: project_id and step_id), event (a timed calendar event: start and end local "YYYY-MM-DDTHH:MM"), todo (title, due), shopping (name), pack (label, for_event: a calendar [id] or the title of an event in this plan), event_details (event_id: a calendar [id] already there, and only what\'s new: start, end, place, notes, people — a flyer\'s details for an event that\'s already on the calendar, never a second copy of it). To change one of his saved projects, change it — never rebuild it: edit_step (project_id, step_id, and only what changes: title, who, date, minutes, cost), add_step (project_id, title, after_step_id, and any of who, date, minutes, cost), remove_step (project_id, step_id), move_step (project_id, step_id, after_step_id — the step it goes right after; none to go first: "move the painter after the stucco"). When a project is being replaced by a different idea ("she wants to be Chucky now"), close_project it with a short reason and add the new project in its place (the same part_of_project_id); what\'s already done stays. A dated project step goes on the calendar by itself — don\'t add it again as an event; date a step only when it happens on a set day, and one session is one calendar entry (one event, or date only its first step).', parameters: { type: 'OBJECT', properties: {
  title: { type: 'STRING', description: 'what the plan is for, in a few words' },
  items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    kind: { type: 'STRING', enum: ['project', 'tick_step', 'event', 'todo', 'shopping', 'pack', 'edit_step', 'add_step', 'remove_step', 'move_step', 'close_project', 'event_details'] },
    title: { type: 'STRING' }, why: { type: 'STRING', description: 'one short reason' },
    part_of_project_id: { type: 'STRING' }, aim_date: { type: 'STRING', description: 'YYYY-MM-DD' },
    steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, minutes: { type: 'NUMBER' }, cost: { type: 'NUMBER', description: 'dollars' }, who: { type: 'STRING' }, date: { type: 'STRING', description: 'YYYY-MM-DD' }, end_date: { type: 'STRING', description: 'YYYY-MM-DD' } }, required: ['title'] } },
    project_id: { type: 'STRING' }, step_id: { type: 'STRING' },
    start: { type: 'STRING' }, end: { type: 'STRING' }, due: { type: 'STRING', description: 'YYYY-MM-DD' },
    name: { type: 'STRING' }, label: { type: 'STRING' }, for_event: { type: 'STRING' },
    who: { type: 'STRING' }, date: { type: 'STRING', description: 'YYYY-MM-DD' }, end_date: { type: 'STRING', description: 'YYYY-MM-DD' }, minutes: { type: 'NUMBER' }, cost: { type: 'NUMBER', description: 'dollars' },
    event_id: { type: 'STRING' }, place: { type: 'STRING' }, notes: { type: 'STRING' }, people: { type: 'ARRAY', items: { type: 'STRING' } },
    after_step_id: { type: 'STRING' }, reason: { type: 'STRING', description: 'why a project is closed, in a few words: "Changed to Chucky"' },
  }, required: ['kind'] } },
}, required: ['title', 'items'] } }
// While planning, the model only looks things up and changes the plan (Owen's costume, 2026-09-29:
// shopping lines and a reminder came out as separate cards instead of going into the plan).
export function fullAiTools({ planning }) {
  return planning ? [...FULL_AI_TOOLS.filter((t) => READ_TOOLS.has(t.name)), SET_PLAN_TOOL] : [...FULL_AI_TOOLS, THINK_IT_THROUGH_TOOL]
}

export const LOOKUP_TOOLS = ['search_web', 'search_places', 'get_weather_forecast', 'get_travel_eta']
/** Tools that only read; everything else becomes a card that needs a yes. */
const MEMORY_TOOLS = new Set(['remember', 'forget', 'undo_memory'])
export const READ_TOOLS = new Set([...LOOKUP_TOOLS, 'get_recipe', 'search_family_notes', 'get_gift_ideas', 'get_coming_up', 'find_events', 'show_day', 'show_directions', 'open_email_review', 'remember', 'forget', 'undo_memory'])

/** show_day's arguments: a real calendar date (YYYY-MM-DD) and whether to open it now. */
export function readShowDay(args) {
  const date = typeof args?.date === 'string' ? args.date.trim() : ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null
  return { date, open: args.open === true }
}

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
// set_plan → the draft card (P3.25 phase 3): every item checked against what's really there, with
// an id for its tick on the card; anything that can't be saved is left out, never guessed.
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/
function planCard(a, { events = [], utcOffset, now, projects = [], family = [] }) {
  const title = text(a.title)
  const raw = Array.isArray(a.items) ? a.items.slice(0, 20) : []
  const day = (v) => (typeof v === 'string' && ISO_DAY_RE.test(v) ? v : null)
  const whyOf = (i) => { const w = text(i?.why); return w ? w.slice(0, 160) : null }
  const kept = []
  for (const i of raw) {
    const why = whyOf(i)
    const withWhy = (item) => (why ? { ...item, why } : item)
    if (i?.kind === 'project') {
      const t = text(i.title)
      const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null }
      const steps = (Array.isArray(i.steps) ? i.steps : []).map((st) => {
        const step = { title: text(st?.title) }
        const minutes = num(st?.minutes, 60 * 24 * 7); if (minutes) step.minutes = minutes
        const cost = num(st?.cost, 100000); if (cost) step.cost_cents = cost * 100
        const who = text(st?.who); if (who) step.who = who
        const start = day(st?.date); if (start) step.cal_start = start
        const end = day(st?.end_date); if (start && end && end > start) step.cal_end = end
        return step
      }).filter((st) => st.title).slice(0, 12)
      if (!t || steps.length === 0) continue
      const parent = projects.find((p) => p.id === i.part_of_project_id)
      const item = { kind: 'project', title: t, steps }
      if (parent) { item.part_of_project_id = parent.id; item.part_of = parent.title }
      const aim = day(i.aim_date); if (aim) item.aim_date = aim
      kept.push(withWhy(item))
    } else if (i?.kind === 'tick_step') {
      const project = projects.find((p) => p.id === i.project_id)
      const step = project?.steps?.find((st) => st.id === i.step_id && !st.done)
      if (!step) continue
      kept.push(withWhy({ kind: 'tick_step', project_id: project.id, step_id: step.id, title: step.title, project: project.title }))
    } else if (i?.kind === 'event') {
      const t = text(i.title)
      const hasTime = /T\d{2}:\d{2}/.test(String(i.start ?? ''))
      const start = hasTime ? localToIso(i.start, utcOffset, now) : null
      if (!t || !start) continue
      const end = /T\d{2}:\d{2}/.test(String(i.end ?? '')) ? localToIso(i.end, utcOffset, now) : null
      const endIso = end && Date.parse(end) > Date.parse(start) ? end : `${new Date(Date.parse(start) + 60 * 60e3 + offsetMinutes(utcOffset) * 60e3).toISOString().slice(0, 16)}:00${utcOffset}`
      kept.push(withWhy({ kind: 'event', title: t, start, end: endIso }))
    } else if (i?.kind === 'todo') {
      const t = text(i.title)
      if (!t) continue
      const item = { kind: 'todo', title: t }
      const due = day(i.due); if (due) item.due = due
      kept.push(withWhy(item))
    } else if (i?.kind === 'shopping') {
      const name = text(i.name) ?? text(i.title)
      if (name) kept.push(withWhy({ kind: 'shopping', name }))
    } else if (i?.kind === 'pack') {
      const label = text(i.label) ?? text(i.title)
      const target = text(i.for_event)
      if (!label || !target) continue
      kept.push(withWhy({ kind: 'pack', label, for_event: target }))
    } else if (i?.kind === 'edit_step' || i?.kind === 'add_step' || i?.kind === 'remove_step') {
      // A change to a saved project (phase 4): the project and step must really be there.
      const project = projects.find((p) => p.id === i.project_id)
      if (!project) continue
      const changes = {}
      const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null }
      if (i.kind === 'edit_step' && text(i.title)) changes.title = text(i.title)
      if (text(i.who)) changes.who = text(i.who)
      const start = day(i.date); if (start) changes.cal_start = start
      const end = day(i.end_date); if (start && end && end > start) changes.cal_end = end
      const minutes = num(i.minutes, 60 * 24 * 7); if (minutes) changes.minutes = minutes
      const cost = num(i.cost, 100000); if (cost) changes.cost_cents = cost * 100
      if (i.kind === 'add_step') {
        const t = text(i.title)
        if (!t) continue
        delete changes.title
        const after = project.steps?.find((st) => st.id === i.after_step_id)
        const item = { kind: 'add_step', project_id: project.id, project: project.title, title: t }
        if (after) { item.after_step_id = after.id; item.after = after.title }
        if (Object.keys(changes).length) item.changes = changes
        kept.push(withWhy(item))
        continue
      }
      const step = project.steps?.find((st) => st.id === i.step_id && !st.child)
      if (!step) continue
      if (i.kind === 'remove_step') { kept.push(withWhy({ kind: 'remove_step', project_id: project.id, step_id: step.id, project: project.title, title: step.title })); continue }
      if (!Object.keys(changes).length) continue
      kept.push(withWhy({ kind: 'edit_step', project_id: project.id, step_id: step.id, project: project.title, title: step.title, changes }))
    } else if (i?.kind === 'event_details') {
      // A photo's details for an event already on the calendar (P3.24): only what's new, on the real event.
      const target = events.find((e) => e.id === i.event_id)
      if (!target) continue
      const changes = {}
      const start = /T\d{2}:\d{2}/.test(String(i.start ?? '')) ? localToIso(i.start, utcOffset, now) : null
      const end = /T\d{2}:\d{2}/.test(String(i.end ?? '')) ? localToIso(i.end, utcOffset, now) : null
      if (start) changes.start = start
      if (start && end && Date.parse(end) > Date.parse(start)) changes.end = end
      if (text(i.place)) changes.place = text(i.place).slice(0, 200)
      if (text(i.notes)) changes.notes = text(i.notes).slice(0, 600)
      const people = (Array.isArray(i.people) ? i.people : []).map((n) => memberNamed(String(n), family)?.name).filter(Boolean)
      if (people.length) changes.people = [...new Set(people)]
      if (!Object.keys(changes).length) continue
      kept.push(withWhy({ kind: 'event_details', event_id: target.id, title: target.title, changes }))
    } else if (i?.kind === 'move_step') {
      // Step 4 (P3.25): a saved step moved right after another of its project's steps, or first.
      const project = projects.find((p) => p.id === i.project_id)
      const step = project?.steps?.find((st) => st.id === i.step_id)
      if (!project || !step) continue
      const item = { kind: 'move_step', project_id: project.id, step_id: step.id, project: project.title, title: step.title }
      if (i.after_step_id) {
        const after = project.steps.find((st) => st.id === i.after_step_id && st.id !== step.id)
        if (!after) continue
        item.after_step_id = after.id; item.after = after.title
      }
      kept.push(withWhy(item))
    } else if (i?.kind === 'close_project') {
      const project = projects.find((p) => p.id === i.project_id)
      if (!project) continue
      kept.push(withWhy({ kind: 'close_project', project_id: project.id, title: project.title, reason: (text(i.reason) ?? 'Replaced').slice(0, 80), open_steps: (project.steps ?? []).filter((st) => !st.done).length }))
    }
  }
  // One session, one calendar entry (Jake's first plan put four steps and an event on one Sunday):
  // a timed event of this plan covers its day, and of several steps on one day only the first is dated.
  const eventDays = new Set(kept.filter((i) => i.kind === 'event').map((i) => i.start.slice(0, 10)))
  for (const item of kept) {
    if (item.kind !== 'project') continue
    const seen = new Set()
    for (const st of item.steps) {
      if (!st.cal_start) continue
      if (eventDays.has(st.cal_start) || seen.has(st.cal_start)) { delete st.cal_start; delete st.cal_end } else seen.add(st.cal_start)
    }
  }
  // Ids for the ticks, then each pack line pointed at its event (a saved one, or one of this plan).
  const items = kept.map((item, n) => ({ id: `i${n + 1}`, ...item }))
  const out = []
  for (const item of items) {
    if (item.kind !== 'pack') { out.push(item); continue }
    const { for_event: target, ...rest } = item
    const saved = events.find((e) => e.id === target)
    const planned = items.find((o) => o.kind === 'event' && o.title.toLowerCase() === target.toLowerCase())
    if (saved) out.push({ ...rest, event_id: saved.id, event_title: saved.title })
    else if (planned) out.push({ ...rest, event_ref: planned.id, event_title: planned.title })
  }
  if (!out.length) return { error: 'There’s nothing in that plan I can save yet.' }
  return { tool: 'apply_plan', args: { id: 'plan', title: title ?? out[0].title ?? out[0].name ?? 'The plan', items: out } }
}

const names = (v) => (Array.isArray(v) ? v.map((n) => String(n).trim()).filter(Boolean) : [])
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
/** Days of notice for Coming up: a whole number, one day to four months. */
const noticeDays = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.min(120, Math.max(1, Math.round(Number(v)))) : null)

/** The model's tool call as the usual card, or { error } when it fails a hard check. */
export function fullAiCard(call, { events, utcOffset, now, groceries = [], family = [], todos = [], projects = [], contacts = [] }) {
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
  if (call?.name === 'set_plan') return planCard(a, { events, utcOffset, now, projects, family })
  if (call?.name === 'add_prep_item') {
    const label = text(a.item)
    if (!label) return { error: 'I need to know what to get ready.' }
    const event = (events ?? []).find((e) => e.id === a.event_id)
    if (!event) return { error: 'I need to know which event it’s for.' }
    return { tool: 'add_prep_item', args: { event_id: event.id, label, event_title: event.title, event_start: event.start_time } }
  }
  if (call?.name === 'save_address') {
    const who = text(a.contact)
    const address = text(a.address)
    if (!address) return { error: 'I need the address itself.' }
    const person = contactNamed(who, contacts)
    if (!person) return { error: `I don’t have ${who || 'that person'} in the contacts.` }
    return { tool: 'save_address', args: { contact_id: person.id, name: person.name, address } }
  }
  if (call?.name === 'keep_me_posted') {
    const about = text(a.about)
    if (!about) return { error: 'I need to know which emails to keep you posted on.' }
    return { tool: 'keep_me_posted', args: { about } }
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
    if (!event) return { error: call.name === 'delete_event' ? "I don't see that on the calendar, so there's nothing to remove." : "I don't see that on the calendar yet. Want me to add it?" }
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
  // The everyday answer stays short (five); asked about a season or a plan, the whole of it.
  const soon = (items ?? []).filter((i) => i.pokeOn <= until).slice(0, days > 14 ? 25 : 5)
  return {
    items: soon.map((i) => ({ id: i.key, title: i.title, date: i.date, days_away: i.daysAway, next_step: i.nextStep, plan_by: i.pokeOn, late: i.late || undefined, gift_ideas: i.ideas?.length ? i.ideas : undefined, starter_plan: i.startable && i.plan ? { steps: i.plan.steps, first: i.plan.first } : undefined })),
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

// The hand-back to the old path (P3.17's safety net) only while that path can still answer: it loads
// its context and calls the model inside the same 9 s request budget. On 2026-09-29 9:12 AM D spent
// 8 s and handed back with nothing left, so the old path failed at 0 ms (a 504). Below this, D says
// so itself.

// Gemini 2.5 Flash sometimes answers a thinking + tools call with nothing at all; the one retry
// asks for words (tools off) instead of the same call again — the 9:12 turn came back empty twice.
const FINAL_ROUND_NOTE = 'Answer now, in words, with what you have found (no more lookups this time).'
const EMPTY_RETRY_NOTE = 'This time, answer in words (your tools are off for this reply). If they asked for a change, don’t say you added, changed or saved anything — say what you would set up and that you’ll do it when they say so.'
export function fullAiRequest({ system, contents, tools, retryAfterEmpty = false, finalRound = false, mustAct = false }) {
  // mustAct 'look': a lookup promised and not done ("Let me check the weather for you."; Oct 5) — a lookup this time.
  const note = retryAfterEmpty ? EMPTY_RETRY_NOTE : finalRound ? FINAL_ROUND_NOTE : null
  // A promise sent back (promisesAction): this time it must call one of the tools that act — asked in words
  // alone, it once wrote the call out as text ("forget(id='…')").
  const acting = tools.map((t) => t.name).filter((n) => !(READ_TOOLS.has(n) && !MEMORY_TOOLS.has(n)) && n !== THINK_IT_THROUGH)
  const looking = tools.map((t) => t.name).filter((n) => LOOK_TOOLS.has(n))
  const allowed = mustAct === 'look' ? looking : acting
  const calling = mustAct && !note && allowed.length ? { mode: 'ANY', allowed_function_names: allowed } : { mode: note ? 'NONE' : 'AUTO' }
  return {
    system_instruction: { parts: [{ text: note ? `${system}\n\n${note}` : system }] },
    contents,
    tools: [{ function_declarations: tools }],
    tool_config: { function_calling_config: calling },
    // Gemini's own dynamic thinking: it decides how much to think.
    generation_config: { thinking_config: { thinking_budget: -1 }, max_output_tokens: 8192 },
  }
}

// What Casa is doing while he waits (P3.25 phase 1): one line on the band, sent as the turn runs.
export function fullAiStatus(call) {
  const args = call?.args ?? {}
  const clip = (t) => (t.length > 60 ? `${t.slice(0, 59)}…` : t)
  switch (call?.name) {
    case 'search_web': return args.query ? `Searching the web: ${clip(String(args.query))}` : 'Searching the web…'
    case 'search_places': return args.query ? `Looking up ${clip(String(args.query))}…` : 'Looking up places…'
    case 'get_coming_up': return 'Checking Coming up…'
    case 'find_events': return 'Looking through the calendar…'
    case 'get_weather_forecast': return 'Checking the weather…'
    case 'get_travel_eta': return 'Working out the drive…'
    case 'get_recipe': return 'Opening the recipe…'
    case 'get_gift_ideas': return 'Checking the gift ideas…'
    case 'search_family_notes': return 'Looking through the family notes…'
    case 'show_day': return null
    case 'show_directions': return null
    case 'open_email_review': return null
    default: return 'Looking that up…'
  }
}

// Directions (canvas 13c/13d): a person or a place, the way he says it — "Alice", "Alice's house",
// "Coach Mike", "Liv's softball coach", "Lake Lytal".
const plain = (t) => String(t ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()
const bare = (t) => plain(t).replace(/^(the|to) /, '').replace(/('s)? (house|home|place)$/, '').replace(/'s$/, '').trim()

function contactNamed(said, contacts = []) {
  const q = bare(said)
  if (!q) return null
  const names = (c) => [c.name, ...(c.aliases ?? [])].map(bare)
  return contacts.find((c) => names(c).includes(q))
    ?? contacts.find((c) => bare(c.relationship) === q || bare(c.place) === q)
    ?? contacts.find((c) => names(c).some((n) => n.split(' ')[0] === q))
    ?? null
}

/** Where to drive: { name, address, phone, maps } · { missing: name } (no address saved) · null (no one by that name). */
export function directionsFor(said, { contacts = [], places = [] } = {}) {
  const route = (name, address, phone) => ({ name, address, phone: phone ?? null, maps: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` })
  const person = contactNamed(said, contacts)
  if (person?.address) return route(person.name, person.address, person.phone)
  // A contact with no address can share a name with a saved place that has one ("Lake Lytal Park" is both).
  const q = bare(said)
  const place = q ? places.find((p) => bare(p.name) === q) ?? places.find((p) => bare(p.name).includes(q)) : null
  if (place?.address) return route(place.name, place.address, place.phone)
  return person ? { missing: person.name } : null
}

/** Casa's own question when a route has no address (the server asks it; see conversation.directions_missing). */
export const askAddress = (name) => `I don’t have an address saved for ${name}. What is it?`

/**
 * The answer to Casa's "What is it?" about an address: { who, address } — the person Casa asked about and
 * the address as said ("It's 412 Palm Way, Jupiter"); null when the reply isn't an address (a number and a word).
 */
export function addressReply(askedBefore, said) {
  const m = /^I don’t have an address saved for (.+)\. What is it\?$/.exec(String(askedBefore ?? '').trim())
  if (!m) return null
  const address = String(said ?? '').trim().replace(/^(it[’']?s|it is|that[’']?s|the address is|they[’']?re at|she[’']?s at|he[’']?s at|at|.{1,60}?[’']s address is)\s+/i, '').replace(/[.!]+$/, '').trim()
  return /\d/.test(address) && /[a-z]{2,}/i.test(address) && address.length <= 200 ? { who: m[1], address } : null
}

// A reply that promises an action it didn't take (open bug 8f58eddc, 2026-09-30: "I'll set that up for you" with
// no card; "I'll remember …" with nothing saved). The loop sends it back once: call the tool, or say nothing was saved.
const PROMISE = [
  /\b(?:i['’]ll|i will|i would|i['’]d|i['’]m going to|let me)\s+(?:go ahead and\s+)?(?:remember|forget|note|save|add|put|set (?:it|that|this|them) up|set up|create|make|schedule|remove|take|delete|move|change|update|keep)\b/i,
  /\b(?:say yes|confirm)\b[^.]*\bcard\b/i,
  /\bcard\b[^.]*\b(?:to confirm|for you to confirm|ready)\b/i,
]
const ASKS_FIRST = /\?\s*$|\b(?:need|first)\b[^.]*\?/i

// A lookup promised and not done (Oct 5, live: "Let me check the weather for you." and "I can look up the weather for
// Wellington, Florida, this afternoon." — and no lookup, so no weather). Sent back once: look it up now, then answer.
const LOOK_PROMISE = /\b(?:let me|i['’]ll|i will|i can|i['’]m going to)\s+(?:quickly\s+|just\s+)?(?:check|look(?: (?:it|that|this))? up|look into|find out|pull up|search(?: for)?)\b/i
const LOOK_TOOLS = new Set(['search_web', 'search_places', 'get_weather_forecast', 'get_travel_eta', 'find_events', 'get_coming_up', 'search_family_notes', 'get_recipe'])
export function promisesLookup(said) {
  const t = String(said ?? '').trim()
  if (!t || ASKS_FIRST.test(t) || /\b(?:can['’]t|cannot|unable)\b/i.test(t)) return false
  return LOOK_PROMISE.test(t)
}
export function promisesAction(said) {
  const t = String(said ?? '').trim()
  if (!t) return false
  if (ASKS_FIRST.test(t) && !/\bcard\b/i.test(t)) return false
  return PROMISE.some((re) => re.test(t))
}

/**
 * Someone telling Casa they're going away (design doc "Casa: Travel design"): flying anywhere, a work or business
 * trip, out of town, or driving somewhere and staying. The full model takes these turns (it asks for the flights or
 * the drive and adds the trip the wall reads); the quick turn reader made a one-day all-day entry and asked nothing
 * (live check, 2026-10-01). A drive to a practice or a school is not a trip.
 */
export function isTripTalk(text) {
  const t = String(text ?? '')
  if (/\b(fly|flying|flies|flew|flight|flights|plane|airport)\b/i.test(t) && /\b(to|from|back|out|home|return|landing|lands)\b/i.test(t)) return true
  if (/\b(work|business|road)\s+trip\b|\btrip\s+to\b|\bout of town\b|\baway\s+(for|until|through|from)\b|\btraveling\b|\btravelling\b/i.test(t)) return true
  // Driving somewhere and staying: "driving to Orlando for work on the 13th, back on the 15th".
  if (/\bdriv(e|ing)\s+(up\s+|down\s+|over\s+)?to\s+[A-Z][\w.-]+/.test(t) && /\b(for work|back|until|through|overnight|staying|stay|hotel|the night|for the (week|weekend)|for \w+ days)\b/i.test(t)) return true
  return false
}

// ── A trip already on the calendar (Jake, 2026-10-01: "make sure it doesn't happen for future trips") ──
// The same reading of trip titles as the wall's (src/wall/engine/travel.ts; a contract test keeps them in step).
export function tripLegOf(title, allDay) {
  const t = String(title ?? '')
  const flight = /\b([A-Z]{3})\s*(?:→|->|–|—|to|-)\s*([A-Z]{3})\b/.exec(t)
  if (flight && /\bflight\b|\b[A-Z0-9]{2}\s?\d{1,4}\b/i.test(t)) {
    const number = /\bflight\s*#?\s*([A-Z0-9]{2}\s?\d{1,4}|\d{1,4})\b/i.exec(t)?.[1] ?? null
    return { kind: 'flight', number: number?.replace(/\s/g, '') ?? null, from: flight[1], to: flight[2] }
  }
  const bare = t.replace(/^.*\|\s*/, '').trim()
  const out = /^drive\s+to\s+(.+)$/i.exec(bare)
  if (out && !/^home\b/i.test(out[1])) return { kind: 'drive', direction: 'out', city: out[1].trim().toLowerCase() }
  const home = /^drive\s+(?:home|back)(?:\s+from\s+(.+))?$/i.exec(bare)
  if (home) return { kind: 'drive', direction: 'home', city: home[1]?.trim().toLowerCase() ?? '' }
  const trip = /\btrip\b(?:\s+to)?\s+(.+)$/i.exec(bare)
  if (allDay && trip) return { kind: 'trip', city: trip[1].replace(/[^\p{L}\s.'-]/gu, '').trim().toLowerCase() }
  return null
}

const HOUR = 3_600_000
const localDay = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York' })

/**
 * Of the proposed create_event cards, the trip legs already on the calendar (the same flight within a few hours, the
 * same drive that day, or a trip to the same city over the same days) — `already` — and the rest — `keep`.
 */
export function alreadyOnCalendar(cards, existing) {
  const legs = existing.map((e) => ({ event: e, leg: tripLegOf(e.title, e.all_day) })).filter((x) => x.leg)
  const keep = []
  const already = []
  for (const card of cards) {
    const args = card.args ?? {}
    const leg = card.tool === 'create_event' ? tripLegOf(args.title, args.all_day === true) : null
    const start = Date.parse(String(args.start ?? ''))
    const end = Date.parse(String(args.end ?? args.start ?? ''))
    const match = leg && Number.isFinite(start) ? legs.find(({ event, leg: other }) => {
      if (other.kind !== leg.kind) return false
      const s = Date.parse(event.start_time)
      const e = Date.parse(event.end_time)
      if (leg.kind === 'flight') {
        const sameFlight = leg.number && other.number ? leg.number === other.number : leg.from === other.from && leg.to === other.to
        return sameFlight && leg.from === other.from && leg.to === other.to && Math.abs(s - start) <= 3 * HOUR
      }
      if (leg.kind === 'drive') return leg.direction === other.direction && (!leg.city || !other.city || leg.city === other.city) && localDay(event.start_time) === localDay(args.start)
      return (leg.city.includes(other.city) || other.city.includes(leg.city)) && s < end + 24 * HOUR && e > start - 24 * HOUR
    }) : null
    if (match) already.push({ card, event: match.event })
    else keep.push(card)
  }
  return { keep, already }
}

/** "Your Dallas trip is already on the calendar: Flight 1419 DJT→DFW (Wed 2:13 PM), …" */
export function alreadyOnCalendarText(already) {
  const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(',', '')
  const items = already.map(({ event }) => event.all_day ? String(event.title).replace(/^.*\|\s*/, '') : `${String(event.title).replace(/^.*\|\s*/, '')} (${when(event.start_time)})`)
  return `Already on the calendar: ${items.join(', ')}.`
}

/**
 * A time edit to a trip leg already on the calendar, when the words only describe the trip ("Flight 1419 from DJT at
 * 2:13, lands DFW at 3:30 their time") rather than change it ("got delayed", "move", "now leaves", "instead"): the
 * flight is already there, in home time (live check, 2026-10-01: Dallas times were taken as home times).
 */
export function describesExistingLeg(card, events, said) {
  if (card?.tool !== 'update_event') return false
  const target = events.find((e) => e.id === card.args?.id)
  if (!target || !tripLegOf(target.title, target.all_day)) return false
  if (/\b(delay\w*|mov(e|ed|ing)|chang\w*|reschedul\w*|now (leaves|lands|departs|gets in)|instead|new time|pushed|earlier|later|cancel\w*|rebook\w*)\b/i.test(String(said ?? ''))) return false
  const start = Date.parse(String(card.args?.start ?? ''))
  return !Number.isFinite(start) || Math.abs(start - Date.parse(target.start_time)) <= 3 * HOUR
}
