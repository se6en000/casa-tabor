// Conversation situations for the family assistant (Jake, 2026-09-26: "handle the gist of
// the ask, not the exact phrasing"). Each situation is a conversation shape, bound to the
// family's real calendar at run time. Each turn has what the person MEANS (used to write
// fresh phrasings), a few `say` phrasings (the dev set; the held-out set lives in
// heldout.mjs), and the outcome that counts — a change card checked by its content, or an
// answer graded on its gist. Nothing here depends on one wording.

const at = (iso, minutes) => new Date(new Date(iso).getTime() + minutes * 60e3).toISOString()

/** A weekday a few days out, by name ("Tuesday"), with its local date. */
function dayAhead(world, days) {
  const d = new Date(world.now.getTime() + days * 86400e3)
  const p = world.localParts(d.toISOString())
  return { name: p.weekday, date: p.date }
}

/** Days ahead (not today) with at least `min` timed things on them. */
function busyDays(world, min) {
  return [...world.byDay.entries()]
    .filter(([date, list]) => date > world.todayLocal && list.length >= min)
    .map(([date, list]) => ({ date, name: list[0].local.weekday, events: list }))
}

// ── Card checks: each returns null when the card is right, or what's wrong. ──

const localOf = (world, iso) => (iso ? world.localParts(iso) : null)
const checks = {
  startsAt: (hhmm, date) => (card, { world }) => {
    const p = localOf(world, card.args.start)
    if (!p) return 'no start time'
    if (p.hhmm !== hhmm) return `starts ${p.hhmm}, not ${hhmm}`
    if (date && p.date !== date) return `on ${p.date}, not ${date}`
    return null
  },
  withPeople: (names) => (card) => {
    const have = [...(card.args.members ?? []), ...(card.args.members_add ?? [])].map((n) => String(n).toLowerCase())
    const missing = names.filter((n) => !have.some((h) => h.includes(n.toLowerCase())))
    return missing.length ? `missing ${missing.join(', ')}` : null
  },
  placeLike: (re) => (card) => (re.test(`${card.args.location ?? ''} ${card.args.location_name ?? ''} ${card.args.address ?? ''}`) ? null : `place is "${card.args.location ?? card.args.address ?? ''}"`),
  target: (id) => (card) => (card.args.id === id || card.args.event_id === id ? null : `changes ${card.args.id ?? card.args.event_id ?? 'nothing named'}, not the right event`),
  movedTo: (iso) => (card) => (card.args.start && Math.abs(Date.parse(card.args.start) - Date.parse(iso)) < 60e3 ? null : `start ${card.args.start ?? 'unchanged'}, wanted ${iso}`),
  driverIs: (name) => (card) => {
    const said = JSON.stringify([card.args.driver_name, card.args.driver_leg1, card.args.driver_leg2, card.args.driver, card.args.drivers] ?? '').toLowerCase()
    return said.includes(name.toLowerCase()) ? null : `driver not ${name}`
  },
  newDraft: () => (card) => (card.args.id ? 'changes an existing event instead of the draft' : null),
}

