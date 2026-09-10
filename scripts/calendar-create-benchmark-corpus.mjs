// scripts/calendar-create-benchmark-corpus.mjs
//
// 100 natural-language "create a calendar event" scenarios for the copilot chat, run
// through the same planner endpoint (`ai-agent-write`) the real chat uses, against a
// fake household — no real event is ever written to the real calendar or synced to
// Google. Measures whether the assistant creates the right event with the right
// resolved date/time/duration WITHOUT asking a question it should be able to answer
// itself (relative dates, past-time rollover to tomorrow, implicit duration,
// context-resolvable AM/PM) — while a control group (category J) checks it still
// asks when a request is genuinely too underspecified to guess safely.
//
// Anchor "now" (matches ai-agent-model-benchmark.mjs's fixed currentDate/utcOffset):
// Tuesday, 2026-07-14, 9:00 AM America/New_York (-04:00). All expected dates/times
// below are computed from this anchor via real Date arithmetic (see localISO), never
// hand-typed, to avoid baking a date-math mistake into the test itself.
//
// Run via the existing benchmark runner (it merges this corpus in automatically):
//   node scripts/ai-agent-model-benchmark.mjs --list
//   node scripts/ai-agent-model-benchmark.mjs --keys=cc-a01,cc-d03
//   node scripts/ai-agent-model-benchmark.mjs > report.json

// NOTE: deliberately does not import scenario()/user() from
// ai-agent-model-benchmark-corpus.mjs — that file imports this one to merge these
// scenarios into MODEL_BENCHMARK_SCENARIOS, and a two-way `const` import cycle
// between ES modules throws (temporal dead zone) rather than resolving. These are
// small enough to duplicate locally; keep them in sync with the originals by eye.
function scenario(input) {
  return Object.freeze({
    expectedKinds: [],
    expectedTools: [],
    context: {},
    ...input,
  })
}

function user(content) {
  return [{ role: 'user', content }]
}

const ANCHOR_YEAR = 2026
const ANCHOR_MONTH = 7 // July (1-indexed)
const ANCHOR_DAY = 14 // Tuesday