export const SITUATIONS = [
  {
    id: 'draft-place-then-time',
    gist: 'While an add is being drafted, what the person says next refines that same draft.',
    bind: (w) => w.kids[0] && { kid: w.kids[0].name, day: dayAhead(w, 3), place: 'Palm Beach Pediatric Dentistry' },
    turns: [
      {
        means: 'asks to add a dentist appointment for {kid} on {day} at 3:30 in the afternoon',
        say: ['Add a dentist appointment for {kid} on {day} at 3:30', 'put {kid} down for the dentist {day} 3:30pm', 'can you schedule {kid} a dentist visit {day} afternoon at 3:30'],
        expect: { card: 'create_event', checks: (b) => [checks.newDraft(), checks.withPeople([b.kid]), checks.startsAt('15:30', b.day.date)] },
      },
      {
        means: 'tells it where that appointment is: {place}',
        say: ["It's at {place}", 'the place is {place}', 'oh and it is over at {place}'],
        expect: { card: 'create_event', sameDraft: true, checks: (b) => [checks.newDraft(), checks.placeLike(/pediatric/i), checks.startsAt('15:30', b.day.date), checks.withPeople([b.kid])] },
      },
      {
        means: 'changes the time of that same draft to 4 PM',
        say: ['actually make it 4', 'can we do 4pm instead', 'push it to four o clock'],
        expect: { card: 'create_event', sameDraft: true, checks: (b) => [checks.newDraft(), checks.startsAt('16:00', b.day.date), checks.placeLike(/pediatric/i)] },
      },
    ],
  },
  {
    id: 'draft-add-person',
    gist: 'Adding a person while drafting puts them on the draft, not on some other event.',
    bind: (w) => w.kids.length >= 2 && { kid: w.kids[2]?.name ?? w.kids[0].name, kid2: w.kids[0].name, day: dayAhead(w, 4) },
    turns: [
      {
        means: 'asks to add a haircut for {kid} on {day} at 4 PM',
        say: ['Add {kid} haircut {day} at 4', 'book a haircut for {kid} {day} 4pm', 'haircut for {kid} on {day} at four'],
        expect: { card: 'create_event', checks: (b) => [checks.newDraft(), checks.withPeople([b.kid]), checks.startsAt('16:00', b.day.date)] },
      },
      {
        means: 'says {kid2} should be on it too',
        say: ['add {kid2} too', '{kid2} is coming as well', 'and {kid2}'],
        expect: { card: 'create_event', sameDraft: true, checks: (b) => [checks.newDraft(), checks.withPeople([b.kid, b.kid2]), checks.startsAt('16:00', b.day.date)] },
      },
    ],
  },
  {
    id: 'draft-dropped-for-question',
    gist: 'Walking away from a draft to ask something else gets an answer, and adds nothing.',
    bind: (w) => {
      const ev = w.timed.find((e) => e.local.date > w.todayLocal && e.spoken.length > 3 && w.timed.filter((x) => x.spoken === e.spoken).length === 1)
      return w.kids[0] && ev && { kid: w.kids[0].name, day: dayAhead(w, 5), ev: ev.spoken, evDay: ev.local.weekday, facts: { title: ev.title, starts: ev.local.hhmm, date: ev.local.date } }
    },
    turns: [
      {
        means: 'asks to add a piano lesson for {kid} on {day} at 5 PM',
        say: ['add a piano lesson for {kid} {day} at 5', '{kid} has piano {day} at 5pm, put it in'],
        expect: { card: 'create_event' },
      },
      {
        means: 'drops that and instead asks what time the {ev} on {evDay} starts',
        say: ['never mind that. what time does the {ev} start on {evDay}?', 'forget it — when is {ev} {evDay}?', 'scratch that, what time is {ev} on {evDay}'],
        expect: { card: 'none', answer: 'Gives the start time of that event (see facts) and does not add or change anything.' },
      },
    ],
  },
  {
    id: 'read-then-another-day',
    gist: 'A short follow-up ("and the next day?") keeps asking the same question about another day.',
    bind: (w) => {
      const days = busyDays(w, 1)
      return days.length >= 2 && { dayA: days[0].name, dayB: days[1].name, facts: { [days[0].name]: w.allOn(days[0].date), [days[1].name]: w.allOn(days[1].date) } }
    },
    turns: [
      {
        means: 'asks what is on the calendar on {dayA}',
        say: ["What's on {dayA}?", 'what do we have going on {dayA}', 'anything happening {dayA}'],
        expect: { card: 'none', answer: 'Lists what is on the first day asked about (see facts); nothing is changed.' },
      },
      {
        means: 'asks the same thing about {dayB}, briefly',
        say: ['and {dayB}?', 'what about {dayB}', 'ok and {dayB}'],
        expect: { card: 'none', answer: 'Lists what is on the second day (see facts), not the first; nothing is changed.' },
      },
    ],
  },
  {
    id: 'question-about-the-first-one',
    gist: 'A question about something just listed stays a question — it never becomes a change.',
    bind: (w) => {
      const day = busyDays(w, 2)[0]
      if (!day) return null
      const first = day.events[0]
      return { day: day.name, facts: { onThatDay: w.allOn(day.date), firstTimedItem: first.title, itsDrivers: first.drivers, itsPeople: first.people } }
    },
    turns: [
      {
        means: 'asks what is on {day}',
        say: ["What's on {day}?", 'what does {day} look like', 'rundown for {day} please'],
        expect: { card: 'none', answer: 'Lists what is on that day (see facts).' },
      },
      {
        means: 'asks who is driving to the first thing it just listed',
        say: ['who is driving to the first one?', "who's taking them to the first thing", 'and who drives for that first one'],
        expect: { card: 'none', answer: 'Answers about the first listed item (see facts): names its driver, or says no driver is set. Proposes no change.' },
      },
    ],
  },
  {
    id: 'change-the-first-one',
    gist: 'A change to "the first one" changes the first thing just listed.',
    bind: (w) => {
      const day = busyDays(w, 2)[0]
      if (!day) return null
      const first = day.events[0]
      return { day: day.name, firstId: first.id, movedTo: at(first.start_time, 30), facts: { onThatDay: w.allOn(day.date) } }
    },
    turns: [
      {
        means: 'asks what is on {day}',
        say: ["What's on {day}?", 'what have we got {day}'],
        expect: { card: 'none', answer: 'Lists what is on that day (see facts).' },
      },
      {
        means: 'asks to move the first of those 30 minutes later',
        say: ['push the first one back half an hour', 'move the first thing 30 minutes later', 'make the first one start 30 min later'],
        expect: { card: 'update_event', checks: (b) => [checks.target(b.firstId), checks.movedTo(b.movedTo)] },
      },
    ],
  },
  {
    id: 'kid-outing-then-handoff',
    gist: 'Asking about a kid\'s outing a week out finds it; "can Kelly take her?" is about that same outing.',
    bind: (w) => {
      const ev = w.timed.find((e) => e.local.date > w.todayLocal && e.place && e.hasTrip && e.people.some((p) => w.kids.some((k) => k.name === p)) && e.spoken.length > 3)
      if (!ev || !w.parents[1]) return null
      const kid = ev.people.find((p) => w.kids.some((k) => k.name === p))
      const parent = w.parents.find((p) => !ev.drivers.includes(p.name))?.name ?? w.parents[1].name
      return { kid, parent, spoken: ev.spoken, weekday: ev.local.weekday, eventId: ev.id, facts: { title: ev.title, date: ev.local.date, starts: ev.local.hhmm, place: ev.place, drivers: ev.drivers } }
    },
    turns: [
      {
        means: 'asks whether anyone is driving {kid} to {spoken} on {weekday}',
        say: ['Is anyone driving {kid} to {spoken} on {weekday}?', 'who is taking {kid} to {spoken} {weekday}', 'do we have a ride for {kid} to {spoken} {weekday}'],
        expect: { card: 'none', answer: 'Finds that event on the calendar (see facts) and says who drives it, or that nobody is set yet. Does not claim it cannot see it.' },
      },
      {
        means: 'asks whether {parent} can take the kid to it',
        say: ['can {parent} take her?', 'what if {parent} drives', 'could {parent} do that one'],
        expect: {
          either: [
            { card: 'update_event', checks: (b) => [checks.target(b.eventId), checks.driverIs(b.parent)] },
            { card: 'none', answer: 'Talks about that same event (see facts) and whether the named parent can drive it, or offers to make them the driver.' },
          ],
        },
      },
    ],
  },
  {
    id: 'where-is-it',
    gist: '"Where is it?" after asking about an event means that event.',
    bind: (w) => {
      const ev = w.timed.find((e) => e.local.date > w.todayLocal && e.place && e.hasTrip && e.people.some((p) => w.kids.some((k) => k.name === p)) && e.spoken.length > 3)
      if (!ev) return null
      const kid = ev.people.find((p) => w.kids.some((k) => k.name === p))
      return { kid, spoken: ev.spoken, facts: { title: ev.title, date: ev.local.date, starts: ev.local.hhmm, place: ev.place } }
    },
    turns: [
      {
        means: "asks when {kid}'s next {spoken} is",
        say: ["When is {kid}'s next {spoken}?", 'when does {kid} have {spoken} next', "what time is {kid}'s {spoken}"],
        expect: { card: 'none', answer: 'Gives the day and time of that event (see facts).' },
      },
      {
        means: 'asks where that is',
        say: ['where is it?', 'and where is that', "what's the address"],
        expect: { card: 'none', answer: 'Says where that same event is (see facts: place).' },
      },
    ],
  },
  {
    id: 'which-one-then-answer',
    gist: 'When a change could mean two things it asks which; the answer finishes that change.',
    bind: (w) => {
      const day = busyDays(w, 2)[0]
      if (!day) return null
      const second = day.events[1]
      const local = w.localParts(second.start_time)
      return { day: day.name, secondTitle: second.title.split(/[:(]/)[0].trim(), secondId: second.id, date: local.date, facts: { onThatDay: w.allOn(day.date) } }
    },
    turns: [
      {
        means: 'asks to move "the thing on {day}" to 5 PM without saying which',
        say: ['move my thing on {day} to 5pm', 'can you shift the {day} thing to 5', 'push the {day} one to 5 pm'],
        expect: { card: 'none', answer: 'Asks which of the things on that day (see facts) is meant; changes nothing yet.' },
      },
      {
        means: 'answers that it is the {secondTitle}',
        say: ['the {secondTitle}', 'I mean {secondTitle}', '{secondTitle} one'],
        expect: { card: 'update_event', checks: (b) => [checks.target(b.secondId), checks.startsAt('17:00', b.date)] },
      },
    ],
  },
  {
    id: 'draft-cancelled',
    gist: 'Calling off a draft adds nothing and says so.',
    bind: (w) => w.kids[0] && { kid: w.kids[0].name, day: dayAhead(w, 6) },
    turns: [
      {
        means: 'asks to add a playdate for {kid} on {day} at 2 PM',
        say: ['add a playdate for {kid} {day} at 2', 'put a playdate on for {kid} {day} 2pm'],
        expect: { card: 'create_event' },
      },
      {
        means: 'calls it off',
        say: ['never mind, cancel that', "actually don't add it", 'forget it'],
        expect: { card: 'none', answer: 'Acknowledges that nothing was added.' },
      },
    ],
  },
]