function localISO(daysFromToday, hour, minute = 0) {
  const d = new Date(Date.UTC(ANCHOR_YEAR, ANCHOR_MONTH - 1, ANCHOR_DAY + daysFromToday))
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  const mi = String(minute).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:00-04:00`
}

function dateOnly(daysFromToday) {
  return localISO(daysFromToday, 0, 0).slice(0, 10)
}

function startDateMatches(plan, daysFromToday) {
  return typeof plan?.args?.start === 'string' && plan.args.start.slice(0, 10) === dateOnly(daysFromToday)
}

function startsAt(plan, daysFromToday, hour, minute = 0) {
  return plan?.args?.start === localISO(daysFromToday, hour, minute) &&
    (plan?.args?.end == null || plan.args.end > plan.args.start)
}

function endsAt(plan, daysFromToday, hour, minute = 0) {
  return plan?.args?.end === localISO(daysFromToday, hour, minute)
}

function startHour(plan) {
  const m = /T(\d{2}):(\d{2})/.exec(String(plan?.args?.start ?? ''))
  return m ? Number(m[1]) + Number(m[2]) / 60 : null
}

function hourBetween(plan, min, max) {
  const h = startHour(plan)
  return h !== null && h >= min && h <= max
}

function durationMinutes(plan) {
  const start = Date.parse(plan?.args?.start ?? '')
  const end = Date.parse(plan?.args?.end ?? '')
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return (end - start) / 60000
}

function reasonableDuration(plan, min = 15, max = 240) {
  const d = durationMinutes(plan)
  return d !== null && d >= min && d <= max
}

function titleIncludes(plan, ...terms) {
  const title = String(plan?.args?.title ?? '').toLowerCase()
  return terms.some((t) => title.includes(t.toLowerCase()))
}

function create(key, text, { day, hour, minute = 0, endHour, endMinute = 0, duration, hourMin, hourMax, titleTerms, dateOnlyOnly = false }) {
  return scenario({
    key,
    category: 'create',
    page: 'calendar',
    messages: user(text),
    expectedTools: ['calendar.create'],
    expectation: text,
    validate(plan) {
      if (!titleIncludes(plan, ...titleTerms)) return false
      if (dateOnlyOnly) return startDateMatches(plan, day)
      if (hourMin != null) return startDateMatches(plan, day) && hourBetween(plan, hourMin, hourMax)
      if (endHour != null) return startsAt(plan, day, hour, minute) && endsAt(plan, day, endHour, endMinute)
      if (duration) return startsAt(plan, day, hour, minute) && reasonableDuration(plan, duration[0], duration[1])
      return startsAt(plan, day, hour, minute)
    },
  })
}

function ambiguous(key, text) {
  return scenario({
    key,
    category: 'create',
    page: 'calendar',
    messages: user(text),
    expectedKinds: ['clarify', 'defer'],
    expectedTools: [],
    expectation: `${text} — genuinely underspecified; should ask rather than guess.`,
  })
}

export const CALENDAR_CREATE_BENCHMARK_CORPUS_VERSION = 'casa-calendar-create-v1'

export const CALENDAR_CREATE_BENCHMARK_SCENARIOS = Object.freeze([
  // ---- A: explicit everything (12) — baseline sanity, always creatable ----
  create('cc-a01', "Add a dentist appointment for Dr. Patel on Thursday, July 16th from 10 to 11 am.", { day: 2, hour: 10, endHour: 11, titleTerms: ['dentist'] }),
  create('cc-a02', "Schedule a meeting called Budget Review on Friday July 17 from 2pm to 3pm.", { day: 3, hour: 14, endHour: 15, titleTerms: ['budget'] }),
  create('cc-a03', "Create an event: Sarah's birthday party, Saturday July 18th, 3 to 5 pm.", { day: 4, hour: 15, endHour: 17, titleTerms: ['birthday'] }),
  create('cc-a04', "Book 'Oil change' for Wednesday July 15 at 9:30am, should take half an hour.", { day: 1, hour: 9, minute: 30, endHour: 10, endMinute: 0, titleTerms: ['oil'] }),
  create('cc-a05', "Add lunch with Gordon this Wednesday at noon, we'll be done by 1.", { day: 1, hour: 12, endHour: 13, titleTerms: ['gordon'] }),
  create('cc-a06', "Put 'Parent-teacher conference' on the calendar for Monday July 20 at 4:15pm for 20 minutes.", { day: 6, hour: 16, minute: 15, endHour: 16, endMinute: 35, titleTerms: ['parent', 'conference'] }),
  create('cc-a07', "Schedule 'Vet checkup for Bella' Thursday July 16 at 1pm to 1:45pm.", { day: 2, hour: 13, endHour: 13, endMinute: 45, titleTerms: ['vet', 'bella'] }),
  create('cc-a08', "Create a calendar event titled 'Piano recital' for Sunday July 19th, starts at 4pm ends at 6pm.", { day: 5, hour: 16, endHour: 18, titleTerms: ['piano', 'recital'] }),
  create('cc-a09', "Add 'Car inspection' to the calendar, Tuesday July 21st, 11am sharp, done by noon.", { day: 7, hour: 11, endHour: 12, titleTerms: ['inspection', 'car'] }),
  create('cc-a10', "Put 'Company picnic' on the calendar Saturday July 25 from 12pm to 4pm.", { day: 11, hour: 12, endHour: 16, titleTerms: ['picnic'] }),
  create('cc-a11', "Schedule 'Owen's orthodontist' for Wednesday July 22 at 3:30, wrapping up at 4:15.", { day: 8, hour: 15, minute: 30, endHour: 16, endMinute: 15, titleTerms: ['owen', 'orthodontist'] }),
  create('cc-a12', "Add an event: 'Closing on the house', Friday July 31st, 10am to 11:30am.", { day: 17, hour: 10, endHour: 11, endMinute: 30, titleTerms: ['closing', 'house'] }),

  // ---- B: relative date words (15) ----
  create('cc-b01', "Add a haircut appointment for tomorrow at 2pm, should take 45 minutes.", { day: 1, hour: 14, duration: [40, 50], titleTerms: ['haircut'] }),
  create('cc-b02', "Put dinner with the Martinez family on for tonight at 7.", { day: 0, hour: 19, duration: [45, 150], titleTerms: ['martinez', 'dinner'] }),
  create('cc-b03', "Can you add a coffee catch-up with Priya for the day after tomorrow at 10am?", { day: 2, hour: 10, duration: [15, 90], titleTerms: ['priya', 'coffee'] }),
  create('cc-b04', "Book the car wash for this Friday at 9am.", { day: 3, hour: 9, duration: [15, 60], titleTerms: ['car wash'] }),
  create('cc-b05', "We need a dentist visit on this Saturday afternoon around 1.", { day: 4, hour: 13, duration: [15, 90], titleTerms: ['dentist'] }),
  create('cc-b06', "Add soccer practice for next Monday at 5pm.", { day: 6, hour: 17, duration: [30, 120], titleTerms: ['soccer'] }),
  create('cc-b07', "Set up movers for two weeks from today, around 8am.", { day: 14, hour: 8, duration: [30, 240], titleTerms: ['mover'] }),
  create('cc-b08', "Add 'Return library books' due a week from Thursday.", { day: 9, dateOnlyOnly: true, titleTerms: ['library'] }),
  create('cc-b09', "Book the plumber for the first of next month, morning if possible.", { day: 18, hourMin: 6, hourMax: 12, titleTerms: ['plumber'] }),
  create('cc-b10', "Add 'Family reunion planning call' for a week from today at 6pm.", { day: 7, hour: 18, duration: [15, 90], titleTerms: ['reunion', 'family'] }),
  create('cc-b11', "Put 'Return rental car' on the calendar for 10 days from now, before noon.", { day: 10, hourMin: 0, hourMax: 12, titleTerms: ['rental', 'car'] }),
  create('cc-b12', "Schedule the roof inspection for the Friday after next, late morning.", { day: 10, hourMin: 10, hourMax: 12, titleTerms: ['roof', 'inspection'] }),
  create('cc-b13', "Add 'Anniversary dinner' for this Sunday evening around 6:30.", { day: 5, hour: 18, minute: 30, duration: [45, 180], titleTerms: ['anniversary'] }),
  create('cc-b14', "We need 'Tire rotation' booked for a week from this Wednesday at 8am.", { day: 8, hour: 8, duration: [15, 90], titleTerms: ['tire'] }),
  create('cc-b15', "Add 'Museum trip' for the last Saturday of July.", { day: 11, dateOnlyOnly: true, titleTerms: ['museum'] }),

  // ---- C: time-of-day words with no explicit clock time (10) ----
  create('cc-c01', "Add 'Grocery run' tomorrow morning.", { day: 1, hourMin: 6, hourMax: 11, titleTerms: ['grocery'] }),
  create('cc-c02', "Schedule 'Team sync' this Thursday afternoon.", { day: 2, hourMin: 12, hourMax: 17, titleTerms: ['sync', 'team'] }),
  create('cc-c03', "Put 'Family game night' on for this Friday evening.", { day: 3, hourMin: 17, hourMax: 22, titleTerms: ['game night'] }),
  create('cc-c04', "Add 'Late study session' for tonight.", { day: 0, hourMin: 19, hourMax: 23, titleTerms: ['study'] }),
  create('cc-c05', "Book 'Dentist' for next Monday morning.", { day: 6, hourMin: 7, hourMax: 12, titleTerms: ['dentist'] }),
  create('cc-c06', "Schedule lunch with Dad this Wednesday around lunchtime.", { day: 1, hourMin: 11, hourMax: 14, titleTerms: ['dad'] }),
  create('cc-c07', "Add 'Drop off donations' for this Saturday, first thing in the morning.", { day: 4, hourMin: 6, hourMax: 9, titleTerms: ['donation'] }),
  create('cc-c08', "Put 'Wind down / early bedtime prep' for tonight, later in the evening.", { day: 0, hourMin: 20, hourMax: 23, titleTerms: ['wind down', 'bedtime'] }),
  create('cc-c09', "Schedule 'Quarterly review' for this Thursday, right after lunch.", { day: 2, hourMin: 12, hourMax: 14, titleTerms: ['quarterly', 'review'] }),
  create('cc-c10', "Add 'Pick up dry cleaning' for tomorrow, end of day.", { day: 1, hourMin: 16, hourMax: 20, titleTerms: ['dry cleaning'] }),

  // ---- D: past-time rollover — "now" is 9:00 AM local (8) ----
  create('cc-d01', "Schedule a call with the bank at 8am.", { day: 1, hour: 8, titleTerms: ['bank'] }),
  create('cc-d02', "Book a haircut for 8:30am.", { day: 1, hour: 8, minute: 30, titleTerms: ['haircut'] }),
  create('cc-d03', "Add 'Morning walk' at 7am.", { day: 1, hour: 7, titleTerms: ['walk'] }),
  create('cc-d04', "Put 'Yoga class' at 8:45am on the calendar.", { day: 1, hour: 8, minute: 45, titleTerms: ['yoga'] }),
  create('cc-d05', "Add 'Team meeting' at 9:15am.", { day: 0, hour: 9, minute: 15, titleTerms: ['team meeting', 'meeting'] }),
  create('cc-d06', "Schedule 'Dentist' at 3pm.", { day: 0, hour: 15, titleTerms: ['dentist'] }),
  create('cc-d07', "Book 'Quick call with the vet' at 10am.", { day: 0, hour: 10, titleTerms: ['vet'] }),
  create('cc-d08', "Add 'Drop the kids' at 8.", { day: 1, hour: 8, titleTerms: ['drop'] }),

  // ---- E: implicit duration inference (10) ----
  create('cc-e01', "Add coffee with Sarah at 10 this Wednesday.", { day: 1, hour: 10, duration: [15, 90], titleTerms: ['sarah', 'coffee'] }),
  create('cc-e02', "Put 'Dentist' on the calendar Thursday at 2.", { day: 2, hour: 14, duration: [20, 90], titleTerms: ['dentist'] }),
  create('cc-e03', "Schedule 'Birthday party for Liv' Saturday at 3.", { day: 4, hour: 15, duration: [60, 240], titleTerms: ['liv', 'birthday'] }),
  create('cc-e04', "Add 'Quick sync with the contractor' tomorrow at 11.", { day: 1, hour: 11, duration: [10, 60], titleTerms: ['contractor'] }),
  create('cc-e05', "Book 'Owen's checkup' for next Monday at 9.", { day: 6, hour: 9, duration: [15, 90], titleTerms: ['owen'] }),
  create('cc-e06', "Put 'Movie night' on for Friday at 7.", { day: 3, hour: 19, duration: [60, 240], titleTerms: ['movie'] }),
  create('cc-e07', "Schedule 'Call with the accountant' Wednesday at 1.", { day: 1, hour: 13, duration: [15, 90], titleTerms: ['accountant'] }),
  create('cc-e08', "Add 'Playdate for the kids' Saturday at 10.", { day: 4, hour: 10, duration: [60, 240], titleTerms: ['playdate'] }),
  create('cc-e09', "Book 'Trim at the salon' Thursday at 4:30.", { day: 2, hour: 16, minute: 30, duration: [20, 90], titleTerms: ['salon', 'trim', 'hair'] }),
  create('cc-e10', "Put 'Dinner reservation' on for Friday at 7:30.", { day: 3, hour: 19, minute: 30, duration: [60, 180], titleTerms: ['dinner'] }),

  // ---- F: AM/PM resolvable from context (6) ----
  create('cc-f01', "Call the vet Thursday at 2, right after lunch.", { day: 2, hour: 14, titleTerms: ['vet'] }),
  create('cc-f02', "Dentist appointment Friday at 9, first thing in the morning.", { day: 3, hour: 9, titleTerms: ['dentist'] }),
  create('cc-f03', "Movie night Saturday at 7.", { day: 4, hour: 19, titleTerms: ['movie'] }),
  create('cc-f04', "Early meeting Wednesday at 7, before the kids wake up.", { day: 1, hour: 7, titleTerms: ['meeting'] }),
  create('cc-f05', "Book the babysitter for Friday at 6, right when we're heading out for date night.", { day: 3, hour: 18, titleTerms: ['babysitter'] }),
  create('cc-f06', "Add 'Sunrise hike' Saturday at 6 in the morning.", { day: 4, hour: 6, titleTerms: ['hike'] }),

  // ---- F: genuinely ambiguous — should ask, not guess (4, control) ----
  ambiguous('cc-f07', "Add 'call the vet' Thursday at 2."),
  ambiguous('cc-f08', "Put 'meeting with the contractor' on for Friday at 8."),
  ambiguous('cc-f09', "Schedule 'appointment' for Wednesday at 3."),
  ambiguous('cc-f10', "Add 'thing with the Petersons' Saturday at 9."),

  // ---- G: conversational filler / STT noise / texting shorthand (12) ----
  create('cc-g01', "um can you like, put, i dunno, dinner with the Martinez family on the calendar for like this coming Saturday around 6ish", { day: 4, hourMin: 17, hourMax: 19, titleTerms: ['martinez'] }),
  create('cc-g02', "uh yeah so tuesday morning I got a dentist thing at ten", { day: 0, hour: 10, titleTerms: ['dentist'] }),
  create('cc-g03', "sched soccer practice thurs 5pm", { day: 2, hour: 17, duration: [30, 120], titleTerms: ['soccer'] }),
  create('cc-g04', "put appt for the vet sat @ 11am plz", { day: 4, hour: 11, duration: [15, 90], titleTerms: ['vet'] }),
  create('cc-g05', "hey casa add 'pickup dry cleaning' friday around 4", { day: 3, hour: 16, duration: [10, 60], titleTerms: ['dry clean'] }),
  create('cc-g06', "ok so i need u to put owen's dentist thing on the calendar for this coming wed at 9 in the morning", { day: 1, hour: 9, titleTerms: ['owen', 'dentist'] }),
  create('cc-g07', "can u add lunch w mom sun noon", { day: 5, hour: 12, duration: [30, 120], titleTerms: ['mom'] }),
  create('cc-g08', "book the eye doctor thurs afternoon around 2ish", { day: 2, hourMin: 13, hourMax: 15, titleTerms: ['eye'] }),
  create('cc-g09', "put down 'car pickup from the shop' fri morning like 9", { day: 3, hour: 9, duration: [10, 60], titleTerms: ['car'] }),
  create('cc-g10', "add a thing - piano lesson - wednesday 430pm", { day: 1, hour: 16, minute: 30, duration: [30, 60], titleTerms: ['piano'] }),
  create('cc-g11', "yo can you schedule my haircut for saturday at 1030", { day: 4, hour: 10, minute: 30, duration: [20, 60], titleTerms: ['haircut'] }),
  create('cc-g12', "put 'game night with the neighbors' on the books for fri at 7pm", { day: 3, hour: 19, duration: [60, 240], titleTerms: ['game night', 'neighbors'] }),

  // ---- H: family-member references (8) — 'Alex' and 'Sam' match the harness's injected family context ----
  create('cc-h01', "Add Alex's dentist appointment for Thursday at 10am.", { day: 2, hour: 10, titleTerms: ['alex'] }),
  create('cc-h02', "Put Sam's soccer practice on the calendar for Friday at 5pm.", { day: 3, hour: 17, titleTerms: ['sam'] }),
  create('cc-h03', "Schedule a checkup for Alex next Monday at 9am.", { day: 6, hour: 9, titleTerms: ['alex'] }),
  create('cc-h04', "Add 'Sam and Alex's joint piano recital' for Sunday at 4pm.", { day: 5, hour: 16, titleTerms: ['piano', 'recital'] }),
  create('cc-h05', "Book Sam's orthodontist for Wednesday at 2pm.", { day: 1, hour: 14, titleTerms: ['sam'] }),
  create('cc-h06', "Put 'Pick up Alex from practice' on for Thursday at 6pm.", { day: 2, hour: 18, titleTerms: ['alex'] }),
  create('cc-h07', "Add 'Sam's birthday dinner' for Saturday at 6:30pm.", { day: 4, hour: 18, minute: 30, titleTerms: ['sam'] }),
  create('cc-h08', "Schedule 'Parent meeting about Alex' for Friday at 3:30pm.", { day: 3, hour: 15, minute: 30, titleTerms: ['alex'] }),

  // ---- I: recurring language, lenient (5) — the planner's calendar.create tool has no
  // recurrence args in this module, so these only check it creates a sane FIRST
  // occurrence without asking; recurrence correctness itself is a different subsystem
  // (recurrence_v2) not exercised by this endpoint. ----
  create('cc-i01', "Add soccer practice every Tuesday at 5pm, starting this week.", { day: 0, hourMin: 16, hourMax: 18, titleTerms: ['soccer'] }),
  create('cc-i02', "Schedule piano lessons every Wednesday at 4, starting next week.", { day: 8, hourMin: 15, hourMax: 17, titleTerms: ['piano'] }),
  create('cc-i03', "Put a weekly team meeting on Mondays at 9am, starting this coming Monday.", { day: 6, hourMin: 8, hourMax: 10, titleTerms: ['meeting'] }),
  create('cc-i04', "Add trash pickup reminder every Friday morning, starting this Friday.", { day: 3, hourMin: 6, hourMax: 10, titleTerms: ['trash'] }),
  create('cc-i05', "Schedule book club every other Thursday at 7pm, starting this Thursday.", { day: 2, hourMin: 18, hourMax: 20, titleTerms: ['book club'] }),

  // ---- J: genuinely too underspecified — should ask, not guess (10, control group) ----
  ambiguous('cc-j01', "Schedule something with the kids."),
  ambiguous('cc-j02', "Put my appointment on the calendar."),
  ambiguous('cc-j03', "Add the thing we talked about to the calendar."),
  ambiguous('cc-j04', "Block off some time next week."),
  ambiguous('cc-j05', "Add an event for later."),
  ambiguous('cc-j06', "Schedule a thing for the weekend."),
  ambiguous('cc-j07', "Put something on the calendar for when I'm free."),
  ambiguous('cc-j08', "Add an appointment."),
  ambiguous('cc-j09', "Schedule a reminder for stuff I need to do."),
  ambiguous('cc-j10', "Add an event with everyone sometime soon."),
])
